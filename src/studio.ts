import { spawnLoad } from './exec';

/**
 * Studio prints a bootstrap URL whose path carries the session token
 * (`/__studio/bootstrap?token=…` — it sets the auth cookie and redirects).
 * The full URL MUST be preserved: the bare root answers 403.
 */
export function parseStudioUrl(line: string): { url: string; port: number; pathAndQuery: string } | null {
  const m = line.match(/(http:\/\/(?:127\.0\.0\.1|localhost):(\d+)(\/\S*)?)/);
  return m ? { url: m[1], port: Number(m[2]), pathAndQuery: m[3] ?? '/' } : null;
}

/** How the caller displays the studio URL (Simple Browser / external browser). */
export type ShowStudio = (url: string) => Promise<void> | void;

type StudioHandle = { child: ReturnType<typeof spawnLoad>; url: string };
/** The live `load studio` child (if any) — one studio per window is plenty.
 *  VS Code webviews refuse cross-origin http iframes ("domains, protocols and
 *  ports must match"), so studio is shown via Simple Browser / the external
 *  browser rather than embedded — the caller supplies `show`. */
let current: StudioHandle | null = null;

/**
 * Spawn `load studio` headless on a free port, wait for its tokenized URL on
 * stdout, and hand that URL to `show`. Reuses a live studio process (re-showing
 * its URL) instead of spawning a second one. Rejects after `timeoutMs` without
 * a URL.
 *
 * `ide` is passed to the child as `LOADOUT_STUDIO_HOST` — a forward-compat signal
 * so studio can later detect and customize itself for IDE embedding. The CLI
 * ignores unknown env vars today. Only applies to a freshly spawned process — a
 * reused live studio keeps whatever env it started with.
 */
export function openStudio(bin: string, storageDir: string, show: ShowStudio, ide: 'vscode' | 'cursor', timeoutMs = 10_000): Promise<void> {
  if (current && current.child.exitCode === null) {
    const { url } = current;
    return Promise.resolve(show(url)).then(() => undefined);
  }

  return new Promise((resolve, reject) => {
    const child = spawnLoad(bin, ['studio', '--no-open', '--port', '0', '--idle-timeout', '2h'], undefined, storageDir, {
      LOADOUT_STUDIO_HOST: ide,
    });
    const timer = setTimeout(() => {
      settled = true;
      child.stdout?.off('data', onData);
      reject(new Error(`studio did not report a URL within ${timeoutMs}ms`));
    }, timeoutMs);
    let buf = '';
    let settled = false;
    const onData = (d: Buffer) => {
      buf += d.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? ''; // keep the incomplete tail for the next chunk
      for (const line of lines) {
        const parsed = parseStudioUrl(line);
        if (parsed && !settled) {
          settled = true;
          clearTimeout(timer);
          child.stdout?.off('data', onData);
          const handle: StudioHandle = { child, url: parsed.url };
          current = handle;
          child.on('exit', () => {
            if (current === handle) current = null;
          });
          Promise.resolve(show(parsed.url)).then(resolve, reject);
          return;
        }
      }
    };
    child.stdout?.on('data', onData);
    child.on('exit', (code) => {
      if (!settled) {
        clearTimeout(timer);
        reject(new Error(`studio exited early (code ${code})`));
      }
    });
  });
}
