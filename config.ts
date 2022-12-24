import dotenv from 'dotenv';

dotenv.config();

export const config: { [chain: number]: Config } = {
  1: {
    provider: process.env.provider
  },
};

export const port = 8000;

export interface Config {
  provider: any;
}
