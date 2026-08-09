import * as fs from 'node:fs';
import * as path from 'node:path';
import { runLoad } from './exec';

/** Cursor's hook debounce window; matches loadout's `DEBOUNCE` in commands/hook.rs. */
const HOOK_STAMP_FRESH_MS = 30_000;

export function agentForAppName(appName: string): 'cursor' | 'copilot' {
  return /cursor/i.test(appName) ? 'cursor' : 'copilot';
}

/** Skip when loadout's own sessionStart hook just refreshed this root (Cursor). */
export function shouldSkipRefresh(folder: string, now: number = Date.now()): boolean {
  try {
    const st = fs.statSync(path.join(folder, '.loadout', 'cache', 'hook-stamp'));
    return now - st.mtimeMs < HOOK_STAMP_FRESH_MS;
  } catch {
    return false;
  }
}

export function overlayPath(folder: string, agent: string): string {
  return agent === 'cursor'
    ? path.join(folder, '.cursor', 'rules', 'loadout.mdc')
    : path.join(folder, '.github', 'instructions', 'loadout.instructions.md');
}

/** The overlay body renders `_Active profile: **<name>**_`. */
export function readProfile(folder: string, agent: string): string | null {
  try {
    const m = fs.readFileSync(overlayPath(folder, agent), 'utf8').match(/Active profile: \*\*(.+?)\*\*/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** Adopt-and-refresh one workspace folder. `--agent` both adopts on first open and refreshes after. */
export async function refreshFolder(
  bin: string,
  folder: string,
  agent: string,
  storageDir: string
): Promise<{ ok: boolean; profile: string | null; log: string }> {
  const r = await runLoad(bin, ['refresh', '--agent', agent], folder, storageDir);
  return { ok: r.code === 0, profile: readProfile(folder, agent), log: r.stdout + r.stderr };
}
