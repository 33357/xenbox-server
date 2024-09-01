import { ethers } from 'ethers';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';

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
const contractAddress: string = '0x06450dEe7FD2Fb8E39061434BAbCFC05599a6Fb8';
const contract = new ethers.Contract(contractAddress, abi, provider);
const step = 500;
const xenStartBlockNumber = 15704871;
let db: Database | undefined;

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
    // const transactionFromMap = await getTransactionFromMap([
    //   ...rankEvents.map((rankEvent) => rankEvent.transactionHash),
    //   ...mintEvents.map((mintEvent) => mintEvent.transactionHash)
    // ]);
    // const transactionIdMap = await getTransactionIdMap([
    //   ...rankEvents.map((rankEvent) => rankEvent.transactionHash),
    //   ...mintEvents.map((mintEvent) => mintEvent.transactionHash)
    // ]);
    // const userIdMap = await getUserIdMap([
    //   ...rankEvents.map((rankEvent) => rankEvent.args!.user),
    //   ...mintEvents.map((mintEvent) => mintEvent.args!.user)
    // ]);

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
  // await db.exec(`
  //   CREATE TABLE IF NOT EXISTS users (
  //     id INTEGER PRIMARY KEY AUTOINCREMENT,
  //     address TEXT NOT NULL UNIQUE
  //   )
  // `);
  // await db.exec(`
  //   CREATE TABLE IF NOT EXISTS transactions (
  //     id INTEGER PRIMARY KEY AUTOINCREMENT,
  //     hash TEXT NOT NULL UNIQUE
  //   )
  // `);
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

async function main() {
  await openDB();
  await getAllEvents();
  await logDay();
  await db!.close();
}

main();

// async function insertUsers(addresses: string[]) {
//   await db!.run('BEGIN TRANSACTION');
//   const stmt = await db!.prepare(
//     'INSERT OR IGNORE INTO users (address) VALUES (?)'
//   );
//   addresses.forEach(async (address) => {
//     await stmt.run(address);
//   });
//   await stmt.finalize();
//   await db!.run('COMMIT', (err: any) => {
//     if (err) {
//       console.error('Error during commit', err.message);
//     } else {
//       console.log('Data inserted successfully');
//     }
//   });
// }

// async function insertTransactions(transactionHashs: string[]) {
//   await db!.run('BEGIN TRANSACTION');
//   const stmt = await db!.prepare(
//     'INSERT OR IGNORE INTO transactions (hash) VALUES (?)'
//   );
//   transactionHashs.forEach(async (transactionHash) => {
//     await stmt.run(transactionHash);
//   });
//   await stmt.finalize();
//   await db!.run('COMMIT', (err: any) => {
//     if (err) {
//       console.error('Error during commit', err.message);
//     } else {
//       console.log('Data inserted successfully');
//     }
//   });
// }

// async function getUserIdMap(addresses: string[]) {
//   await insertUsers(addresses);
//   const users = await db!.all(
//     `SELECT id, address FROM users WHERE address IN (${addresses
//       .map(() => '?')
//       .join(',')})`,
//     addresses
//   );
//   const userIdMap: { [address: string]: number } = {};
//   users.forEach((user) => {
//     userIdMap[user.address] = user.id;
//   });
//   return userIdMap;
// }

// async function getTransactionIdMap(transactionHashs: string[]) {
//   await insertTransactions(transactionHashs);
//   const transactions = await db!.all(
//     `SELECT id, hash FROM transactions WHERE hash IN (${transactionHashs
//       .map(() => '?')
//       .join(',')})`,
//     transactionHashs
//   );
//   const transactionIdMap: { [hash: string]: number } = {};
//   transactions.forEach((transaction) => {
//     transactionIdMap[transaction.hash] = transaction.id;
//   });
//   return transactionIdMap;
// }

// async function getTransactionFromMap(transactionHashs: string[]) {
//   transactionHashs = transactionHashs.filter((value, index, self) => {
//     return self.indexOf(value) === index;
//   });
//   const step = 5;
//   const transactionFromMap: { [transactionHash: string]: string } = {};
//   for (let i = 0; i < transactionHashs.length; i += step) {
//     const promises = [];
//     for (let j = 0; i + j < transactionHashs.length; j++) {
//       promises.push(
//         (await provider.getTransaction(transactionHashs[i + j])).from
//       );
//     }
//     const froms = await Promise.all(promises);
//     froms.forEach((from, index) => {
//       transactionFromMap[transactionHashs[i + index]] = from;
//     });
//   }
//   return transactionFromMap;
// }
