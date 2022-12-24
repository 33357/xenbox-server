export function sleep(time: number) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

export function log(...args: any) {
  console.log(new Date().toLocaleString(), ...args);
}
