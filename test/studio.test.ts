import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parseStudioUrl, studioHtml, openStudio } from '../src/studio';

describe('parseStudioUrl', () => {
  it('finds the served localhost url and port', () => {
    expect(parseStudioUrl('  studio serving at http://127.0.0.1:53211 (Ctrl-C to stop)')).toEqual({
      url: 'http://127.0.0.1:53211',
      port: 53211,
    });
    expect(parseStudioUrl('  ▸ http://localhost:7777/')).toEqual({ url: 'http://localhost:7777', port: 7777 });
    expect(parseStudioUrl('no url here')).toBeNull();
  });
});

describe('studioHtml', () => {
  it('iframes the webview-mapped port, not the real one', () => {
    const html = studioHtml();
    expect(html).toContain('http://127.0.0.1:7777/');
    expect(html).toContain('<iframe');
  });
});

describe('openStudio', () => {
  it('creates exactly one panel despite later stdout', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lo-studio-'));
    const bin = path.join(dir, 'fake-load');
    fs.writeFileSync(bin, '#!/bin/sh\necho "serving at http://127.0.0.1:45678"\nsleep 0.2\necho "GET / 200"\nsleep 0.3\n');
    fs.chmodSync(bin, 0o755);
    let panels = 0;
    await openStudio(bin, dir, () => {
      panels += 1;
      return { webview: { html: '' } };
    });
    await new Promise((r) => setTimeout(r, 700)); // let the extra output arrive, and the stub fully exit
    expect(panels).toBe(1);
  });

  it('reuses a live studio on a second call: reveals instead of spawning or paneling again', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lo-studio-'));
    const bin = path.join(dir, 'fake-load');
    fs.writeFileSync(bin, '#!/bin/sh\necho "serving at http://127.0.0.1:45681"\nsleep 0.3\n');
    fs.chmodSync(bin, 0o755);
    let panels = 0;
    let reveals = 0;
    const factory = () => {
      panels += 1;
      return { webview: { html: '' }, reveal: () => (reveals += 1) };
    };
    await openStudio(bin, dir, factory);
    await openStudio(bin, dir, factory); // process from the first call is still alive
    expect(panels).toBe(1);
    expect(reveals).toBe(1);
    await new Promise((r) => setTimeout(r, 500)); // let the stub exit before the next test runs
  });

  it('settles on timeout, detaching stdout so a late URL is ignored and no panel is created', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lo-studio-'));
    const bin = path.join(dir, 'fake-load');
    fs.writeFileSync(bin, '#!/bin/sh\nsleep 0.2\necho "serving at http://127.0.0.1:45682"\nsleep 0.2\n');
    fs.chmodSync(bin, 0o755);
    let panels = 0;
    const factory = () => {
      panels += 1;
      return { webview: { html: '' } };
    };
    await expect(openStudio(bin, dir, factory, 100)).rejects.toThrow(/100ms/);
    await new Promise((r) => setTimeout(r, 400)); // let the late URL line arrive after the reject
    expect(panels).toBe(0);
  });
});
