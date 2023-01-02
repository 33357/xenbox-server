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
      );
      log(res.status);
    } catch (error) {
      log(error);
    }
  }
}