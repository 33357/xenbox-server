import dotenv from 'dotenv';

dotenv.config();

export const CONFIG: Config = {
  PROVIDER: {
    1: {
      HTTP_PROVIDER: process.env.ETH_PROVIDER
    },
    56: {
      HTTP_PROVIDER: process.env.BSC_PROVIDER
    },
    66: {
      HTTP_PROVIDER: process.env.OKC_PROVIDER
    },
    137: {
      HTTP_PROVIDER: process.env.POL_PROVIDER
    }
  },
  PORT: 8000
};

export interface Config {
  PROVIDER: {
    [CHAIN_ID: number]: {
      HTTP_PROVIDER: any;
    };
  };
  PORT: number;
}
