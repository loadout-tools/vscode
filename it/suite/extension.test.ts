import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as vscode from 'vscode';

suite('loadout activation', () => {
  test('refresh ran via the stub with the copilot agent', async () => {
    await vscode.extensions.getExtension('loadout-tools.loadout')?.activate();
    await vscode.commands.executeCommand('loadout.refreshNow');
    const log = fs.readFileSync(process.env.LOADOUT_STUB_LOG!, 'utf8');
    assert.match(log, /refresh --agent copilot/);
    const ws = vscode.workspace.workspaceFolders![0].uri.fsPath;
    assert.ok(fs.existsSync(`${ws}/.github/instructions/loadout.instructions.md`));
  });
});
