import { describe, it, expect } from 'vitest';
import { platformAction } from '../src/platform';

const base = { hasBinary: false, platform: 'linux', remoteName: undefined, wslExtensionInstalled: false, isCursor: false };

describe('platformAction', () => {
  it('is ok whenever the binary resolved, on any platform', () => {
    for (const platform of ['darwin', 'linux', 'win32']) {
      expect(platformAction({ ...base, hasBinary: true, platform })).toEqual({ kind: 'ok' });
    }
  });

  it('offers WSL on a local Windows window with no binary', () => {
    expect(platformAction({ ...base, platform: 'win32' })).toEqual({
      kind: 'offer-wsl',
      needsWslExtension: true,
    });
  });

  it('does not ask to install the WSL extension when it is already there', () => {
    expect(
      platformAction({ ...base, platform: 'win32', wslExtensionInstalled: true })
    ).toEqual({ kind: 'offer-wsl', needsWslExtension: false });
  });

  it('is unsupported inside a WSL remote with no binary — reopening would not help', () => {
    // A real WSL remote extension host reports platform 'linux' (the remote is
    // a Linux box), not 'win32'. Already in the remote and still no `load`
    // means the linux VSIX failed to install, which "Reopen in WSL" cannot fix.
    expect(platformAction({ ...base, platform: 'linux', remoteName: 'wsl' })).toEqual({
      kind: 'unsupported',
    });
  });

  it('is unsupported on a Windows SSH remote with no binary', () => {
    // A Windows *SSH* remote host still reports platform 'win32' (the remote
    // machine is Windows), but it is not a local Windows window — "Reopen in
    // WSL" has no meaning for a window that is already remote over SSH.
    expect(platformAction({ ...base, platform: 'win32', remoteName: 'ssh-remote' })).toEqual({
      kind: 'unsupported',
    });
  });

  it('is unsupported on a non-Windows platform with no binary', () => {
    expect(platformAction({ ...base, platform: 'darwin' })).toEqual({ kind: 'unsupported' });
    expect(platformAction({ ...base, platform: 'linux' })).toEqual({ kind: 'unsupported' });
  });

  it('asks for manual WSL setup in Cursor, since it cannot install Remote-WSL to reopen', () => {
    expect(platformAction({ ...base, platform: 'win32', isCursor: true })).toEqual({
      kind: 'wsl-manual',
    });
    // wslExtensionInstalled is irrelevant here — Cursor never offers the automatic path.
    expect(platformAction({ ...base, platform: 'win32', isCursor: true, wslExtensionInstalled: true })).toEqual({
      kind: 'wsl-manual',
    });
  });

  it('is unsupported inside a WSL remote in Cursor too', () => {
    expect(platformAction({ ...base, platform: 'linux', remoteName: 'wsl', isCursor: true })).toEqual({
      kind: 'unsupported',
    });
  });
});
