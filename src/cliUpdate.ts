import * as fs from 'node:fs';
import { configPath } from './onboarding';

// Use require for CommonJS/ESM interop compatibility
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parse: parseToml } = require('smol-toml');

/**
 * Whether to offer updating the user's own `load`.
 *
 * The extension never uses its bundled binary when one is on PATH, so a CLI fix
 * can ship and never reach the user — studio's whole UI is served by that
 * binary. This tells them, once, when their `load` is older than the version
 * this extension was built against.
 *
 * Free of `vscode` on purpose: `extension.ts` cannot be unit tested, so the
 * decision lives out here where it can be.
 */

export interface Version {
  major: number;
  minor: number;
  patch: number;
}

/** `load --version` prints `load X.Y.Z`. Anything else reads as unknown. */
export function parseVersion(text: string): Version | null {
  const m = /^(?:load\s+)?(\d+)\.(\d+)\.(\d+)$/.exec(text.trim());
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

export function isOlder(a: Version, b: Version): boolean {
  if (a.major !== b.major) return a.major < b.major;
  if (a.minor !== b.minor) return a.minor < b.minor;
  return a.patch < b.patch;
}

/**
 * The CLI's own opt-outs, honored here because someone who turned off update
 * nudges meant it whichever surface asks: `LOADOUT_NO_UPDATE_CHECK` (any value,
 * matching the CLI's presence check) and `[update] check = "off"`.
 *
 * Fails open — a config we cannot read is not an opt-out.
 */
export function updateCheckDisabled(env: NodeJS.ProcessEnv, configText: string | null): boolean {
  if (env.LOADOUT_NO_UPDATE_CHECK !== undefined) return true;
  if (!configText) return false;
  try {
    const doc = parseToml(configText) as { update?: { check?: unknown } };
    const check = doc.update?.check;
    if (typeof check !== 'string') return false;
    const v = check.toLowerCase();
    return v === 'off' || v === 'never';
  } catch {
    return false;
  }
}

/** The only file read in this module. Missing or unreadable is `null`. */
export function readGlobalConfigText(env: NodeJS.ProcessEnv = process.env): string | null {
  try {
    return fs.readFileSync(configPath(env), 'utf8');
  } catch {
    return null;
  }
}

export type UpdateDecision =
  | { kind: 'offer'; installed: string; expected: string }
  | { kind: 'quiet' };

export interface CliUpdateInput {
  /** Where `resolveLoad` found the binary. */
  source: 'path' | 'bundled';
  /** Raw stdout of `load --version`. */
  versionOutput: string;
  /** `package.json`'s `loadout.cliVersion`. */
  expected: string;
  env: NodeJS.ProcessEnv;
  configText: string | null;
}

export function cliUpdateDecision(input: CliUpdateInput): UpdateDecision {
  // The bundled binary is ours; the fix for a stale one is a new extension.
  if (input.source !== 'path') return { kind: 'quiet' };
  if (updateCheckDisabled(input.env, input.configText)) return { kind: 'quiet' };
  const installed = parseVersion(input.versionOutput);
  const expected = parseVersion(input.expected);
  if (!installed || !expected) return { kind: 'quiet' };
  if (!isOlder(installed, expected)) return { kind: 'quiet' };
  return {
    kind: 'offer',
    installed: `${installed.major}.${installed.minor}.${installed.patch}`,
    expected: `${expected.major}.${expected.minor}.${expected.patch}`,
  };
}

/**
 * The notification text for an `offer` decision. A VS Code user has no reason
 * to know Loadout even has a separate command-line tool with its own release
 * cycle — that's the whole thing this message needs to explain, not just the
 * two version numbers.
 */
export function updateOfferMessage(decision: Extract<UpdateDecision, { kind: 'offer' }>): string {
  return `Loadout's command-line tool updates separately from this extension, and yours is behind — ${decision.installed} installed, ${decision.expected} expected.`;
}
