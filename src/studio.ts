import { spawnLoad } from './exec';

/** The stable port webview iframes use; portMapping rewrites it to the real one. */
export const WEBVIEW_PORT = 7777;

/**
 * Studio prints a bootstrap URL whose path carries the session token
 * (`/__studio/bootstrap?token=…` — it sets the auth cookie and redirects).
 * The full path+query MUST be preserved: the bare root answers 403.
 */
export function parseStudioUrl(line: string): { url: string; port: number; pathAndQuery: string } | null {
  const m = line.match(/(http:\/\/(?:127\.0\.0\.1|localhost):(\d+)(\/\S*)?)/);
  return m ? { url: m[1], port: Number(m[2]), pathAndQuery: m[3] ?? '/' } : null;
}

export function studioHtml(pathAndQuery: string): string {
  const src = `http://127.0.0.1:${WEBVIEW_PORT}${pathAndQuery}`;
  return `<!DOCTYPE html><html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src http://127.0.0.1:${WEBVIEW_PORT}; style-src 'unsafe-inline'">
<style>html,body,iframe{margin:0;padding:0;height:100%;width:100%;border:0;overflow:hidden}</style></head>
<body><iframe src="${src}" allow="clipboard-read; clipboard-write"></iframe></body></html>`;
}

export type StudioPanel = { webview: { html: string }; reveal?: () => void; onDidDispose?: (cb: () => void) => void };
export type PanelFactory = (port: number) => StudioPanel;

type StudioHandle = { child: ReturnType<typeof spawnLoad>; port: number; pathAndQuery: string; panel: StudioPanel | null };
/** The live `load studio` child (if any) — module-level because globalStorage's spawn
 *  tracking is per-window, but this extension only ever wants one studio per window. */
let current: StudioHandle | null = null;

function attachPanel(handle: StudioHandle, panel: StudioPanel): void {
  panel.webview.html = studioHtml(handle.pathAndQuery);
  handle.panel = panel;
  panel.onDidDispose?.(() => {
    if (current === handle) current.panel = null;
  });
}

/**
 * Spawn `load studio` headless on a free port, wait for its URL on stdout, and hand the
 * port to the panel factory (which applies portMapping). Reuses a live studio process
 * (and reveals its existing panel, or recreates one against the same port if the panel
 * was closed) instead of spawning a second one. Rejects after `timeoutMs` without a URL.
 */
export function openStudio(bin: string, storageDir: string, createPanel: PanelFactory, timeoutMs = 10_000): Promise<void> {
  if (current && current.child.exitCode === null) {
    const handle = current;
    if (handle.panel) {
      handle.panel.reveal?.();
    } else {
      attachPanel(handle, createPanel(handle.port));
    }
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const child = spawnLoad(bin, ['studio', '--no-open', '--port', '0', '--idle-timeout', '2h'], undefined, storageDir);
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
          const handle: StudioHandle = { child, port: parsed.port, pathAndQuery: parsed.pathAndQuery, panel: null };
          current = handle;
          child.on('exit', () => {
            if (current === handle) current = null;
          });
          attachPanel(handle, createPanel(parsed.port));
          resolve();
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
