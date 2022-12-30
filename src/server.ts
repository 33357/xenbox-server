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
      const [token, fee] = await Promise.all([
        xenBox.tokenMap(tokenId),
        xenBox.fee()
      ]);
      const proxy = await xenBox.getProxyAddress(token.start);
      const [mint, userMints] = await Promise.all([
        xenBoxHelper.calculateMintReward(proxy),
        xen.userMints(proxy)
      ]);
      const mints = bigToString(
        mint.mul(10000 - fee.toNumber()).div(10000),
        18
      );
      const time = new Date(userMints.maturityTs.toNumber() * 1000);
      const account = token.end.sub(token.start).toNumber();
      tokenMap[tokenId] = {
        name: `XenBox ${account}`,
        description: `${account} xen account in this box`,
        lastTime: new Date().getTime(),
        image: getSvg(account, mints, time),
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
