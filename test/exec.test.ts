import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runLoad, reapOrphans, pidFilePath } from '../src/exec';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lo-store-'));

describe('exec', () => {
  it('runs a binary, captures output, and clears its pid record', async () => {
    const storage = tmp();
    const bin = path.join(storage, 'fake-load');
    fs.writeFileSync(bin, '#!/bin/sh\necho out-line\necho err-line >&2\nexit 3\n');
    fs.chmodSync(bin, 0o755);
    const r = await runLoad(bin, [], undefined, storage);
    expect(r.code).toBe(3);
    expect(r.stdout).toContain('out-line');
    expect(r.stderr).toContain('err-line');
    expect(JSON.parse(fs.readFileSync(pidFilePath(storage), 'utf8'))).toEqual([]);
  });

  it('passes extraEnv through to the spawned child, merged over process.env', async () => {
    const storage = tmp();
    const bin = path.join(storage, 'fake-load');
    const envOut = path.join(storage, 'env-out');
    fs.writeFileSync(bin, `#!/bin/sh\necho "$LOADOUT_STUDIO_HOST" > "${envOut}"\nexit 0\n`);
    fs.chmodSync(bin, 0o755);
    await runLoad(bin, [], undefined, storage, { LOADOUT_STUDIO_HOST: 'vscode' });
    expect(fs.readFileSync(envOut, 'utf8').trim()).toBe('vscode');
  });

  it('reapOrphans tolerates a stale record whose owner is also dead', () => {
    const storage = tmp();
    // owner 999998 and pid 999999 are both assumed-dead pids, matching the
    // convention the rest of this suite uses for "definitely not running".
    fs.writeFileSync(pidFilePath(storage), JSON.stringify([{ pid: 999999, bin: '/x/load', owner: 999998 }]));
    reapOrphans(storage); // must not throw
    expect(JSON.parse(fs.readFileSync(pidFilePath(storage), 'utf8'))).toEqual([]);
  });

  it('keeps a record whose owner (another window) is still alive, without touching its pid', () => {
    const storage = tmp();
    const rec = { pid: 555555, bin: '/x/load', owner: process.pid }; // this test process is definitely alive
    fs.writeFileSync(pidFilePath(storage), JSON.stringify([rec]));
    reapOrphans(storage);
    expect(JSON.parse(fs.readFileSync(pidFilePath(storage), 'utf8'))).toEqual([rec]);
  });

  it('reaps a record whose owner is gone and whose command still matches', async () => {
    const storage = tmp();
    const child = spawn('sleep', ['5']);
    try {
      await new Promise((resolve) => child.once('spawn', resolve));
      fs.writeFileSync(pidFilePath(storage), JSON.stringify([{ pid: child.pid, bin: 'sleep', owner: 999998 }]));
      reapOrphans(storage);
      expect(JSON.parse(fs.readFileSync(pidFilePath(storage), 'utf8'))).toEqual([]);
      await new Promise((r) => setTimeout(r, 100));
      expect(() => process.kill(child.pid!, 0)).toThrow();
    } finally {
      try {
        child.kill();
      } catch {
        /* already reaped */
      }
    }
  });
});
