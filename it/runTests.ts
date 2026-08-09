import { runTests } from '@vscode/test-electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

async function main() {
  const extensionDevelopmentPath = path.resolve(__dirname, '..');
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'lo-it-ws-'));
  fs.mkdirSync(path.join(workspace, '.git')); // "is a git repo" signal
  // Fake an existing loadout config so activation goes ambient, not onboarding.
  const cfgHome = fs.mkdtempSync(path.join(os.tmpdir(), 'lo-it-cfg-'));
  fs.mkdirSync(path.join(cfgHome, 'loadout'));
  fs.writeFileSync(path.join(cfgHome, 'loadout', 'config.toml'), '');
  const stubLog = path.join(workspace, 'stub-log.txt');
  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath: path.resolve(__dirname, 'suite'),
    launchArgs: [workspace, '--disable-extensions'],
    extensionTestsEnv: {
      // stub-bin is a plain shell script, not compiled TS, so it never lands in
      // dist-it alongside this file — resolve it from the source tree instead.
      PATH: `${path.resolve(extensionDevelopmentPath, 'it', 'stub-bin')}:${process.env.PATH}`,
      LOADOUT_STUB_LOG: stubLog,
      XDG_CONFIG_HOME: cfgHome,
      // Tell VS Code it was launched from a CLI so it skips resolving (and
      // prepending) the user's login-shell PATH, which would otherwise put a
      // real `load` on the developer's own PATH ahead of our stub.
      VSCODE_CLI: '1',
    },
  });
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
