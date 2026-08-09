import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveLoad } from '../src/binary';

function mkExe(dir: string, name: string): string {
  const p = path.join(dir, name);
  fs.writeFileSync(p, '#!/bin/sh\n');
  fs.chmodSync(p, 0o755);
  return p;
}

describe('resolveLoad', () => {
  it('prefers PATH over bundled', () => {
    const pathDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lo-path-'));
    const extRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lo-ext-'));
    fs.mkdirSync(path.join(extRoot, 'bin'));
    mkExe(pathDir, 'load');
    mkExe(path.join(extRoot, 'bin'), 'load');
    const r = resolveLoad(extRoot, { PATH: pathDir });
    expect(r).toEqual({ path: path.join(pathDir, 'load'), source: 'path' });
  });

  it('falls back to bundled', () => {
    const extRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lo-ext-'));
    fs.mkdirSync(path.join(extRoot, 'bin'));
    const bundled = mkExe(path.join(extRoot, 'bin'), 'load');
    expect(resolveLoad(extRoot, { PATH: '/nonexistent' })).toEqual({ path: bundled, source: 'bundled' });
  });

  it('returns null with neither', () => {
    const extRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lo-ext-'));
    expect(resolveLoad(extRoot, { PATH: '/nonexistent' })).toBeNull();
  });

  it('skips non-executable PATH hits', () => {
    const pathDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lo-path-'));
    fs.writeFileSync(path.join(pathDir, 'load'), 'not a binary');
    const extRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lo-ext-'));
    expect(resolveLoad(extRoot, { PATH: pathDir })).toBeNull();
  });
});
