import { log } from './';
import puppeteer, { Browser, Page } from 'puppeteer';

export class Request {
  browser?: Browser;
  page?: Page;

  async load() {
    this.browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    [this.page] = await this.browser.pages();
    await this.page.setUserAgent(
      'Mozilla/5.0 (Windows NT 5.1; rv:5.0) Gecko/20100101 Firefox/5.0'
    );
  }

  async update(address: string, tokenId: number): Promise<any> {
    const uri = `https://api.opensea.io/api/v1/asset/${address}/${tokenId}/?force_update=true`;
    log(uri);
    if (this.page) {
      await this.page.goto(uri, { waitUntil: 'networkidle0' });
      const bodyHTML = await this.page.evaluate(() => document.body.innerHTML);
      return bodyHTML;
    }
  }
}
