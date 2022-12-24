import express from 'express';
import http from 'http';
import { port,config } from '../config';
import { Response } from 'express-serve-static-core';
import { log } from './libs';
import { XenBoxClient, DeploymentInfo } from 'xenbox-sdk';
import { providers } from 'ethers';

const provider = new providers.JsonRpcProvider(config[1].provider);
const xenBox = new XenBoxClient(
  provider,
  DeploymentInfo[1]['XenBox'].proxyAddress
);

const app = express();
const httpServer = http.createServer(app);
const tokenMap: {
  [tokenId: string]: {
    name: string;
    description: string;
    image: string;
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
    if (!tokenMap[tokenId]) {
      const token = await xenBox.tokenMap(tokenId);
      const account = token.end.sub(token.start);
      if (account.eq(10)) {
        tokenMap[tokenId] = {
          name: 'XenBox 10',
          description: '10 xen account in this box',
          image: 'https://xenbox.store/1.png',
          attributes: [
            {
              trait_type: 'Account',
              value: 10
            }
          ]
        };
      } else if (account.eq(20)) {
        tokenMap[tokenId] = {
          name: 'XenBox 20',
          description: '20 xen account in this box',
          image: 'https://xenbox.store/2.png',
          attributes: [
            {
              trait_type: 'Account',
              value: 20
            }
          ]
        };
      } else if (account.eq(50)) {
        tokenMap[tokenId] = {
          name: 'XenBox 50',
          description: '50 xen account in this box',
          image: 'https://xenbox.store/3.png',
          attributes: [
            {
              trait_type: 'Account',
              value: 50
            }
          ]
        };
      } else if (account.eq(100)) {
        tokenMap[tokenId] = {
          name: 'XenBox 100',
          description: '100 xen account in this box',
          image: 'https://xenbox.store/4.png',
          attributes: [
            {
              trait_type: 'Account',
              value: 100
            }
          ]
        };
      }
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
