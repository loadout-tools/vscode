import * as vscode from 'vscode';
import { resolveLoad } from './binary';
import { killAll, reapOrphans, runLoad } from './exec';
import { agentForAppName, overlayPath, refreshFolder, shouldSkipRefresh } from './refresh';
import { consentState, hasConfig } from './onboarding';
import { openStudio, WEBVIEW_PORT } from './studio';
import { updateStatus, type StatusState } from './status';

const out = vscode.window.createOutputChannel('Loadout');
let item: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const storage = context.globalStorageUri.fsPath;
  reapOrphans(storage);
  item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  context.subscriptions.push(item, out);

  const bin = resolveLoad(context.extensionUri.fsPath);
  if (!bin) {
    updateStatus(item, { kind: 'unsupported' });
    void vscode.window.showInformationMessage('Loadout does not support this platform yet (unix only today).');
    return;
  }
  const agent = agentForAppName(vscode.env.appName);

  const studioPanel = () => {
    return (port: number) =>
      vscode.window.createWebviewPanel('loadoutStudio', 'Loadout Studio', vscode.ViewColumn.One, {
        enableScripts: true,
        retainContextWhenHidden: true,
        portMapping: [{ webviewPort: WEBVIEW_PORT, extensionHostPort: port }],
      });
  };

  const doOpenStudio = async () => {
    try {
      await openStudio(bin.path, storage, studioPanel());
    } catch (e) {
      out.appendLine(`studio: ${String(e)}`);
      void vscode.window.showErrorMessage('Loadout Studio failed to open. Run `load studio` in a terminal as a fallback.');
    }
  };

  const refreshAll = async () => {
    if (consentState(context.globalState) !== 'ambient') return;
    let last: StatusState = hasConfig() ? { kind: 'no-profile' } : { kind: 'needs-setup' };
    for (const f of vscode.workspace.workspaceFolders ?? []) {
      const root = f.uri.fsPath;
      if (!vscode.workspace.isTrusted) continue;
      if (shouldSkipRefresh(root)) continue;
      const r = await refreshFolder(bin.path, root, agent, storage);
      out.appendLine(`refresh ${root}: ok=${r.ok}${r.log ? `\n${r.log}` : ''}`);
      last = !r.ok ? { kind: 'error' } : r.profile ? { kind: 'equipped', profile: r.profile } : { kind: 'no-profile' };
    }
    updateStatus(item, last);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('loadout.openStudio', doOpenStudio),
    vscode.commands.registerCommand('loadout.refreshNow', refreshAll),
    vscode.commands.registerCommand('loadout.openOverlay', async () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (root) await vscode.window.showTextDocument(vscode.Uri.file(overlayPath(root, agent)));
    }),
    vscode.commands.registerCommand('loadout.menu', async () => {
      const pick = await vscode.window.showQuickPick(['Open Studio', 'Refresh Now', 'Open Overlay File']);
      if (pick === 'Open Studio') await doOpenStudio();
      if (pick === 'Refresh Now') await refreshAll();
      if (pick === 'Open Overlay File') await vscode.commands.executeCommand('loadout.openOverlay');
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => void refreshAll()),
    vscode.workspace.onDidGrantWorkspaceTrust(() => void refreshAll())
  );

  if (consentState(context.globalState) === 'needs-setup') {
    updateStatus(item, { kind: 'needs-setup' });
    const choice = await vscode.window.showInformationMessage(
      'Set up Loadout? Your personal context, equipped automatically in every repo.',
      'Set up',
      'Not now'
    );
    if (choice === 'Set up') {
      await doOpenStudio();
      // Studio's onboarding writes the config; poll for it, then go ambient.
      const poll = setInterval(async () => {
        if (hasConfig()) {
          clearInterval(poll);
          await context.globalState.update('loadout.consent', true);
          await refreshAll();
        }
      }, 2000);
      context.subscriptions.push({ dispose: () => clearInterval(poll) });
    }
    return;
  }

  await refreshAll();
  void runLoad; // reserved for future version display
}

export function deactivate(): void {
  killAll();
}
