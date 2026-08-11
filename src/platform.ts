/**
 * What the extension should do when it cannot find a `load` binary.
 *
 * Windows support is WSL support: a workspace extension runs *inside* the WSL
 * remote, where the bundled linux-x64 `load` works unmodified. So a Windows
 * user with no binary is not unsupported — they are one "Reopen in WSL" away.
 *
 * Pure and vscode-free on purpose: `extension.ts` cannot be unit tested, so the
 * decision lives out here where it can be.
 */

export const WSL_EXTENSION_ID = 'ms-vscode-remote.remote-wsl';
export const WSL_REOPEN_COMMAND = 'remote-wsl.reopenInWSL';

export type PlatformAction =
  | { kind: 'ok' }
  | { kind: 'offer-wsl'; needsWslExtension: boolean }
  | { kind: 'unsupported' };

export interface PlatformInput {
  /** `resolveLoad` found a binary. */
  hasBinary: boolean;
  /** `process.platform`. */
  platform: string;
  /** `vscode.env.remoteName` — undefined in a local window, 'wsl' in a WSL remote. */
  remoteName: string | undefined;
  wslExtensionInstalled: boolean;
}

export function platformAction(input: PlatformInput): PlatformAction {
  if (input.hasBinary) return { kind: 'ok' };
  // Only a *local* Windows window can be moved into WSL. Inside the remote
  // already, a missing binary is a packaging failure, not a placement problem.
  if (input.platform === 'win32' && input.remoteName === undefined) {
    return { kind: 'offer-wsl', needsWslExtension: !input.wslExtensionInstalled };
  }
  return { kind: 'unsupported' };
}
