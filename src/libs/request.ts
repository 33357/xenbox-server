import axios from 'axios';
import { log } from './';
// Import puppeteer
import puppeteer from 'puppeteer';

// export class Request {
//   async update(address: string, tokenId: number): Promise<any> {
//     const uri = `https://api.opensea.io/api/v1/asset/${address}/${tokenId}/?force_update=true`
//     log(
//       uri
//     );
//     try {
//       const res = await axios.get(
//         uri
//       );
//       log(res.status);
//     } catch (error) {
//       log(error);
//     }
//   }
// }

export class Request {
  async update(address: string, tokenId: number): Promise<any> {
    const uri = `https://api.opensea.io/api/v1/asset/${address}/${tokenId}/?force_update=true`;
    log(uri);
    (async function main() {
      try {
        const browser = await puppeteer.launch({args: ['--no-sandbox']});
        const [page] = await browser.pages();
        
        await page.setUserAgent('Mozilla/5.0 (Windows NT 5.1; rv:5.0) Gecko/20100101 Firefox/5.0');
        await page.goto(uri, { waitUntil: 'networkidle0' });
        const bodyHTML = await page.evaluate(() => document.body.innerHTML);

        console.log(bodyHTML);

        await browser.close();
      } catch (err) {
        console.error(err);
      }
    })();
  }
}
