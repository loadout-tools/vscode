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
      // Deliberately omitted: activate()'s CLI-update check also gates on
      // consentState() (needs-setup vs. ambient), but that reads the real
      // `~/.config/loadout/config.toml` and so is only silent on a machine
      // that hasn't set loadout up — not reliable in CI or on a dogfooding
      // dev box. `extension` being unset is what's unconditionally true here:
      // it makes `expected` undefined regardless of environment. Add
      // `extension` back (with a `loadout.cliVersion`) on a machine that
      // already has that config file and this test will shell out to a real
      // `load --version` instead of staying silent.
    } as never;
    await activate(context);
    expect((vscode.window as unknown as { statusBarItems: unknown[] }).statusBarItems.length).toBeGreaterThan(0);
  });
});
