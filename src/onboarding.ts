import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

type GlobalStateLike = { get(key: string): unknown; update(key: string, value: unknown): Thenable<void> | Promise<void> };

const CONSENT_KEY = 'loadout.consent';

export function configPath(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.XDG_CONFIG_HOME ?? path.join(env.HOME ?? os.homedir(), '.config');
  return path.join(base, 'loadout', 'config.toml');
}

export function hasConfig(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    return fs.statSync(configPath(env)).isFile();
  } catch {
    return false;
  }
}

/**
 * Existing config means the user already chose loadout — installing the
 * extension is consent. Without a config, nothing is ever written until the
 * user accepts setup (studio creates the config; the caller re-checks).
 */
export function consentState(globalState: GlobalStateLike, env: NodeJS.ProcessEnv = process.env): 'ambient' | 'needs-setup' {
  if (globalState.get(CONSENT_KEY) === true && hasConfig(env)) return 'ambient';
  if (hasConfig(env)) {
    void globalState.update(CONSENT_KEY, true);
    return 'ambient';
  }
  return 'needs-setup';
}
