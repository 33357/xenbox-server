import express from 'express';
import http from 'http';
import { port, config } from '../config';
import { bigToString, log, getSvg } from './libs';
import {
  XenBoxClient,
  XenClient,
  XenBoxHelperClient,
  DeploymentInfo
} from 'xenbox-sdk';
import { providers } from 'ethers';

const provider = new providers.JsonRpcProvider(config[1].provider);
const xenBox = new XenBoxClient(
  provider,
  DeploymentInfo[1]['XenBox'].proxyAddress
);
const xenBoxHelper = new XenBoxHelperClient(
  provider,
  DeploymentInfo[1]['XenBoxHelper'].proxyAddress
);
const xen = new XenClient(provider);

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

app.all('*', function (req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', '*');
  res.header('Content-Type', 'application/json;charset=utf-8');
  next();
});

app.get('/token/*', async function (req, res) {
  try {
    const tokenId = Number(req.path.replace('/token/', ''));
    if (
      !tokenMap[tokenId] ||
      new Date().getTime() - tokenMap[tokenId].lastTime > 60 * 60 * 1000
    ) {
      const token = await xenBox.tokenMap(tokenId);
      const account = token.end.sub(token.start).toNumber();
      const proxy = await xenBox.getProxyAddress(token.start);
      const mint = bigToString(
        await xenBoxHelper.calculateMintReward(proxy),
        18
      );
      const userMints = await xen.userMints(proxy);
      const time = new Date(userMints.maturityTs.toNumber() * 1000);
      tokenMap[tokenId] = {
        name: `XenBox ${account}`,
        description: `${account} xen account in this box`,
        lastTime: new Date().getTime(),
        image: getSvg(account, mint, time),
        attributes: [
          {
            trait_type: 'Account',
            value: account
          }
        ]
      };
    }
    res.send(tokenMap[tokenId]);
  } catch (error) {
    res.send(error);
  }
});

httpServer.listen(port, async () => {
  log(`http://127.0.0.1:${port}`);
});
