import { ProviderId, ProviderState, ProviderStatus } from './providers/types';

export type StatusBarPhase = 'loading' | 'zero-connected' | 'connected';
export type StatusBarUsageTone = 'normal' | 'warning' | 'error';
const PROVIDER_ORDER: ProviderId[] = ['claude', 'codex'];

export interface ZeroConnectedPresentation {
  text: string;
  tooltip: string;
  colorTone: 'warning' | 'error';
}

export interface ConnectedStatusBarPresentation {
  id: ProviderId;
  text: string;
  tone: StatusBarUsageTone;
}

export function shouldShowStatusBarUsageDetails(status: ProviderStatus): boolean {
  return status === 'connected';
}

export function getStatusBarPhase(states: ProviderState[], loading: boolean): StatusBarPhase {
  const connected = states.filter((state) => state.status === 'connected' && state.usage);
  if (connected.length > 0) {
    return 'connected';
  }

  if (loading) {
    return 'loading';
  }

  return 'zero-connected';
}

function getUsageTone(utilization: number, alertThreshold: number, criticalThreshold: number): StatusBarUsageTone {
  if (utilization >= criticalThreshold) {
    return 'error';
  }
  if (utilization >= alertThreshold) {
    return 'warning';
  }
  return 'normal';
}

function getProviderIconId(id: ProviderId): string {
  return id === 'claude' ? 'batradar-claude' : 'batradar-codex';
}

export function getConnectedStatusBarPresentations(
  states: ProviderState[],
  alertThreshold: number,
  criticalThreshold: number
): ConnectedStatusBarPresentation[] {
  return states
    .filter((state): state is ProviderState & { usage: NonNullable<ProviderState['usage']> } => (
      state.status === 'connected' && state.usage !== null
    ))
    .sort((left, right) => PROVIDER_ORDER.indexOf(left.id) - PROVIDER_ORDER.indexOf(right.id))
    .map((state) => {
      const sessionUsed = state.usage.session?.utilization ?? 0;
      const weeklyUsed = state.usage.weekly?.utilization ?? 0;
      const highestUtilization = Math.max(sessionUsed, weeklyUsed);
      const sessionRemaining = Math.round((1 - sessionUsed) * 100);
      const weeklyRemaining = Math.round((1 - weeklyUsed) * 100);

      return {
        id: state.id,
        text: `$(${getProviderIconId(state.id)})${sessionRemaining}%/${weeklyRemaining}%`,
        tone: getUsageTone(highestUtilization, alertThreshold, criticalThreshold),
      };
    });
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
