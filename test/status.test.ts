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
    expect(i.tooltip).toContain('WSL');
  });
});
