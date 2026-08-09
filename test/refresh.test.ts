import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { agentForAppName, shouldSkipRefresh, refreshFolder, overlayPath, readProfile } from '../src/refresh';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lo-refresh-'));

describe('agentForAppName', () => {
  it('maps Cursor to cursor, everything else to copilot', () => {
    expect(agentForAppName('Cursor')).toBe('cursor');
    expect(agentForAppName('Visual Studio Code')).toBe('copilot');
    expect(agentForAppName('Visual Studio Code - Insiders')).toBe('copilot');
  });
});

describe('shouldSkipRefresh', () => {
  it('skips when the hook stamp is fresh, not when stale or absent', () => {
    const root = tmp();
    expect(shouldSkipRefresh(root)).toBe(false);
    const stampDir = path.join(root, '.loadout', 'cache');
    fs.mkdirSync(stampDir, { recursive: true });
    const stamp = path.join(stampDir, 'hook-stamp');
    fs.writeFileSync(stamp, '');
    expect(shouldSkipRefresh(root)).toBe(true);
    const old = Date.now() - 60_000;
    fs.utimesSync(stamp, old / 1000, old / 1000);
    expect(shouldSkipRefresh(root)).toBe(false);
  });
});

describe('overlayPath / readProfile', () => {
  it('knows both agents overlay files and parses the profile line', () => {
    const root = tmp();
    expect(overlayPath(root, 'copilot')).toBe(path.join(root, '.github', 'instructions', 'loadout.instructions.md'));
    expect(overlayPath(root, 'cursor')).toBe(path.join(root, '.cursor', 'rules', 'loadout.mdc'));
    fs.mkdirSync(path.join(root, '.github', 'instructions'), { recursive: true });
    fs.writeFileSync(overlayPath(root, 'copilot'), '---\napplyTo: "**"\n---\nheader\n_Active profile: **rust**_ · x\n');
    expect(readProfile(root, 'copilot')).toBe('rust');
    expect(readProfile(root, 'cursor')).toBeNull();
  });
});

describe('refreshFolder', () => {
  it('invokes load refresh --agent and reports ok + profile', async () => {
    const root = tmp();
    const storage = tmp();
    const bin = path.join(storage, 'fake-load');
    // The stub records its argv and writes a copilot overlay, like a real refresh would.
    fs.writeFileSync(
      bin,
      `#!/bin/sh\necho "$@" > "${storage}/argv"\nmkdir -p "$1_IGNORED" 2>/dev/null\nmkdir -p "${root}/.github/instructions"\nprintf -- '---\\napplyTo: x\\n---\\n_Active profile: **rust**_\\n' > "${root}/.github/instructions/loadout.instructions.md"\nexit 0\n`
    );
    fs.chmodSync(bin, 0o755);
    const r = await refreshFolder(bin, root, 'copilot', storage);
    expect(r.ok).toBe(true);
    expect(r.profile).toBe('rust');
    expect(fs.readFileSync(path.join(storage, 'argv'), 'utf8').trim()).toBe('refresh --agent copilot');
  });

  it('reports failure with captured log', async () => {
    const root = tmp();
    const storage = tmp();
    const bin = path.join(storage, 'fake-load');
    fs.writeFileSync(bin, '#!/bin/sh\necho boom >&2\nexit 1\n');
    fs.chmodSync(bin, 0o755);
    const r = await refreshFolder(bin, root, 'copilot', storage);
    expect(r.ok).toBe(false);
    expect(r.log).toContain('boom');
  });
});
