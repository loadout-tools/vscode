import { describe, it, expect } from 'vitest';
import { activate } from '../src/extension';
import * as vscode from 'vscode';

describe('scaffold', () => {
  it('activate shows a status bar item', () => {
    activate({} as never);
    expect((vscode.window as unknown as { statusBarItems: unknown[] }).statusBarItems.length).toBeGreaterThan(0);
  });
});
