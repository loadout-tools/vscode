import * as vscode from 'vscode';

export function activate(_context: vscode.ExtensionContext): void {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.text = '$(layers) loadout';
  item.show();
}

export function deactivate(): void {}
