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
  createWebviewPanel: (..._a: unknown[]) => ({
    webview: { html: '' },
    reveal: () => {},
    onDidDispose: (_f: () => void) => {},
    dispose: () => {},
  }),
  registerTreeDataProvider: (_id: string, _provider: unknown) => ({ dispose: () => {} }),
};
export const workspace = {
  workspaceFolders: [] as { uri: { fsPath: string }; name?: string }[],
  isTrusted: true,
  onDidChangeWorkspaceFolders: (_f: unknown) => ({ dispose: () => {} }),
  onDidGrantWorkspaceTrust: (_f: unknown) => ({ dispose: () => {} }),
};
/** setContext calls executeCommand records, keyed by context key — lets tests assert wiring. */
export const contexts: Record<string, unknown> = {};
export const commands = {
  registerCommand: (_id: string, _fn: unknown) => ({ dispose: () => {} }),
  executeCommand: async (id: string, ...args: unknown[]) => {
    if (id === 'setContext' && typeof args[0] === 'string') contexts[args[0]] = args[1];
  },
};
export const env = { appName: 'Visual Studio Code' };
export const StatusBarAlignment = { Left: 1, Right: 2 };
export const ViewColumn = { One: 1 };
export const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 };
export class Uri { static file(p: string) { return { fsPath: p }; } }
export class ThemeIcon { constructor(public id: string) {} }
export class TreeItem {
  label?: string;
  collapsibleState?: number;
  iconPath?: unknown;
  command?: { command: string; title: string; arguments?: unknown[] };
  constructor(label?: string, collapsibleState?: number) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}
export class EventEmitter<T> {
  private listeners: ((e: T) => void)[] = [];
  event = (listener: (e: T) => void) => {
    this.listeners.push(listener);
    return { dispose: () => { this.listeners = this.listeners.filter((l) => l !== listener); } };
  };
  fire(data: T): void {
    for (const l of this.listeners) l(data);
  }
}
