import { BigNumber, ethers } from 'ethers';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import { keccak256, RLP } from 'ethers/lib/utils';

const abi: Array<any> = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'user', type: 'address' },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'rewardAmount',
        type: 'uint256'
      }
    ],
    name: 'MintClaimed',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'user', type: 'address' },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'term',
        type: 'uint256'
      },
      { indexed: false, internalType: 'uint256', name: 'rank', type: 'uint256' }
    ],
    name: 'RankClaimed',
    type: 'event'
  }
];
const provider = new ethers.providers.WebSocketProvider(
  'wss://eth-mainnet.blastapi.io/a251a0bd-88af-4cb7-9b0e-26d5fe664a63'
);
const axiosInstance: AxiosInstance = axios.create({
  baseURL:
    //'https://eth-mainnet.blastapi.io/a251a0bd-88af-4cb7-9b0e-26d5fe664a63',
    'https://eth.merkle.io',
  timeout: 30000
});
axiosRetry(axiosInstance, {
  retries: 3,
  retryDelay: (retryCount: number) => {
    console.log(`重试次数: ${retryCount}`);
    return retryCount * 1000;
  },
  retryCondition: () => {
    return true;
  }
});
const urlStep = 400;
const contractAddress: string = '0x06450dEe7FD2Fb8E39061434BAbCFC05599a6Fb8';
const contract = new ethers.Contract(contractAddress, abi, provider);
const step = 500;
const xenStartBlockNumber = 15704871;
let db: Database | undefined;

async function openDB() {
  db = await open({
    filename: './event.db',
    driver: sqlite3.Database
  });
  await db.exec(`
      CREATE TABLE IF NOT EXISTS rankEvents (
        blockNumber INTEGER NOT NULL,
        rank INTEGER NOT NULL,
        term INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        transactionHash TEXT NOT NULL UNIQUE
      )
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS mintEvents (
      blockNumber INTEGER NOT NULL,
      rewardAmount INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      transactionHash TEXT NOT NULL UNIQUE
    )
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      hash TEXT NOT NULL UNIQUE,
      fromAddr TEXT NOT NULL,
      toAddr TEXT NOT NULL,
      gas INTEGER NOT NULL,
      gasPrice INTEGER NOT NULL
    )
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS blocks (
      number INTEGER NOT NULL UNIQUE,
      baseFeePerGas INTEGER NOT NULL,
      gasUsed INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      transactions INTEGER NOT NULL,
      miner TEXT NOT NULL
    )
  `);
}

async function getAllEvents() {
  const currentBlockNumber = await provider.getBlockNumber();
  const maxBlockNumber = (
    await db!.all(`
      SELECT MAX(blockNumber) AS maxBlockNumber
      FROM rankEvents;
  `)
  )[0].maxBlockNumber;
  let startBlockNumber = maxBlockNumber
    ? maxBlockNumber + 1
    : xenStartBlockNumber;
  for (; startBlockNumber < currentBlockNumber; startBlockNumber += step + 1) {
    const targetBlockNumber =
      startBlockNumber + step > currentBlockNumber
        ? currentBlockNumber
        : startBlockNumber + step;
    const [rankEvents, mintEvents] = await Promise.all([
      contract.queryFilter(
        contract.filters.RankClaimed(),
        startBlockNumber,
        targetBlockNumber
      ),
      contract.queryFilter(
        contract.filters.MintClaimed(),
        startBlockNumber,
        targetBlockNumber
      )
    ]);

    const _mintEvents: {
      blockNumber: number;
      rewardAmount: number;
      amount: number;
      transactionHash: string;
    }[] = [];
    mintEvents.forEach((mintEvent) => {
      if (
        _mintEvents.length > 0 &&
        _mintEvents[_mintEvents.length - 1].transactionHash ===
          mintEvent.transactionHash
      ) {
        _mintEvents[_mintEvents.length - 1].rewardAmount += mintEvent
          .args!.rewardAmount.div((10 ** 18).toString())
          .toNumber();
        _mintEvents[_mintEvents.length - 1].amount += 1;
      } else {
        _mintEvents.push({
          blockNumber: mintEvent.blockNumber,
          rewardAmount: mintEvent
            .args!.rewardAmount.div((10 ** 18).toString())
            .toNumber(),
          amount: 1,
          transactionHash: mintEvent.transactionHash
        });
      }
    });
    await insertMintEvents(_mintEvents);

    const _rankEvents: {
      blockNumber: number;
      rank: number;
      term: number;
      amount: number;
      transactionHash: string;
    }[] = [];
    rankEvents.forEach((rankEvent) => {
      if (
        _rankEvents.length > 0 &&
        _rankEvents[_rankEvents.length - 1].transactionHash ===
          rankEvent.transactionHash
      ) {
        _rankEvents[_rankEvents.length - 1].amount += 1;
      } else {
        _rankEvents.push({
          blockNumber: rankEvent.blockNumber,
          rank: rankEvent.args!.rank.toNumber(),
          term: rankEvent.args!.term.toNumber(),
          amount: 1,
          transactionHash: rankEvent.transactionHash
        });
      }
    });
    await insertRankEvents(_rankEvents);
    console.log(
      `startBlockNumber: ${startBlockNumber}, startBlockNumber: ${targetBlockNumber}, percent: ${
        startBlockNumber - xenStartBlockNumber
      }/${currentBlockNumber - xenStartBlockNumber}`
    );
  }
}

async function insertRankEvents(
  rankEvents: {
    blockNumber: number;
    rank: number;
    term: number;
    amount: number;
    transactionHash: string;
  }[]
) {
  await db!.run('BEGIN TRANSACTION');
  const stmt = await db!.prepare(
    'INSERT INTO rankEvents (blockNumber, rank, term, amount, transactionHash) VALUES (?, ?, ?, ?, ?)'
  );
  rankEvents.forEach(async (rankEvent) => {
    await stmt.run(
      rankEvent.blockNumber,
      rankEvent.rank,
      rankEvent.term,
      rankEvent.amount,
      rankEvent.transactionHash
    );
  });
  await stmt.finalize();
  await db!.run('COMMIT', (err: any) => {
    if (err) {
      console.error('Error during commit', err.message);
    } else {
      console.log('Data inserted successfully');
    }
  });
}

async function insertMintEvents(
  mintEvents: {
    blockNumber: number;
    rewardAmount: number;
    amount: number;
    transactionHash: string;
  }[]
) {
  await db!.run('BEGIN TRANSACTION');
  const stmt = await db!.prepare(
    'INSERT INTO mintEvents (blockNumber, rewardAmount, amount, transactionHash) VALUES (?, ?, ?, ?)'
  );
  mintEvents.forEach(async (mintEvent) => {
    await stmt.run(
      mintEvent.blockNumber,
      mintEvent.rewardAmount,
      mintEvent.amount,
      mintEvent.transactionHash
    );
  });
  await stmt.finalize();
  await db!.run('COMMIT', (err: any) => {
    if (err) {
      console.error('Error during commit', err.message);
    } else {
      console.log('Data inserted successfully');
    }
  });
}

async function insertTransactions(
  transactions: {
    hash: string;
    from: string;
    to: string;
    gas: number;
    gasPrice: number;
  }[]
) {
  await db!.run('BEGIN TRANSACTION');
  const stmt = await db!.prepare(
    'INSERT INTO transactions (hash, fromAddr, toAddr, gas, gasPrice) VALUES (?, ?, ?, ?, ?)'
  );
  transactions.forEach(async (transaction) => {
    await stmt.run(
      transaction.hash,
      transaction.from,
      transaction.to,
      transaction.gas,
      transaction.gasPrice
    );
  });
  await stmt.finalize();
  await db!.run('COMMIT', (err: any) => {
    if (err) {
      console.error('Error during commit', err.message);
    } else {
      console.log('Data inserted successfully');
    }
  });
}

async function getAllTransactions() {
  const rankEvents = await db!.all(`
    SELECT r.*
    FROM rankEvents r
    LEFT JOIN transactions t ON r.transactionHash = t.hash
    WHERE t.hash IS NULL;
  `);
  await getTransactions(rankEvents);
  const mintEvents = await db!.all(`
    SELECT m.*
    FROM mintEvents m
    LEFT JOIN transactions t ON m.transactionHash = t.hash
    WHERE t.hash IS NULL;
  `);
  await getTransactions(mintEvents);
}

async function getTransactions(events: { transactionHash: string }[]) {
  for (let i = 0; i < events.length;) {
    const datas: any[] = [];
    for (let j = 0; j < urlStep && i + j < events.length; j++) {
      datas.push({
        jsonrpc: '2.0',
        id: 0,
        method: 'eth_getTransactionByHash',
        params: [events[i + j].transactionHash]
      });
    }
    try {
      const transactions: any[] = (await axiosInstance.post('', datas)).data;
      await insertTransactions(
        transactions.map((transaction) => {
          return {
            hash: transaction.result.hash,
            from: transaction.result.from,
            to: transaction.result.to
              ? transaction.result.to
              : computeAddress(
                  transaction.result.from,
                  transaction.result.nonce
                ),
            gas: BigNumber.from(transaction.result.gas).toNumber(),
            gasPrice: BigNumber.from(transaction.result.gasPrice).toNumber()
          };
        })
      );
    } catch (error) {
      console.log(error);
      continue;
    }
    console.log(`percent: ${i}/${events.length}`);
    i += urlStep;
  }
}

async function getBlocks(blockNumbers: number[]) {
  const skip = 100;
  const blocks = [];
  for (let i = 0; i < blockNumbers.length; i += skip) {
    const datas: any[] = [];
    for (let j = 0; j < skip && i + j < blockNumbers.length; j++) {
      datas.push({
        jsonrpc: '2.0',
        id: 0,
        method: 'eth_getBlockByNumber',
        params: [`0x${blockNumbers[i].toString(16)}`, false]
      });
    }
    blocks.push(...(await axios.post('', datas)).data);
  }
  return blocks;
}

async function logDay() {
  const xenStartTimeStamp = (await provider.getBlock(xenStartBlockNumber))
    .timestamp;
  let dayMap: {
    [day: string]: {
      rankAmount: number;
      termAmount: number;
      rewardAmount: number;
    };
  } = {};
  const rankEvents = await db!.all(`SELECT * FROM rankEvents;`);
  const mintEvents = await db!.all(`SELECT * FROM mintEvents;`);
  rankEvents.forEach((rankEvent) => {
    const rankTimeStamp =
      xenStartTimeStamp + (rankEvent.blockNumber - xenStartTimeStamp) * 12;
    const rankDay = new Date(rankTimeStamp * 1000).toLocaleDateString();
    const termTimeStamp = rankTimeStamp + rankEvent.term * 60 * 60 * 24;
    const termDay = new Date(termTimeStamp * 1000).toLocaleDateString();
    if (!dayMap[rankDay]) {
      dayMap[rankDay] = {
        rankAmount: rankEvent.amount,
        termAmount: 0,
        rewardAmount: 0
      };
    } else {
      dayMap[rankDay].rankAmount += rankEvent.amount;
    }
    if (!dayMap[termDay]) {
      dayMap[termDay] = {
        rankAmount: 0,
        termAmount: rankEvent.amount,
        rewardAmount: 0
      };
    } else {
      dayMap[termDay].termAmount += rankEvent.amount;
    }
  });
  mintEvents.forEach((mintEvent) => {
    const mintTimeStamp =
      xenStartTimeStamp + (mintEvent.blockNumber - xenStartBlockNumber) * 12;
    const mintDay = new Date(mintTimeStamp * 1000).toLocaleDateString();
    if (!dayMap[mintDay]) {
      dayMap[mintDay] = {
        rankAmount: 0,
        termAmount: 0,
        rewardAmount: mintEvent.rewardAmount
      };
    } else {
      dayMap[mintDay].rewardAmount += mintEvent.rewardAmount;
    }
  });
  dayMap = Object.fromEntries(
    Object.entries(dayMap).sort(
      (a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime()
    )
  );
  Object.keys(dayMap).forEach((day) => {
    console.log(
      `${day}, rankAmount: ${dayMap[day].rankAmount}, termAmount: ${dayMap[day].termAmount}, rewardAmount: ${dayMap[day].rewardAmount}`
    );
  });
}

function computeAddress(senderAddress: string, nonce: string): string {
  if (nonce.length % 2 == 1) {
    nonce = nonce.replace('0x', '0x0');
  }
  const encoded = RLP.encode([senderAddress, nonce]);
  const hash = keccak256(encoded);
  const contractAddress = '0x' + hash.slice(26);
  return contractAddress;
}

async function main() {
  await openDB();
  // await getAllEvents();
  await getAllTransactions();
  // await logDay();
  await db!.close();
}

main();
