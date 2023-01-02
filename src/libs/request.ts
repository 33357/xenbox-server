import request from 'request';

export class Request {
  update(address: string, tokenId: number): Promise<Array<any>> {
    return new Promise((resolve, reject) => {
      try {
        request(
          `https://api.opensea.io/api/v1/asset/${address}/${tokenId}/?force_update=true`,
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
