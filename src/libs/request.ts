import request from 'request';
import { log } from './';

export class Request {
  update(address: string, tokenId: number): Promise<Array<any>> {
    return new Promise((resolve, reject) => {
      try {
        log(
          `https://api.opensea.io/api/v1/asset/${address}/${tokenId}/?force_update=true`
        );
        request(
          {
            uri: `https://api.opensea.io/api/v1/asset/${address}/${tokenId}/?force_update=true`,
            headers: {
              authority: 'api.opensea.io',
              accept:
                'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
              'accept-language': 'zh',
              'sec-ch-ua':
                '"Not?A_Brand";v="8", "Chromium";v="108", "Google Chrome";v="108"',
              'sec-ch-ua-mobile': '?0',
              'sec-ch-ua-platform': '"macOS"',
              'sec-fetch-dest': 'document',
              'sec-fetch-mode': 'navigate',
              'sec-fetch-site': 'none',
              'sec-fetch-user': '?1',
              'upgrade-insecure-requests': '1',
              'user-agent':
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
            }
          },
          function (error: any, response: any, body: any) {
            if (error) {
              reject(error);
            }
            try {
              resolve(body);
            } catch (error) {
              reject(error);
            }
          }
        );
      } catch (error) {
        reject(error);
      }
    });
  }
}
