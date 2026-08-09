import { describe, it, expect } from 'vitest';
import { activate } from '../src/extension';
import * as vscode from 'vscode';
import * as os from 'node:os';

describe('scaffold', () => {
  it('activate shows a status bar item', async () => {
    const context: vscode.ExtensionContext = {
      globalStorageUri: { fsPath: os.tmpdir() },
      extensionUri: { fsPath: os.tmpdir() },
      subscriptions: [],
      globalState: {
        get: () => undefined,
        update: async () => {},
      } as never,
    } as never;
    await activate(context);
    expect((vscode.window as unknown as { statusBarItems: unknown[] }).statusBarItems.length).toBeGreaterThan(0);
  });
});
