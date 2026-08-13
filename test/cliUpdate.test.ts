import { describe, it, expect } from 'vitest';
import { parseVersion, isOlder, updateCheckDisabled, cliUpdateDecision, updateOfferMessage } from '../src/cliUpdate';

describe('parseVersion', () => {
  it('reads the version out of `load --version` output', () => {
    expect(parseVersion('load 0.26.0')).toEqual({ major: 0, minor: 26, patch: 0 });
    expect(parseVersion('  load 1.2.3\n')).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it('is null for anything that is not exactly three numbers', () => {
    // A prerelease, a git build, or an unexpected suffix must read as unknown —
    // guessing wrong here means nagging someone whose install is fine.
    for (const s of ['load 0.26.0-rc1', 'load 0.26', 'load v0.26.0 (abc123)', 'not a version', '']) {
      expect(parseVersion(s)).toBeNull();
    }
  });
});

describe('isOlder', () => {
  it('compares major, then minor, then patch', () => {
    expect(isOlder({ major: 0, minor: 25, patch: 0 }, { major: 0, minor: 26, patch: 0 })).toBe(true);
    expect(isOlder({ major: 0, minor: 26, patch: 0 }, { major: 0, minor: 26, patch: 1 })).toBe(true);
    expect(isOlder({ major: 1, minor: 0, patch: 0 }, { major: 0, minor: 99, patch: 9 })).toBe(false);
    expect(isOlder({ major: 0, minor: 26, patch: 0 }, { major: 0, minor: 26, patch: 0 })).toBe(false);
  });
});

describe('updateCheckDisabled', () => {
  it('honors the env kill switch, whatever its value', () => {
    expect(updateCheckDisabled({ LOADOUT_NO_UPDATE_CHECK: '1' }, null)).toBe(true);
    expect(updateCheckDisabled({ LOADOUT_NO_UPDATE_CHECK: '' }, null)).toBe(true);
  });

  it('honors [update] check = off (and the never alias)', () => {
    expect(updateCheckDisabled({}, '[update]\ncheck = "off"\n')).toBe(true);
    expect(updateCheckDisabled({}, '[update]\ncheck = "never"\n')).toBe(true);
    expect(updateCheckDisabled({}, '[update]\ncheck = "OFF"\n')).toBe(true);
  });

  it('reads the dotted spelling too', () => {
    expect(updateCheckDisabled({}, 'update.check = "off"\n')).toBe(true);
  });

  it('is not disabled for any other setting, or no config at all', () => {
    expect(updateCheckDisabled({}, '[update]\ncheck = "always"\n')).toBe(false);
    expect(updateCheckDisabled({}, '[update]\ncheck = "daily"\n')).toBe(false);
    expect(updateCheckDisabled({}, '')).toBe(false);
    expect(updateCheckDisabled({}, null)).toBe(false);
  });

  it('fails open on malformed TOML — an unreadable config is not an opt-out', () => {
    expect(updateCheckDisabled({}, 'this is [not valid toml')).toBe(false);
  });
});

describe('cliUpdateDecision', () => {
  const base = { source: 'path' as const, versionOutput: 'load 0.25.0', expected: '0.26.0', env: {}, configText: null };

  it('offers when the installed CLI is older', () => {
    expect(cliUpdateDecision(base)).toEqual({ kind: 'offer', installed: '0.25.0', expected: '0.26.0' });
  });

  it('is quiet when the installed CLI is equal or newer', () => {
    expect(cliUpdateDecision({ ...base, versionOutput: 'load 0.26.0' })).toEqual({ kind: 'quiet' });
    expect(cliUpdateDecision({ ...base, versionOutput: 'load 0.27.0' })).toEqual({ kind: 'quiet' });
  });

  it('is quiet for the bundled binary — the extension owns that one', () => {
    expect(cliUpdateDecision({ ...base, source: 'bundled' })).toEqual({ kind: 'quiet' });
  });

  it('is quiet when either version will not parse', () => {
    expect(cliUpdateDecision({ ...base, versionOutput: 'load 0.25.0-rc1' })).toEqual({ kind: 'quiet' });
    expect(cliUpdateDecision({ ...base, expected: 'nonsense' })).toEqual({ kind: 'quiet' });
  });

  it('is quiet when the user opted out', () => {
    expect(cliUpdateDecision({ ...base, env: { LOADOUT_NO_UPDATE_CHECK: '1' } })).toEqual({ kind: 'quiet' });
    expect(cliUpdateDecision({ ...base, configText: '[update]\ncheck = "off"\n' })).toEqual({ kind: 'quiet' });
  });
});

describe('updateOfferMessage', () => {
  it('names both versions, worded as agreed with the repo owner', () => {
    const message = updateOfferMessage({ kind: 'offer', installed: '0.26.0', expected: '0.27.0' });
    expect(message).toContain('0.26.0');
    expect(message).toContain('0.27.0');
    expect(message).toBe(
      "Loadout's command-line tool updates separately from this extension, and yours is behind — 0.26.0 installed, 0.27.0 expected."
    );
  });
});
