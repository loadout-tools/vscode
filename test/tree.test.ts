import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { provider, refreshTree, setAgent, setAmbient, type LoadoutItem } from '../src/tree';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lo-tree-'));

/** The mock's `workspaceFolders` is a plain mutable field; real `vscode.workspace.workspaceFolders`
 *  is declared `const`, so tests reach it the same way scaffold.test.ts reaches `statusBarItems`. */
const setWorkspaceFolders = (folders: { uri: { fsPath: string }; name?: string }[]) => {
  (vscode.workspace as unknown as { workspaceFolders: typeof folders }).workspaceFolders = folders;
};

beforeEach(() => {
  setAgent('copilot');
  setAmbient(false);
  setWorkspaceFolders([]);
});

describe('provider.getChildren (root)', () => {
  it('returns nothing pre-ambient, so viewsWelcome can show', () => {
    const root = tmp();
    setWorkspaceFolders([{ uri: { fsPath: root }, name: 'myrepo' }]);
    expect(provider.getChildren(undefined)).toEqual([]);
  });

  it('once ambient, returns one folder node per workspace folder plus action nodes', () => {
    const root = tmp();
    setAmbient(true);
    setWorkspaceFolders([{ uri: { fsPath: root }, name: 'myrepo' }]);

    const children = provider.getChildren(undefined) as LoadoutItem[];
    expect(children).toHaveLength(3);
    expect(children[0]).toEqual({ kind: 'folder', name: 'myrepo', root });
    expect(children.slice(1)).toEqual([
      { kind: 'action', label: 'Open Studio', command: 'loadout.openStudio', icon: 'browser' },
      { kind: 'action', label: 'Refresh Now', command: 'loadout.refreshNow', icon: 'refresh' },
    ]);

    const actionItem = provider.getTreeItem(children[1]) as vscode.TreeItem;
    expect(actionItem.command).toEqual({ command: 'loadout.openStudio', title: 'Open Studio' });
  });
});

describe('provider.getChildren (folder)', () => {
  it('builds Profile/Overlay children from a real overlay file on disk', () => {
    const root = tmp();
    setAgent('copilot');
    fs.mkdirSync(path.join(root, '.github', 'instructions'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.github', 'instructions', 'loadout.instructions.md'),
      '---\napplyTo: "**"\n---\nheader\n_Active profile: **rust**_ · x\n'
    );
    const overlayFile = path.join(root, '.github', 'instructions', 'loadout.instructions.md');

    const folder: LoadoutItem = { kind: 'folder', name: 'myrepo', root };
    const children = provider.getChildren(folder) as LoadoutItem[];
    expect(children).toEqual([
      { kind: 'profile', label: 'Profile: rust' },
      { kind: 'overlay', label: `Overlay: ${path.join('.github', 'instructions', 'loadout.instructions.md')}`, file: overlayFile },
    ]);

    const overlayItem = provider.getTreeItem(children[1]) as vscode.TreeItem;
    expect(overlayItem.command).toEqual({
      command: 'vscode.open',
      title: 'Open Overlay',
      arguments: [vscode.Uri.file(overlayFile)],
    });
  });

  it('falls back to "none matched" / "not written yet" when no overlay exists', () => {
    const root = tmp();
    setAgent('cursor');
    const folder: LoadoutItem = { kind: 'folder', name: 'myrepo', root };
    const children = provider.getChildren(folder) as LoadoutItem[];
    expect(children).toEqual([
      { kind: 'profile', label: 'Profile: none matched' },
      { kind: 'overlay', label: 'Overlay: not written yet', file: null },
    ]);

    const overlayItem = provider.getTreeItem(children[1]) as vscode.TreeItem;
    expect(overlayItem.command).toBeUndefined();
  });

  it('leaf nodes (action/profile/overlay) have no children', () => {
    expect(provider.getChildren({ kind: 'profile', label: 'Profile: rust' })).toEqual([]);
    expect(provider.getChildren({ kind: 'overlay', label: 'x', file: null })).toEqual([]);
    expect(provider.getChildren({ kind: 'action', label: 'Open Studio', command: 'loadout.openStudio', icon: 'browser' })).toEqual([]);
  });
});

describe('refreshTree', () => {
  it('fires onDidChangeTreeData', () => {
    let fired = 0;
    const sub = provider.onDidChangeTreeData!(() => {
      fired += 1;
    });
    refreshTree();
    expect(fired).toBe(1);
    sub.dispose();
  });
});
