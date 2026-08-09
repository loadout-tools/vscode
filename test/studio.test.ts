import { describe, it, expect } from 'vitest';
import { parseStudioUrl, studioHtml } from '../src/studio';

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
