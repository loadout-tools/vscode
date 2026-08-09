import * as path from 'node:path';
import Mocha from 'mocha';

export function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', timeout: 30_000 });
  mocha.addFile(path.resolve(__dirname, 'extension.test.js'));
  return new Promise((res, rej) => mocha.run((f) => (f ? rej(new Error(`${f} failing`)) : res())));
}
