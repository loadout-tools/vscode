import * as vscode from 'vscode';
import * as fs from 'node:fs';
import { resolveLoad } from './binary';
import { killAll, reapOrphans } from './exec';
import { agentForAppName, overlayPath, planFolderRefresh, refreshFolder } from './refresh';
import { consentState, hasConfig } from './onboarding';
import { openStudio } from './studio';
import { updateStatus, type StatusState } from './status';
import { provider as treeProvider, refreshTree, setAgent as setTreeAgent, setAmbient as setTreeAmbient } from './tree';

const out = vscode.window.createOutputChannel('Loadout');
let item: vscode.StatusBarItem;

const SETUP_DISMISSED_KEY = 'loadout.setupDismissed';
const UNSUPPORTED_NOTICE_KEY = 'loadout.unsupportedNoticeShown';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const storage = context.globalStorageUri.fsPath;
  reapOrphans(storage);
  item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  context.subscriptions.push(item, out);

  const bin = resolveLoad(context.extensionUri.fsPath);
  const agent = agentForAppName(vscode.env.appName);
  setTreeAgent(agent);

  /** Keeps the `loadout.ambient` context key (drives `viewsWelcome`) and the tree's
   *  own copy of that flag in sync with every status-bar update, then re-queries
   *  the tree so folder/action nodes appear or the welcome CTA shows immediately. */
  const applyStatus = async (state: StatusState, ambient: boolean) => {
    updateStatus(item, state);
    await vscode.commands.executeCommand('setContext', 'loadout.ambient', ambient);
    setTreeAmbient(ambient);
    refreshTree();
  };

  const showUnsupported = async () => {
    void vscode.window.showInformationMessage('Loadout does not support this platform yet (unix only today).');
  };

  // Webviews refuse cross-origin http iframes, so studio opens in Simple
  // Browser (an editor tab) when available; otherwise the external browser —
  // which Cursor routes into its own built-in in-IDE browser for localhost.
  const showStudio = async (url: string) => {
    try {
      await vscode.commands.executeCommand('simpleBrowser.show', url);
    } catch {
      await vscode.env.openExternal(vscode.Uri.parse(url));
    }
  };

  const doOpenStudio = async () => {
    if (!bin) {
      await showUnsupported();
      return;
    }
    try {
      // Forward-compat signal to studio for IDE-embedding detection (see studio.ts).
      await openStudio(bin.path, storage, showStudio, agent === 'cursor' ? 'cursor' : 'vscode');
      // Studio's onboarding writes the config; on ANY pre-consent studio open (not just
      // the notification's "Set up" button — the status bar / palette re-entry points
      // land here too), poll for it, then go ambient.
      if (consentState(context.globalState) === 'needs-setup') {
        const poll = setInterval(async () => {
          if (hasConfig()) {
            clearInterval(poll);
            await context.globalState.update('loadout.consent', true);
            await refreshAll();
          }
        }, 2000);
        context.subscriptions.push({ dispose: () => clearInterval(poll) });
      }
    } catch (e) {
      out.appendLine(`studio: ${String(e)}`);
      void vscode.window.showErrorMessage('Loadout Studio failed to open. Run `load studio` in a terminal as a fallback.');
    }
  };

  const offerSetup = async () => {
    await applyStatus({ kind: 'needs-setup' }, false);
    const choice = await vscode.window.showInformationMessage(
      'Set up Loadout? Your personal context, equipped automatically in every repo.',
      'Set up',
      'Not now'
    );
    if (choice === 'Set up') {
      await doOpenStudio();
    } else if (choice === 'Not now') {
      await context.globalState.update(SETUP_DISMISSED_KEY, true);
    }
  };

  const refreshAll = async (force = false) => {
    if (!bin) return;
    if (consentState(context.globalState) !== 'ambient') return;
    let last: StatusState = hasConfig() ? { kind: 'no-profile' } : { kind: 'needs-setup' };
    for (const f of vscode.workspace.workspaceFolders ?? []) {
      const root = f.uri.fsPath;
      if (!vscode.workspace.isTrusted) continue;
      const plan = planFolderRefresh(root, agent, force);
      if (plan.action === 'skip') {
        if (plan.reason === 'fresh-stamp') last = plan.status;
        continue;
      }
      const r = await refreshFolder(bin.path, root, agent, storage);
      out.appendLine(`refresh ${root}: ok=${r.ok}${r.log ? `\n${r.log}` : ''}`);
      last = !r.ok ? { kind: 'error' } : r.profile ? { kind: 'equipped', profile: r.profile } : { kind: 'no-profile' };
    }
    await applyStatus(last, true);
  };

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('loadout.overview', treeProvider),
    vscode.commands.registerCommand('loadout.openStudio', doOpenStudio),
    vscode.commands.registerCommand('loadout.refreshNow', async () => {
      if (!bin) {
        await showUnsupported();
        return;
      }
      if (consentState(context.globalState) !== 'ambient') {
        await offerSetup();
        return;
      }
      await refreshAll(true);
    }),
    vscode.commands.registerCommand('loadout.openOverlay', async () => {
      if (!bin) {
        await showUnsupported();
        return;
      }
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) return;
      const file = overlayPath(root, agent);
      if (!fs.existsSync(file)) {
        void vscode.window.showInformationMessage('No overlay yet — run Refresh Now.');
        return;
      }
      await vscode.window.showTextDocument(vscode.Uri.file(file));
    }),
    vscode.commands.registerCommand('loadout.menu', async () => {
      if (!bin) {
        await showUnsupported();
        return;
      }
      const pick = await vscode.window.showQuickPick(['Open Studio', 'Refresh Now', 'Open Overlay File']);
      if (pick === 'Open Studio') await doOpenStudio();
      if (pick === 'Refresh Now') await vscode.commands.executeCommand('loadout.refreshNow');
      if (pick === 'Open Overlay File') await vscode.commands.executeCommand('loadout.openOverlay');
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      refreshTree();
      void refreshAll();
    }),
    vscode.workspace.onDidGrantWorkspaceTrust(() => void refreshAll())
  );

  if (!bin) {
    await applyStatus({ kind: 'unsupported' }, false);
    // Fires once ever, not on every activation — activation happens on every window/reload.
    if (context.globalState.get(UNSUPPORTED_NOTICE_KEY) !== true) {
      await context.globalState.update(UNSUPPORTED_NOTICE_KEY, true);
      await showUnsupported();
    }
    return;
  }

  if (consentState(context.globalState) === 'needs-setup') {
    if (context.globalState.get(SETUP_DISMISSED_KEY) === true) {
      // Already declined once — the status-bar "set up" item is the re-entry point,
      // not another notification.
      await applyStatus({ kind: 'needs-setup' }, false);
    } else {
      await offerSetup();
    }
    return;
  }

  await refreshAll();
}

export function deactivate(): void {
  killAll();
}
