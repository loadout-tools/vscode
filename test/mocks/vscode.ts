// Minimal vscode API surface for unit tests. Extend as units need it.
export const window = {
  statusBarItems: [] as unknown[],
  createStatusBarItem: () => {
    const item = { text: '', tooltip: '', command: '', show: () => {}, hide: () => {}, dispose: () => {} };
    window.statusBarItems.push(item);
    return item;
  },
  showInformationMessage: async (..._a: unknown[]) => undefined,
  showWarningMessage: async (..._a: unknown[]) => undefined,
  showQuickPick: async (..._a: unknown[]) => undefined,
  showTextDocument: async (..._a: unknown[]) => undefined,
  createOutputChannel: (_n: string) => ({ appendLine: (_l: string) => {}, show: () => {}, dispose: () => {} }),
  createWebviewPanel: (..._a: unknown[]) => ({ webview: { html: '' }, onDidDispose: (_f: () => void) => {}, dispose: () => {} }),
};
export const workspace = {
  workspaceFolders: [] as { uri: { fsPath: string } }[],
  isTrusted: true,
  onDidChangeWorkspaceFolders: (_f: unknown) => ({ dispose: () => {} }),
  onDidGrantWorkspaceTrust: (_f: unknown) => ({ dispose: () => {} }),
};
export const commands = { registerCommand: (_id: string, _fn: unknown) => ({ dispose: () => {} }), executeCommand: async (_id: string) => {} };
export const env = { appName: 'Visual Studio Code' };
export const StatusBarAlignment = { Left: 1, Right: 2 };
export const ViewColumn = { One: 1 };
export class Uri { static file(p: string) { return { fsPath: p }; } }
