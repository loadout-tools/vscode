import { spawn, type ChildProcess, execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

type PidRecord = { pid: number; bin: string };
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

/** Spawn a tracked `load` child. Caller owns stdout/stderr wiring. */
export function spawnLoad(bin: string, args: string[], cwd: string | undefined, storageDir: string): ChildProcess {
  const child = spawn(bin, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  live.add(child);
  if (child.pid) writePids(storageDir, [...readPids(storageDir), { pid: child.pid, bin }]);
  child.on('exit', () => {
    live.delete(child);
    writePids(storageDir, readPids(storageDir).filter((r) => r.pid !== child.pid));
  });
  return child;
}

/** Run to completion, capturing output. */
export function runLoad(bin: string, args: string[], cwd: string | undefined, storageDir: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawnLoad(bin, args, cwd, storageDir);
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

/** Kill leftovers from a previous session (Cursor's Reload Window orphans). Only pids whose command still matches the recorded binary. */
export function reapOrphans(storageDir: string): void {
  const survivors: PidRecord[] = [];
  for (const rec of readPids(storageDir)) {
    try {
      const cmd = fs.readFileSync(`/proc/${rec.pid}/cmdline`, 'utf8');
      if (cmd.includes(rec.bin)) process.kill(rec.pid);
    } catch {
      // macOS has no /proc: fall back to a signal-0 liveness probe + kill guarded by bin match via ps.
      try {
        const out = execFileSync('ps', ['-o', 'command=', '-p', String(rec.pid)], { encoding: 'utf8' });
        if (out.includes(rec.bin)) process.kill(rec.pid);
      } catch {
        /* dead or unreadable — drop the record */
      }
    }
  }
  writePids(storageDir, survivors);
}
