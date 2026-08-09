import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { agentForAppName, shouldSkipRefresh, refreshFolder, overlayPath, readProfile, isGitRepo, planFolderRefresh } from '../src/refresh';

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

describe('isGitRepo', () => {
  it('is true for a .git directory, true for a .git file (worktrees), false otherwise', () => {
    const dirRepo = tmp();
    fs.mkdirSync(path.join(dirRepo, '.git'));
    expect(isGitRepo(dirRepo)).toBe(true);

    const worktree = tmp();
    fs.writeFileSync(path.join(worktree, '.git'), 'gitdir: /elsewhere/.git/worktrees/x\n');
    expect(isGitRepo(worktree)).toBe(true);

    const plain = tmp();
    expect(isGitRepo(plain)).toBe(false);
  });
});

describe('planFolderRefresh', () => {
  it('skips non-git folders regardless of force', () => {
    const root = tmp();
    expect(planFolderRefresh(root, 'copilot', false)).toEqual({ action: 'skip', reason: 'not-git' });
    expect(planFolderRefresh(root, 'copilot', true)).toEqual({ action: 'skip', reason: 'not-git' });
  });

  it('on a fresh hook stamp, skips but derives status from the overlay (equipped)', () => {
    const root = tmp();
    fs.mkdirSync(path.join(root, '.git'));
    fs.mkdirSync(path.join(root, '.loadout', 'cache'), { recursive: true });
    fs.writeFileSync(path.join(root, '.loadout', 'cache', 'hook-stamp'), '');
    fs.mkdirSync(path.join(root, '.github', 'instructions'), { recursive: true });
    fs.writeFileSync(path.join(root, '.github', 'instructions', 'loadout.instructions.md'), '_Active profile: **rust**_\n');
    expect(planFolderRefresh(root, 'copilot', false)).toEqual({
      action: 'skip',
      reason: 'fresh-stamp',
      status: { kind: 'equipped', profile: 'rust' },
    });
  });

  it('on a fresh hook stamp with no overlay yet, skips with no-profile status', () => {
    const root = tmp();
    fs.mkdirSync(path.join(root, '.git'));
    fs.mkdirSync(path.join(root, '.loadout', 'cache'), { recursive: true });
    fs.writeFileSync(path.join(root, '.loadout', 'cache', 'hook-stamp'), '');
    expect(planFolderRefresh(root, 'copilot', false)).toEqual({ action: 'skip', reason: 'fresh-stamp', status: { kind: 'no-profile' } });
  });

  it('force bypasses the fresh hook stamp and proceeds to refresh', () => {
    const root = tmp();
    fs.mkdirSync(path.join(root, '.git'));
    fs.mkdirSync(path.join(root, '.loadout', 'cache'), { recursive: true });
    fs.writeFileSync(path.join(root, '.loadout', 'cache', 'hook-stamp'), '');
    expect(planFolderRefresh(root, 'copilot', true)).toEqual({ action: 'refresh' });
  });

  it('refreshes a git folder with no (or a stale) hook stamp', () => {
    const root = tmp();
    fs.mkdirSync(path.join(root, '.git'));
    expect(planFolderRefresh(root, 'copilot', false)).toEqual({ action: 'refresh' });
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
