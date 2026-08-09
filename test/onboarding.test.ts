import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { configPath, hasConfig, consentState } from '../src/onboarding';

describe('config detection', () => {
  it('honors XDG_CONFIG_HOME and falls back to ~/.config', () => {
    expect(configPath({ XDG_CONFIG_HOME: '/xdg' })).toBe('/xdg/loadout/config.toml');
    expect(configPath({ HOME: '/home/u' })).toBe('/home/u/.config/loadout/config.toml');
  });

  it('hasConfig reflects file existence', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lo-cfg-'));
    const env = { XDG_CONFIG_HOME: dir };
    expect(hasConfig(env)).toBe(false);
    fs.mkdirSync(path.join(dir, 'loadout'));
    fs.writeFileSync(path.join(dir, 'loadout', 'config.toml'), '');
    expect(hasConfig(env)).toBe(true);
  });
});

describe('consentState', () => {
  const mem = () => {
    const m = new Map<string, unknown>();
    return { get: (k: string) => m.get(k), update: async (k: string, v: unknown) => void m.set(k, v) };
  };

  it('existing config = implicit consent (records it)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lo-cfg-'));
    fs.mkdirSync(path.join(dir, 'loadout'));
    fs.writeFileSync(path.join(dir, 'loadout', 'config.toml'), '');
    const gs = mem();
    expect(consentState(gs, { XDG_CONFIG_HOME: dir })).toBe('ambient');
    expect(gs.get('loadout.consent')).toBe(true);
  });

  it('no config and no recorded consent = needs-setup', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lo-cfg-'));
    const gs = mem();
    expect(consentState(gs, { XDG_CONFIG_HOME: dir })).toBe('needs-setup');
    expect(fs.existsSync(path.join(dir, 'loadout', 'config.toml'))).toBe(false);
    expect(gs.get('loadout.consent')).toBeUndefined();
  });
});
