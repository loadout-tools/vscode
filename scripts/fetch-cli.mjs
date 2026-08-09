// Downloads the pinned `load` release binary for a vsce target into bin/load.
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';

const TARGETS = {
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
};

const vsceTarget = process.argv[2];
const rust = TARGETS[vsceTarget];
if (!rust) {
  console.error(`unknown target ${vsceTarget}; expected one of ${Object.keys(TARGETS).join(', ')}`);
  process.exit(1);
}
const pkg = createRequire(import.meta.url)('../package.json');
const { cliVersion, releaseRepo } = pkg.loadout;
const url = `https://github.com/${releaseRepo}/releases/download/v${cliVersion}/loadout-${rust}.tar.xz`;

fs.rmSync('bin', { recursive: true, force: true });
fs.mkdirSync('bin', { recursive: true });
execFileSync('curl', ['-fsSL', url, '-o', 'bin/cli.tar.xz'], { stdio: 'inherit' });
execFileSync('tar', ['-xJf', 'bin/cli.tar.xz', '-C', 'bin', '--strip-components=1'], { stdio: 'inherit' });
fs.rmSync('bin/cli.tar.xz');
if (!fs.existsSync('bin/load')) {
  console.error('archive did not contain load');
  process.exit(1);
}
fs.chmodSync('bin/load', 0o755);
if (vsceTarget.startsWith('darwin') && process.platform === 'darwin') {
  execFileSync('codesign', ['--force', '--sign', '-', 'bin/load'], { stdio: 'inherit' });
}
console.log(`bin/load ready for ${vsceTarget} (loadout v${cliVersion})`);
