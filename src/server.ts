import express from 'express';
import http from 'http';
import { CONFIG } from '../config';
import { bigToString, log, getSvg, sleep, Request } from './libs';
import {
  XenBoxClient,
  XenClient,
  DeploymentInfo
} from 'xenbox-sdk';
import {
  XenBoxUpgradeableClient,
  XenBoxHelperClient,
  DeploymentInfo as DeploymentInfo2
} from 'xenbox2-contract-sdk';
import { providers } from 'ethers';

const chainIdList = Object.keys(CONFIG.PROVIDER).map(e => { return Number(e) });
const providerMap: { [chainId: number]: providers.Provider } = {};
const xenBoxUpgradeableMap: { [chainId: number]: XenBoxUpgradeableClient } = {};
const xenBoxHelperMap: { [chainId: number]: XenBoxHelperClient } = {};
chainIdList.forEach((chainId) => {
  providerMap[chainId] = new providers.JsonRpcProvider(CONFIG.PROVIDER[chainId].HTTP_PROVIDER);
  xenBoxUpgradeableMap[chainId] = new XenBoxUpgradeableClient(
    providerMap[chainId],
    DeploymentInfo2[chainId]['XenBoxUpgradeable'].proxyAddress
  );
  xenBoxHelperMap[chainId] = new XenBoxHelperClient(
    providerMap[chainId],
    DeploymentInfo2[chainId]['XenBoxHelper'].proxyAddress
  );
})
const xenBox = new XenBoxClient(
  providerMap[1],
  DeploymentInfo[1]['XenBox'].proxyAddress
);
const xen = new XenClient(providerMap[1]);
const request = new Request();
const app = express();
const httpServer = http.createServer(app);

const tokenMap: {
  [chainId: number]: {
    [tokenId: number]: {
      name: string;
      description: string;
      image: string;
      lastTime: number;
      attributes: any[];
    };
  }
} = {};
const rankMap: {
  [chainId: number]: {
    [day: number]: {
      rank: number;
      lastTime: number;
    };
  }
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
    const [chainId, tokenId] = req.path.replace('/api/token/', '').split('/').map(e => {
      return Number(e);
    });
    if (
      !tokenMap[chainId][tokenId] ||
      new Date().getTime() - tokenMap[chainId][tokenId].lastTime > 60 * 60 * 1000
    ) {
      let userMints;
      let mint;
      let fee;
      let amount;
      if (chainId == 0) {
        const [token, _fee] = await Promise.all([
          xenBox.tokenMap(tokenId),
          xenBox.fee()
        ]);
        fee = _fee;
        const proxy = await xenBox.getProxyAddress(token.start);
        [mint, userMints] = await Promise.all([
          xenBoxHelperMap[1].calculateMintReward(proxy),
          xen.userMints(proxy)
        ]);
        amount = token.end.sub(token.start).toNumber();
      } else {
        const [token, fee100, fee50, fee20, fee10] = await Promise.all([
          xenBoxUpgradeableMap[chainId].tokenMap(tokenId),
          xenBoxUpgradeableMap[chainId].fee100(),
          xenBoxUpgradeableMap[chainId].fee50(),
          xenBoxUpgradeableMap[chainId].fee20(),
          xenBoxUpgradeableMap[chainId].fee10()
        ]);
        const proxy = await xenBoxUpgradeableMap[chainId].proxyAddress(tokenId);
        [mint, userMints] = await Promise.all([
          xenBoxHelperMap[chainId].calculateMintReward(proxy),
          xenBoxUpgradeableMap[chainId].userMints(tokenId)
        ]);
        amount = token.end - token.start;
        if (amount == 100) {
          fee = fee100;
        } else if (amount == 50) {
          fee = fee50;
        } else if (amount == 20) {
          fee = fee20;
        } else {
          fee = fee10;
        }
      }
      tokenMap[chainId][tokenId] = {
        name: `XenBox${chainId > 0 ? '2' : ''} ${amount}`,
        description: `${amount} xen account in this box`,
        lastTime: new Date().getTime(),
        image: getSvg(amount, bigToString(
          mint
            .mul(amount)
            .mul(10000 - fee.toNumber())
            .div(10000),
          18
        ).split('.')[0], new Date(userMints.maturityTs.toNumber() * 1000)),
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

app.get('/api/rank/*', async function (req, res) {
  try {
    const [chainId, day] = req.path.replace('/api/rank/', '').split('/').map(e => {
      return Number(e);
    });
    if (
      !rankMap[chainId][day] ||
      new Date().getTime() - rankMap[chainId][day].lastTime > 24 * 60 * 60 * 1000
    ) {
      const [thisRank, thisBlock] = await Promise.all([
        xen.globalRank(),
        providerMap[chainId].getBlockNumber()
      ]);
      const beforeBlock = thisBlock - (day * 24 * 60 * 60) / 12;
      const beforeRank = await xen.globalRank({ blockTag: beforeBlock });
      rankMap[chainId][day] = {
        rank: thisRank.toNumber() - beforeRank.toNumber(),
        lastTime: new Date().getTime()
      };
    }
    res.send(rankMap[day]);
  } catch (error) {
    res.send(error);
  }
});

httpServer.listen(CONFIG.PORT, async () => {
  log(`http://127.0.0.1:${CONFIG.PORT}`);
  await request.load();
  run();
});

async function run() {
  while (true) {
    const totalToken0 = (await xenBox.totalToken()).toNumber();
    for (let i = 0; i < totalToken0; i++) {
      await request.update(xenBox.address(), i);
      await sleep(100);
    }

    // const totalToken = (await xenBoxUpgradeableMap[1].totalToken()).toNumber();
    // for (let i = 0; i < totalToken; i++) {
    //   await request.update(xenBoxUpgradeableMap[1].address(), i);
    //   await sleep(100);
    // }
    log(`run end`);
    await sleep(60 * 60 * 1000);
  }
}
