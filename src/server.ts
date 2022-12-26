import express from 'express';
import http from 'http';
import { port, config } from '../config';
import { Response } from 'express-serve-static-core';
import { log } from './libs';
import { XenClient, XenBoxClient, DeploymentInfo } from 'xenbox-sdk';
import { providers } from 'ethers';

const provider = new providers.JsonRpcProvider(config[1].provider);
const xenBox = new XenBoxClient(
  provider,
  DeploymentInfo[1]['XenBox'].proxyAddress
);
const xen = new XenClient(provider);

const app = express();
const httpServer = http.createServer(app);
const tokenMap: {
  [tokenId: string]: {
    name: string;
    description: string;
    image: string;
    time: number;
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
    const tokenId = req.path.replace('/token/', '');
    if (
      !tokenMap[tokenId] ||
      new Date().getTime() - tokenMap[tokenId].time > 24 * 60 * 60 * 1000
    ) {
      const token = await xenBox.tokenMap(tokenId);
      const account = token.end.sub(token.start);
      const proxyAddress = await xenBox.getProxyAddress(token.start);
      const xenData = await xen.userMints(proxyAddress);
      const term = xenData.term.toNumber();
      tokenMap[tokenId] = {
        name: `XenBox ${account.toNumber()}`,
        description: `${account.toNumber()} xen account in this box`,
        time: new Date().getTime(),
        image: `https://xenbox.store/box${account.toNumber()}.png`,
        attributes: [
          {
            trait_type: 'Account',
            value: account.toNumber()
          },
          {
            trait_type: 'Term',
            value: term
          }
        ]
      };
    }
    res.send(JSON.stringify(tokenMap[tokenId]));
  } catch (error) {
    res.send(error);
  }
});

httpServer.listen(port, async () => {
  log(`应用实例，访问地址为 http://127.0.0.1:${port}`);
});

function returnResJson(
  res: Response<any, Record<string, any>, number>,
  json: { status: string; data?: any; log?: any }
) {
  log(json);
  res.write(JSON.stringify(json));
  res.end();
}
