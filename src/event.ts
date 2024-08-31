import { BigNumber, ethers } from 'ethers';
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
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'user', type: 'address' },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256'
      },
      { indexed: false, internalType: 'uint256', name: 'term', type: 'uint256' }
    ],
    name: 'Staked',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'user', type: 'address' },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256'
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'reward',
        type: 'uint256'
      }
    ],
    name: 'Withdrawn',
    type: 'event'
  }
];
const provider = new ethers.providers.WebSocketProvider(
  'wss://eth-mainnet.blastapi.io/a251a0bd-88af-4cb7-9b0e-26d5fe664a63'
);
const contractAddress: string = '0x06450dEe7FD2Fb8E39061434BAbCFC05599a6Fb8';
const contract = new ethers.Contract(contractAddress, abi, provider);
const step = 500;
const startBlockNumber = 15704871;
let eventMap: {
  rankEvent: {
    blockNumber: number;
    rank: number;
    term: number;
    user: string;
  }[];
  mintEvent: { blockNumber: number; rewardAmount: string; user: string }[];
} = { rankEvent: [], mintEvent: [] };
let db: Database | undefined;

async function getAllEvents() {
  const currentBlockNumber = await provider.getBlockNumber();
  const maxBlockNumber = (
    await db!.all(`
    SELECT MAX(blockNumber) AS maxBlockNumber
    FROM rankEvents;
  `)
  )[0].maxBlockNumber;
  let _startBlockNumber = startBlockNumber;
  if (maxBlockNumber) {
    _startBlockNumber = maxBlockNumber + 1;
  }
  console.log(`startBlockNumber: ${_startBlockNumber}`);
  for (
    ;
    _startBlockNumber < currentBlockNumber;
    _startBlockNumber += step + 1
  ) {
    const [rankEvents, mintEvents] = await Promise.all([
      contract.queryFilter(
        contract.filters.RankClaimed(),
        _startBlockNumber,
        _startBlockNumber + step
      ),
      contract.queryFilter(
        contract.filters.MintClaimed(),
        _startBlockNumber,
        _startBlockNumber + step
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
    await insertRankEvents(
      rankEvents.map((rankEvent) => ({
        blockNumber: rankEvent.blockNumber,
        rank: rankEvent.args!.rank.toNumber(),
        term: rankEvent.args!.term.toNumber(),
        userId: userIdMap[rankEvent.args!.user],
        transactionId: transactionIdMap[rankEvent.transactionHash]
      }))
    );
    await insertMintEvents(
      mintEvents.map((mintEvent) => ({
        blockNumber: mintEvent.blockNumber,
        rewardAmount: mintEvent
          .args!.rewardAmount.div((10 ** 18).toString())
          .toNumber(),
        userId: userIdMap[mintEvent.args!.user],
        transactionId: transactionIdMap[mintEvent.transactionHash]
      }))
    );
    console.log(
      `${_startBlockNumber}, ${_startBlockNumber + step}, ${
        _startBlockNumber - startBlockNumber
      }/${currentBlockNumber - startBlockNumber}`
    );
    // if (_startBlockNumber - startBlockNumber > 1000) {
    //   break;
    // }
  }
}

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

async function insertRankEvents(
  rankEvents: {
    blockNumber: number;
    rank: number;
    term: number;
    userId: number;
    transactionId: number;
  }[]
) {
  await db!.run('BEGIN TRANSACTION');
  const stmt = await db!.prepare(
    'INSERT INTO rankEvents (blockNumber, rank, term, userId, transactionId) VALUES (?, ?, ?, ?, ?)'
  );
  rankEvents.forEach(async (rankEvent) => {
    await stmt.run(
      rankEvent.blockNumber,
      rankEvent.rank,
      rankEvent.term,
      rankEvent.userId,
      rankEvent.transactionId
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
    rewardAmount: BigNumber;
    userId: number;
    transactionId: number;
  }[]
) {
  await db!.run('BEGIN TRANSACTION');
  const stmt = await db!.prepare(
    'INSERT INTO mintEvents (blockNumber, rewardAmount, userId, transactionId) VALUES (?, ?, ?, ?)'
  );
  mintEvents.forEach(async (mintEvent) => {
    await stmt.run(
      mintEvent.blockNumber,
      mintEvent.rewardAmount,
      mintEvent.userId,
      mintEvent.transactionId
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

async function openDB() {
  db = await open({
    filename: './event.db',
    driver: sqlite3.Database
  });
  await db.exec(`
      CREATE TABLE IF NOT EXISTS rankEvents (
        blockNumber INTEGER NOT NULL,
        rankStart INTEGER NOT NULL,
        rankEnd INTEGER NOT NULL,
        term INTEGER NOT NULL,
        transactionHash TEXT NOT NULL UNIQUE
      )
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS mintEvents (
      blockNumber INTEGER NOT NULL,
      totalReward INTEGER NOT NULL,
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
  const startTimeStamp = (await provider.getBlock(startBlockNumber)).timestamp;
  let dayMap: {
    [day: string]: {
      rank: number;
      term: number;
      mint: number;
      reward: BigNumber;
    };
  } = {};
  eventMap.rankEvent.forEach((e) => {
    const rankTimeStamp =
      startTimeStamp + (e.blockNumber - startBlockNumber) * 12;
    const termTimeStamp = rankTimeStamp + e.term * 60 * 60 * 24;
    const rankDay = new Date(rankTimeStamp * 1000).toLocaleDateString();
    const termDay = new Date(termTimeStamp * 1000).toLocaleDateString();
    if (!dayMap[rankDay]) {
      dayMap[rankDay] = {
        rank: 1,
        term: 0,
        mint: 0,
        reward: BigNumber.from(0)
      };
    } else {
      dayMap[rankDay].rank += 1;
    }
    if (!dayMap[termDay]) {
      dayMap[termDay] = {
        rank: 0,
        term: 1,
        mint: 0,
        reward: BigNumber.from(0)
      };
    } else {
      dayMap[termDay].term += 1;
    }
  });
  eventMap.mintEvent.forEach((e) => {
    const mintTimeStamp =
      startTimeStamp + (e.blockNumber - startBlockNumber) * 12;
    const mintDay = new Date(mintTimeStamp * 1000).toLocaleDateString();
    if (!dayMap[mintDay]) {
      dayMap[mintDay] = {
        rank: 0,
        term: 0,
        mint: 1,
        reward: BigNumber.from(0)
      };
    } else {
      dayMap[mintDay].mint += 1;
    }
    dayMap[mintDay].reward = dayMap[mintDay].reward.add(e.rewardAmount);
  });
  dayMap = Object.fromEntries(
    Object.entries(dayMap).sort(
      (a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime()
    )
  );
  Object.keys(dayMap).forEach((day) => {
    console.log(
      `${day}, rank: ${dayMap[day].rank}, term: ${dayMap[day].term}, mint: ${
        dayMap[day].mint
      }, reward: ${dayMap[day].reward.div((10 ** 18).toString())}`
    );
  });
}

async function main() {
  await openDB();
  await getAllEvents();
  // logDay();
  await db!.close();
}

main();
