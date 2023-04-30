import express from 'express';
import http from 'http';
import { port, config } from '../config';
import { bigToString, log, getSvg, sleep, Request } from './libs';
import {
  XenBoxClient,
  XenBox2Client,
  XenClient,
  XenBoxHelperClient,
  DeploymentInfo
} from 'xenbox-contract-sdk';
import { BigNumber, providers } from 'ethers';

const provider = new providers.JsonRpcProvider(config[1].provider);
const xenBox = new XenBoxClient(
  provider,
  DeploymentInfo[1]['XenBox'].proxyAddress
);
const xenBox2 = new XenBox2Client(
  provider,
  DeploymentInfo[1]['XenBox2'].proxyAddress
);
const xenBoxHelper = new XenBoxHelperClient(
  provider,
  DeploymentInfo[1]['XenBoxHelper'].proxyAddress
);
const xen = new XenClient(provider);
const request = new Request();
const app = express();
const httpServer = http.createServer(app);

const tokenMap: {
  [tokenId: number]: {
    name: string;
    description: string;
    image: string;
    lastTime: number;
    attributes: any[];
  };
} = {};
const token2Map: {
  [tokenId: number]: {
    name: string;
    description: string;
    image: string;
    lastTime: number;
    attributes: any[];
  };
} = {};
const rankMap: {
  [day: number]: {
    rank: number;
    lastTime: number;
  };
} = {};

app.all('*', function (req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', '*');
  res.header('Content-Type', 'application/json;charset=utf-8');
  next();
});

app.get('/api/token/*', async function (req, res) {
  try {
    const tokenId = Number(req.path.replace('/api/token/', ''));
    if (
      !tokenMap[tokenId] ||
      new Date().getTime() - tokenMap[tokenId].lastTime > 60 * 60 * 1000
    ) {
      const [token, fee] = await Promise.all([
        xenBox.tokenMap(tokenId),
        xenBox.fee()
      ]);
      const proxy = await xenBox.getProxyAddress(token.start);
      const [mint, userMints] = await Promise.all([
        xenBoxHelper.calculateMintReward(proxy),
        xen.userMints(proxy)
      ]);
      const amount = token.end.sub(token.start).toNumber();
      const mints = bigToString(
        mint
          .mul(amount)
          .mul(10000 - fee.toNumber())
          .div(10000),
        18
      ).split('.')[0];
      const time = new Date(userMints.maturityTs.toNumber() * 1000);
      tokenMap[tokenId] = {
        name: `XenBox ${amount}`,
        description: `${amount} xen account in this box`,
        lastTime: new Date().getTime(),
        image: getSvg(amount, mints, time),
        attributes: [
          {
            trait_type: 'Account',
            value: amount
          }
        ]
      };
    }
    res.send(tokenMap[tokenId]);
  } catch (error) {
    res.send(error);
  }
});

app.get('/api/token2/*', async function (req, res) {
  try {
    const tokenId = Number(req.path.replace('/api/token2/', ''));
    if (
      !token2Map[tokenId] ||
      new Date().getTime() - token2Map[tokenId].lastTime > 60 * 60 * 1000
    ) {
      const [token, fee100, fee50, fee20, fee10] = await Promise.all([
        xenBox2.tokenMap(tokenId),
        xenBox2.fee100(),
        xenBox2.fee50(),
        xenBox2.fee20(),
        xenBox2.fee10()
      ]);
      const proxy = await xenBox2.getProxyAddress(BigNumber.from(token.start));
      const [mint, userMints] = await Promise.all([
        xenBoxHelper.calculateMintReward(proxy),
        xen.userMints(proxy)
      ]);
      const amount = token.end - token.start;
      let fee;
      if (amount == 100) {
        fee = fee100;
      } else if (amount == 50) {
        fee = fee50;
      } else if (amount == 20) {
        fee = fee20;
      } else {
        fee = fee10;
      }
      const mints = bigToString(
        mint
          .mul(amount)
          .mul(10000 - fee.toNumber())
          .div(10000),
        18
      ).split('.')[0];
      const time = new Date(userMints.maturityTs.toNumber() * 1000);
      token2Map[tokenId] = {
        name: `XenBox2 ${amount}`,
        description: `${amount} xen account in this box`,
        lastTime: new Date().getTime(),
        image: getSvg(amount, mints, time),
        attributes: [
          {
            trait_type: 'Account',
            value: amount
          }
        ]
      };
    }
    res.send(token2Map[tokenId]);
  } catch (error) {
    res.send(error);
  }
});

app.get('/api/rank/*', async function (req, res) {
  try {
    const day = Number(req.path.replace('/api/rank/', ''));
    if (
      !rankMap[day] ||
      new Date().getTime() - rankMap[day].lastTime > 24 * 60 * 60 * 1000
    ) {
      const [thisRank, thisBlock] = await Promise.all([
        xen.globalRank(),
        provider.getBlockNumber()
      ]);
      const beforeBlock = thisBlock - (day * 24 * 60 * 60) / 12;
      const beforeRank = await xen.globalRank({ blockTag: beforeBlock });
      rankMap[day] = {
        rank: thisRank.toNumber() - beforeRank.toNumber(),
        lastTime: new Date().getTime()
      };
    }
    res.send(rankMap[day]);
  } catch (error) {
    res.send(error);
  }
});

httpServer.listen(port, async () => {
  log(`http://127.0.0.1:${port}`);
  await request.load();
  run();
});

async function run() {
  while (true) {
    const totalToken = (await xenBox.totalToken()).toNumber();
    for (let i = 0; i < totalToken; i++) {
      await request.update(xenBox.address(), i);
      await sleep(100);
    }

    const totalToken2 = (await xenBox2.totalToken()).toNumber();
    for (let i = 0; i < totalToken2; i++) {
      await request.update(xenBox2.address(), i);
      await sleep(100);
    }
    log(`run end`);
    await sleep(60 * 60 * 1000);
  }
}
