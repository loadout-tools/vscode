import * as fs from 'node:fs';
import * as path from 'node:path';

export type LoadBinary = { path: string; source: 'path' | 'bundled' };

const BIN = process.platform === 'win32' ? 'load.exe' : 'load';

/** Installed `load` on PATH wins (user-managed, self-updating); bundled is the fallback. */
export function resolveLoad(extensionRoot: string, env: NodeJS.ProcessEnv = process.env): LoadBinary | null {
  for (const dir of (env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue;
    const p = path.join(dir, BIN);
    if (isExecutable(p)) return { path: p, source: 'path' };
  }
  const bundled = path.join(extensionRoot, 'bin', BIN);
  if (isExecutable(bundled)) return { path: bundled, source: 'bundled' };
  return null;
}

function isExecutable(p: string): boolean {
  try {
    const st = fs.statSync(p);
    if (!st.isFile()) return false;
    return process.platform === 'win32' || (st.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}
