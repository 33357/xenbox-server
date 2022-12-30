import { BigNumber } from "ethers";

export function sleep(time: number) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

export function log(...args: any) {
  console.log(new Date().toLocaleString(), ...args);
}

export function bigToString(big: BigNumber, decimals: number) {
  let str = big.toString();
  const change = str.length - decimals;
  if (change > 0) {
    str = `${str.substring(0, change)}.${str.substring(change)}`;
  } else {
    for (let i = 0; i > change; i--) {
      str = `0${str}`;
    }
    str = `0.${str}`;
  }
  while (str[str.length - 1] == "0") {
    str = str.substring(0, str.length - 1);
  }
  if (str[str.length - 1] == ".") {
    str = str.substring(0, str.length - 1);
  }
  return str;
}
