import { spawnLoad } from './exec';

/** The stable port webview iframes use; portMapping rewrites it to the real one. */
export const WEBVIEW_PORT = 7777;

export function parseStudioUrl(line: string): { url: string; port: number } | null {
  const m = line.match(/(http:\/\/(?:127\.0\.0\.1|localhost):(\d+))/);
  return m ? { url: m[1].replace(/\/$/, ''), port: Number(m[2]) } : null;
}

export function studioHtml(): string {
  return `<!DOCTYPE html><html><head><style>html,body,iframe{margin:0;padding:0;height:100%;width:100%;border:0;overflow:hidden}</style></head>
<body><iframe src="http://127.0.0.1:${WEBVIEW_PORT}/" allow="clipboard-read; clipboard-write"></iframe></body></html>`;
}

export type PanelFactory = (port: number) => { webview: { html: string } };

/**
 * Spawn `load studio` headless on a free port, wait for its URL on stdout,
 * and hand the port to the panel factory (which applies portMapping).
 * Rejects after 10s without a URL.
 */
export function openStudio(bin: string, storageDir: string, createPanel: PanelFactory): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawnLoad(bin, ['studio', '--no-open', '--port', '0', '--idle-timeout', '2h'], undefined, storageDir);
    const timer = setTimeout(() => reject(new Error('studio did not report a URL within 10s')), 10_000);
    let buf = '';
    child.stdout?.on('data', (d: Buffer) => {
      buf += d.toString();
      for (const line of buf.split('\n')) {
        const parsed = parseStudioUrl(line);
        if (parsed) {
          clearTimeout(timer);
          const panel = createPanel(parsed.port);
          panel.webview.html = studioHtml();
          resolve();
          return;
        }
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`studio exited early (code ${code})`));
    });
  });
}
