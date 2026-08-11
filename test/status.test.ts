import { describe, it, expect } from 'vitest';
import { updateStatus } from '../src/status';

const item = () => ({ text: '', tooltip: '', command: '', show: () => {}, hide: () => {} });

describe('updateStatus', () => {
  it('renders each state distinctly', () => {
    const i = item();
    updateStatus(i as never, { kind: 'equipped', profile: 'rust' });
    expect(i.text).toBe('$(layers) loadout: rust');
    updateStatus(i as never, { kind: 'needs-setup' });
    expect(i.text).toBe('$(layers) loadout: set up');
    updateStatus(i as never, { kind: 'no-profile' });
    expect(i.text).toBe('$(layers) loadout: no profile');
    updateStatus(i as never, { kind: 'error' });
    expect(i.text).toContain('$(warning)');
    updateStatus(i as never, { kind: 'unsupported' });
    expect(i.text).toContain('unavailable');
    updateStatus(i as never, { kind: 'needs-wsl' });
    expect(i.text).toContain('needs WSL');
    // True on both the VS Code (offer-wsl) and Cursor (wsl-manual) paths, so it
    // must not promise an automatic reopen — only Cursor's dead end got fixed
    // if this also holds for the message clicking it actually leads to.
    expect(i.tooltip).toBe('Loadout runs inside WSL on Windows. Click for setup steps.');
    expect(i.tooltip).not.toMatch(/click to reopen/i);
  });
});
