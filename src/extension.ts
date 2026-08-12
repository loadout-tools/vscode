import * as vscode from 'vscode';
import * as fs from 'node:fs';
import { resolveLoad } from './binary';
import { killAll, reapOrphans, runLoad } from './exec';
import { agentForAppName, overlayPath, planFolderRefresh, refreshFolder } from './refresh';
import { consentState, hasConfig } from './onboarding';
import { platformAction, WSL_EXTENSION_ID, WSL_REOPEN_COMMAND } from './platform';
import { externalStudioUrl, openStudio } from './studio';
import { updateStatus, type StatusState } from './status';
import { provider as treeProvider, refreshTree, setAgent as setTreeAgent, setAmbient as setTreeAmbient } from './tree';
import { cliUpdateDecision, readGlobalConfigText } from './cliUpdate';

const out = vscode.window.createOutputChannel('Loadout');
let item: vscode.StatusBarItem;

const SETUP_DISMISSED_KEY = 'loadout.setupDismissed';
const UNSUPPORTED_NOTICE_KEY = 'loadout.unsupportedNoticeShown';
const CLI_UPDATE_NOTICE_KEY = 'loadout.cliUpdateNoticeShown';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const storage = context.globalStorageUri.fsPath;
  reapOrphans(storage);
  item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  context.subscriptions.push(item, out);

  const bin = resolveLoad(context.extensionUri.fsPath);
  const agent = agentForAppName(vscode.env.appName);
  setTreeAgent(agent);

  /**
   * A CLI on PATH is never replaced by this extension, so a user can install an
   * extension update and still be served an old studio by their own `load`.
   * Tell them once per expected version. Everything here is best-effort: any
   * failure means saying nothing, and activation never waits on it.
   */
  const maybeOfferCliUpdate = async () => {
    if (!bin) return;
    const expected = (context.extension?.packageJSON as { loadout?: { cliVersion?: string } } | undefined)
      ?.loadout?.cliVersion;
    if (!expected) return;
    const key = `${CLI_UPDATE_NOTICE_KEY}.${expected}`;
    if (context.globalState.get(key) === true) return;

    const probe = await runLoad(bin.path, ['--version'], undefined, storage);
    if (probe.code !== 0) return;
    const decision = cliUpdateDecision({
      source: bin.source,
      versionOutput: probe.stdout,
      expected,
      env: process.env,
      configText: readGlobalConfigText(),
    });
    if (decision.kind !== 'offer') return;

    // Mark before asking: the offer fires once per expected version whether the
    // user updates, declines, or ignores it.
    await context.globalState.update(key, true);
    const choice = await vscode.window.showInformationMessage(
      `Loadout expects load ${decision.expected}, but ${decision.installed} is installed. Studio's interface comes from the CLI, so some fixes arrive only when it updates.`,
      'Update',
      'Not now'
    );
    if (choice !== 'Update') return;
    const term = vscode.window.createTerminal('Loadout update');
    term.show();
    term.sendText('load update');
  };

  /** Keeps the `loadout.ambient` context key (drives `viewsWelcome`) and the tree's
   *  own copy of that flag in sync with every status-bar update, then re-queries
   *  the tree so folder/action nodes appear or the welcome CTA shows immediately. */
  const applyStatus = async (state: StatusState, ambient: boolean) => {
    updateStatus(item, state);
    await vscode.commands.executeCommand('setContext', 'loadout.ambient', ambient);
    setTreeAmbient(ambient);
    refreshTree();
  };

  /** What to do about a missing `load`, decided once per activation. */
  const action = platformAction({
    hasBinary: bin !== null,
    platform: process.platform,
    remoteName: vscode.env.remoteName,
    wslExtensionInstalled: vscode.extensions.getExtension(WSL_EXTENSION_ID) !== undefined,
    isCursor: agent === 'cursor',
  });

  /**
   * Called from every entry point that needs a binary. On Windows this is not a
   * dead end: the extension and its bundled linux `load` both work once the
   * window is reopened in WSL, so offer exactly that — except in Cursor, which
   * cannot install Microsoft's Remote-WSL extension to do the reopen for us.
   */
  const showUnsupported = async () => {
    if (action.kind === 'wsl-manual') {
      void vscode.window.showInformationMessage(
        'Loadout runs inside WSL on Windows. Open this folder in a WSL window, then install Loadout there.'
      );
      return;
    }
    if (action.kind !== 'offer-wsl') {
      void vscode.window.showInformationMessage(
        'Loadout could not find the `load` binary. Install it from loadout.tools, or check the Loadout output channel for details.'
      );
      return;
    }
    const choice = await vscode.window.showInformationMessage(
      'Loadout runs inside WSL on Windows. Reopen this folder in WSL, then install Loadout there (Extensions view → Install in WSL).',
      'Reopen in WSL',
      'Not now'
    );
    if (choice !== 'Reopen in WSL') return;
    try {
      if (action.needsWslExtension) {
        await vscode.commands.executeCommand('workbench.extensions.installExtension', WSL_EXTENSION_ID);
      }
      await vscode.commands.executeCommand(WSL_REOPEN_COMMAND);
    } catch (e) {
      out.appendLine(`reopen in wsl: ${String(e)}`);
      void vscode.window.showErrorMessage(
        'Could not reopen in WSL. Install the "WSL" extension, then run "WSL: Reopen Folder in WSL" from the Command Palette.'
      );
    }
  };

  // Webviews refuse cross-origin http iframes, so studio opens in Simple
  // Browser (an editor tab) when available; otherwise the external browser —
  // which Cursor routes into its own built-in in-IDE browser for localhost.
  const showStudio = async (url: string) => {
    const external = await externalStudioUrl(
      url,
      // toString(true) skips percent-encoding: the bootstrap URL's `token=`
      // query must survive literally, or studio's `=`-split parser sees a
      // key named `token%3Dabc` with no value and answers 403.
      async (u) => (await vscode.env.asExternalUri(vscode.Uri.parse(u))).toString(true),
      (m) => out.appendLine(m)
    );
    try {
      await vscode.commands.executeCommand('simpleBrowser.show', external);
    } catch {
      // `external` has already been through asExternalUri; openExternal maps
      // its argument again, so passing `external` here would double-map it
      // and forward a port nothing is listening on. Give it the original.
      await vscode.env.openExternal(vscode.Uri.parse(url));
    }
  };

  const doOpenStudio = async () => {
    if (!bin) {
      await showUnsupported();
      return;
    }
    try {
      // The CLI derives everything repo-scoped from its own cwd, so studio needs a real
      // workspace folder here, not the extension host's cwd (see studio.ts).
      const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      // Forward-compat signal to studio for IDE-embedding detection (see studio.ts).
      await openStudio(bin.path, cwd, storage, showStudio, agent === 'cursor' ? 'cursor' : 'vscode');
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
    // Reveal the sidebar once so brand-new users see where Loadout lives —
    // Cursor keeps unpinned view containers in the activity-bar overflow, so
    // without this first reveal the icon is effectively invisible there.
    try {
      await vscode.commands.executeCommand('loadout.overview.focus');
    } catch {
      /* view focus is best-effort */
    }
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
    await applyStatus(action.kind === 'unsupported' ? { kind: 'unsupported' } : { kind: 'needs-wsl' }, false);
    // Fires once ever, not on every activation — activation happens on every window/reload.
    if (context.globalState.get(UNSUPPORTED_NOTICE_KEY) !== true) {
      await context.globalState.update(UNSUPPORTED_NOTICE_KEY, true);
      // Not awaited: this notification has buttons, so its promise only
      // resolves when the user clicks or dismisses it. Awaiting here would
      // leave activate() — and the extension's "activating" state — pending
      // until they do.
      void showUnsupported();
    }
    return;
  }

  void maybeOfferCliUpdate().catch((e) => out.appendLine(`cli update check: ${String(e)}`));

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
