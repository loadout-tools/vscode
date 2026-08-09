import type * as vscode from 'vscode';

export type StatusState =
  | { kind: 'unsupported' }
  | { kind: 'needs-setup' }
  | { kind: 'equipped'; profile: string }
  | { kind: 'no-profile' }
  | { kind: 'error' };

export function updateStatus(item: vscode.StatusBarItem, state: StatusState): void {
  switch (state.kind) {
    case 'equipped':
      item.text = `$(layers) loadout: ${state.profile}`;
      item.tooltip = 'Loadout context is equipped for this repo. Click for actions.';
      break;
    case 'needs-setup':
      item.text = '$(layers) loadout: set up';
      item.tooltip = 'Loadout is not configured yet. Click to set up.';
      break;
    case 'no-profile':
      item.text = '$(layers) loadout: no profile';
      item.tooltip = 'No loadout profile targets this repo. Click to open Studio.';
      break;
    case 'error':
      item.text = '$(warning) loadout';
      item.tooltip = 'The last loadout refresh failed. Click to view the log.';
      break;
    case 'unsupported':
      item.text = '$(layers) loadout: unavailable';
      item.tooltip = 'Loadout does not support this platform yet.';
      break;
  }
  item.command = 'loadout.menu';
  item.show();
}
