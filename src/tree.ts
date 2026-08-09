import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { overlayPath, readProfile } from './refresh';

export type LoadoutItem =
  | { kind: 'folder'; name: string; root: string }
  | { kind: 'profile'; label: string }
  | { kind: 'overlay'; label: string; file: string | null }
  | { kind: 'action'; label: string; command: string; icon: string };

/** Mirrors the `loadout.ambient` context key. Gates root content: the `viewsWelcome`
 *  pre-setup CTA only appears while the tree view's root has no children, so this must
 *  return [] until setup completes. */
let ambient = false;

/** Set once at activation from `agentForAppName(vscode.env.appName)` — decides which
 *  overlay file each folder node reads (`.cursor/rules/loadout.mdc` vs the Copilot path). */
let agent = 'copilot';

const emitter = new vscode.EventEmitter<void>();

export function setAmbient(v: boolean): void {
  ambient = v;
}

export function setAgent(a: string): void {
  agent = a;
}

/** Fires onDidChangeTreeData so VS Code re-queries getChildren. */
export function refreshTree(): void {
  emitter.fire();
}

const ACTIONS: LoadoutItem[] = [
  { kind: 'action', label: 'Open Studio', command: 'loadout.openStudio', icon: 'browser' },
  { kind: 'action', label: 'Refresh Now', command: 'loadout.refreshNow', icon: 'refresh' },
];

function folderChildren(root: string): LoadoutItem[] {
  const profile = readProfile(root, agent);
  const file = overlayPath(root, agent);
  const exists = fs.existsSync(file);
  return [
    { kind: 'profile', label: profile ? `Profile: ${profile}` : 'Profile: none matched' },
    {
      kind: 'overlay',
      label: exists ? `Overlay: ${path.relative(root, file)}` : 'Overlay: not written yet',
      file: exists ? file : null,
    },
  ];
}

export const provider: vscode.TreeDataProvider<LoadoutItem> = {
  onDidChangeTreeData: emitter.event,

  getChildren(element?: LoadoutItem): LoadoutItem[] {
    if (!element) {
      // Pre-setup: no data yet — an empty root lets `viewsWelcome` (when: !loadout.ambient) show.
      if (!ambient) return [];
      const folders: LoadoutItem[] = (vscode.workspace.workspaceFolders ?? []).map((f) => ({
        kind: 'folder',
        name: f.name ?? path.basename(f.uri.fsPath),
        root: f.uri.fsPath,
      }));
      return [...folders, ...ACTIONS];
    }
    if (element.kind === 'folder') return folderChildren(element.root);
    return [];
  },

  getTreeItem(element: LoadoutItem): vscode.TreeItem {
    if (element.kind === 'folder') {
      return new vscode.TreeItem(element.name, vscode.TreeItemCollapsibleState.Expanded);
    }
    if (element.kind === 'profile') {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon('layers');
      return item;
    }
    if (element.kind === 'overlay') {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
      if (element.file) {
        item.command = { command: 'vscode.open', title: 'Open Overlay', arguments: [vscode.Uri.file(element.file)] };
      }
      return item;
    }
    const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon(element.icon);
    item.command = { command: element.command, title: element.label };
    return item;
  },
};
