import { spawn, type ChildProcess, execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** `owner` is the pid of the extension-host process that spawned this child — it's how
 *  reapOrphans tells "this window's own leftover" from "another window's still-live child";
 *  globalStorage (and its pid file) is shared across every VS Code/Cursor window. */
type PidRecord = { pid: number; bin: string; owner: number };
const live = new Set<ChildProcess>();

export function pidFilePath(storageDir: string): string {
  return path.join(storageDir, 'loadout-pids.json');
}

function readPids(storageDir: string): PidRecord[] {
  try {
    return JSON.parse(fs.readFileSync(pidFilePath(storageDir), 'utf8')) as PidRecord[];
  } catch {
    return [];
  }
}

function writePids(storageDir: string, pids: PidRecord[]): void {
  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(pidFilePath(storageDir), JSON.stringify(pids));
}

/** Spawn a tracked `load` child. Caller owns stdout/stderr wiring.
 *  `extraEnv` is merged over `process.env` for the child — e.g. `LOADOUT_STUDIO_HOST`,
 *  a forward-compat signal the CLI ignores today (see studio.ts). */
export function spawnLoad(
  bin: string,
  args: string[],
  cwd: string | undefined,
  storageDir: string,
  extraEnv?: Record<string, string>
): ChildProcess {
  const env = extraEnv ? { ...process.env, ...extraEnv } : process.env;
  const child = spawn(bin, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env });
  live.add(child);
  if (child.pid) writePids(storageDir, [...readPids(storageDir), { pid: child.pid, bin, owner: process.pid }]);
  child.on('exit', () => {
    live.delete(child);
    writePids(storageDir, readPids(storageDir).filter((r) => r.pid !== child.pid));
  });
  return child;
}

/** Run to completion, capturing output. */
export function runLoad(
  bin: string,
  args: string[],
  cwd: string | undefined,
  storageDir: string,
  extraEnv?: Record<string, string>
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawnLoad(bin, args, cwd, storageDir, extraEnv);
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
    child.on('error', () => resolve({ code: -1, stdout, stderr }));
  });
}

/** Kill everything this session spawned (deactivate()). */
export function killAll(): void {
  for (const c of live) {
    try {
      c.kill();
    } catch {
      /* already gone */
    }
  }
  live.clear();
}

/** True if `pid` is a live process we could plausibly signal (or belongs to another user — either way, not ours to reap). */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function commandMatches(pid: number, bin: string): boolean {
  try {
    const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
    return cmd.includes(bin);
  } catch {
    // macOS has no /proc: fall back to `ps`.
    try {
      const out = execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' });
      return out.includes(bin);
    } catch {
      return false; // process gone or unreadable
    }
  }
}

/**
 * Kill leftovers from a previous session of THIS window (Cursor's Reload Window orphans).
 * globalStorage — and its pid file — is shared across every open window, so a record can
 * just as easily be another window's still-live child. Only reap a record when its owning
 * extension-host process is gone; records whose owner is alive are left alone (and kept in
 * the file) since they're not ours to touch.
 */
export function reapOrphans(storageDir: string): void {
  const survivors: PidRecord[] = [];
  for (const rec of readPids(storageDir)) {
    if (isProcessAlive(rec.owner)) {
      survivors.push(rec); // another window's live owner — its child may still be live too
      continue;
    }
    try {
      if (commandMatches(rec.pid, rec.bin)) process.kill(rec.pid);
    } catch {
      /* already gone */
    }
  }
  writePids(storageDir, survivors);
}
