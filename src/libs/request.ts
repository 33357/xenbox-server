import axios from 'axios';
import { log } from './';

export class Request {
  async update(address: string, tokenId: number): Promise<any> {
    log(
      `https://api.opensea.io/api/v1/asset/${address}/${tokenId}/?force_update=true`
    );
    try {
      const res = await axios.get(
        `https://api.opensea.io/api/v1/asset/${address}/${tokenId}/?force_update=true`,
        {
          headers: {
            accept: '*/*',
            'accept-language': 'zh-CN,zh;q=0.9',
            'if-modified-since': 'Mon, 02 Jan 2023 03:27:26 GMT',
            'sec-ch-ua':
              '"Not?A_Brand";v="8", "Chromium";v="108", "Google Chrome";v="108"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'cross-site',
            Referer: 'https://www.nftrefreshmetadata.com/',
            'Referrer-Policy': 'strict-origin-when-cross-origin'
          }
        }
      );
      log(res.status);
    } catch (error) {
      log('error');
    }
  }
}
