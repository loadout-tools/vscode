import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parseStudioUrl, openStudio, externalStudioUrl } from '../src/studio';

describe('parseStudioUrl', () => {
  it('preserves the full bootstrap path and query (the token — bare root is 403)', () => {
    expect(
      parseStudioUrl('  studio serving at http://127.0.0.1:53211/__studio/bootstrap?token=abc123 (Ctrl-C to stop)')
    ).toEqual({
      url: 'http://127.0.0.1:53211/__studio/bootstrap?token=abc123',
      port: 53211,
      pathAndQuery: '/__studio/bootstrap?token=abc123',
    });
    expect(parseStudioUrl('  ▸ http://localhost:7777/')).toEqual({
      url: 'http://localhost:7777/',
      port: 7777,
      pathAndQuery: '/',
    });
    expect(parseStudioUrl('bare http://127.0.0.1:9999 url')).toEqual({
      url: 'http://127.0.0.1:9999',
      port: 9999,
      pathAndQuery: '/',
    });
    expect(parseStudioUrl('no url here')).toBeNull();
  });
});

describe('openStudio', () => {
  it('creates exactly one panel despite later stdout', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lo-studio-'));
    const bin = path.join(dir, 'fake-load');
    fs.writeFileSync(bin, '#!/bin/sh\necho "serving at http://127.0.0.1:45678"\nsleep 0.2\necho "GET / 200"\nsleep 0.3\n');
    fs.chmodSync(bin, 0o755);
    let shows = 0;
    const urls: string[] = [];
    await openStudio(
      bin,
      dir,
      (url) => {
        shows += 1;
        urls.push(url);
      },
      'vscode'
    );
    await new Promise((r) => setTimeout(r, 700)); // let the extra output arrive, and the stub fully exit
    expect(shows).toBe(1);
    expect(urls[0]).toBe('http://127.0.0.1:45678');
  });

  it('reuses a live studio on a second call: re-shows the same URL instead of respawning', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lo-studio-'));
    const bin = path.join(dir, 'fake-load');
    fs.writeFileSync(bin, '#!/bin/sh\necho "serving at http://127.0.0.1:45681"\nsleep 0.3\n');
    fs.chmodSync(bin, 0o755);
    const urls: string[] = [];
    const show = (url: string) => void urls.push(url);
    await openStudio(bin, dir, show, 'vscode');
    await openStudio(bin, dir, show, 'vscode'); // process from the first call is still alive
    expect(urls).toHaveLength(2);
    expect(urls[1]).toBe(urls[0]);
    await new Promise((r) => setTimeout(r, 500)); // let the stub exit before the next test runs
  });

  it('settles on timeout, detaching stdout so a late URL is ignored and nothing is shown', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lo-studio-'));
    const bin = path.join(dir, 'fake-load');
    fs.writeFileSync(bin, '#!/bin/sh\nsleep 0.2\necho "serving at http://127.0.0.1:45682"\nsleep 0.2\n');
    fs.chmodSync(bin, 0o755);
    let shows = 0;
    await expect(openStudio(bin, dir, () => void (shows += 1), 'vscode', 100)).rejects.toThrow(/100ms/);
    await new Promise((r) => setTimeout(r, 400)); // let the late URL line arrive after the reject
    expect(shows).toBe(0);
  });

  it('sets LOADOUT_STUDIO_HOST to the given ide in the spawned child env', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lo-studio-'));
    const bin = path.join(dir, 'fake-load');
    const envOut = path.join(dir, 'env-out');
    fs.writeFileSync(
      bin,
      `#!/bin/sh\necho "$LOADOUT_STUDIO_HOST" > "${envOut}"\necho "serving at http://127.0.0.1:45690"\nsleep 0.2\n`
    );
    fs.chmodSync(bin, 0o755);
    await openStudio(bin, dir, () => {}, 'vscode');
    expect(fs.readFileSync(envOut, 'utf8').trim()).toBe('vscode');
    await new Promise((r) => setTimeout(r, 300)); // let the stub fully exit before the next test file runs
  });
});

describe('externalStudioUrl', () => {
  it('passes the URL through asExternalUri, preserving path and query', async () => {
    const seen: string[] = [];
    const mapped = await externalStudioUrl('http://127.0.0.1:5309/__studio/bootstrap?token=abc', async (u) => {
      seen.push(u);
      return 'https://forwarded.example/__studio/bootstrap?token=abc';
    });
    expect(seen).toEqual(['http://127.0.0.1:5309/__studio/bootstrap?token=abc']);
    expect(mapped).toBe('https://forwarded.example/__studio/bootstrap?token=abc');
  });

  it('falls back to the original URL when mapping throws', async () => {
    const url = 'http://127.0.0.1:5309/__studio/bootstrap?token=abc';
    const mapped = await externalStudioUrl(url, async () => {
      throw new Error('no remote');
    });
    expect(mapped).toBe(url);
  });
});
