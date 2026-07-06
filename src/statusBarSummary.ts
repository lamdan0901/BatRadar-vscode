import { ProviderState, ProviderStatus } from './providers/types';

export interface ZeroConnectedPresentation {
  text: string;
  tooltip: string;
  colorTone: 'warning' | 'error';
}

const STATUS_PRIORITY: Record<ProviderStatus, number> = {
  connected: 0,
  disabled: 1,
  disconnected: 2,
  expired: 3,
  error: 4,
};

function getName(id: ProviderState['id']): string {
  return id === 'claude' ? 'Claude' : 'Codex';
}

function getPhrase(status: ProviderStatus): string {
  switch (status) {
    case 'disabled':
      return 'disabled';
    case 'disconnected':
      return 'disconnected';
    case 'expired':
      return 'token expired';
    case 'error':
      return 'error';
    default:
      return status;
  }
}

function getHighestPriorityStatus(states: ProviderState[]): ProviderStatus {
  return states.reduce<ProviderStatus>((highest, state) => {
    return STATUS_PRIORITY[state.status] > STATUS_PRIORITY[highest] ? state.status : highest;
  }, 'disabled');
}

export function getZeroConnectedPresentation(states: ProviderState[]): ZeroConnectedPresentation {
  if (states.length === 0) {
    return {
      text: '$(circle-slash) BatRadar',
      tooltip: 'BatRadar - No providers connected',
      colorTone: 'warning',
    };
  }

  const highestStatus = getHighestPriorityStatus(states);
  const icon = highestStatus === 'error'
    ? '$(error)'
    : highestStatus === 'expired'
      ? '$(warning)'
      : '$(circle-slash)';

  return {
    text: `${icon} BatRadar`,
    tooltip: `BatRadar - ${states.map((state) => `${getName(state.id)} ${getPhrase(state.status)}`).join('; ')}`,
    colorTone: highestStatus === 'error' ? 'error' : 'warning',
  };
}
