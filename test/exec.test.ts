import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runLoad, reapOrphans, pidFilePath } from '../src/exec';

describe('exec', () => {
  it('runs a binary, captures output, and clears its pid record', async () => {
    const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'lo-store-'));
    const bin = path.join(storage, 'fake-load');
    fs.writeFileSync(bin, '#!/bin/sh\necho out-line\necho err-line >&2\nexit 3\n');
    fs.chmodSync(bin, 0o755);
    const r = await runLoad(bin, [], undefined, storage);
    expect(r.code).toBe(3);
    expect(r.stdout).toContain('out-line');
    expect(r.stderr).toContain('err-line');
    expect(JSON.parse(fs.readFileSync(pidFilePath(storage), 'utf8'))).toEqual([]);
  });

  it('reapOrphans tolerates stale and dead pids', () => {
    const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'lo-store-'));
    fs.writeFileSync(pidFilePath(storage), JSON.stringify([{ pid: 999999, bin: '/x/load' }]));
    reapOrphans(storage); // must not throw
    expect(JSON.parse(fs.readFileSync(pidFilePath(storage), 'utf8'))).toEqual([]);
  });
});
