import { describe, it, expect } from 'vitest';
import { platformAction } from '../src/platform';

const base = { hasBinary: false, platform: 'linux', remoteName: undefined, wslExtensionInstalled: false };

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
    // Already in the remote and still no `load` means the linux VSIX failed to
    // install, which "Reopen in WSL" cannot fix.
    expect(platformAction({ ...base, platform: 'win32', remoteName: 'wsl' })).toEqual({
      kind: 'unsupported',
    });
  });

  it('is unsupported on a non-Windows platform with no binary', () => {
    expect(platformAction({ ...base, platform: 'darwin' })).toEqual({ kind: 'unsupported' });
    expect(platformAction({ ...base, platform: 'linux' })).toEqual({ kind: 'unsupported' });
  });
});
