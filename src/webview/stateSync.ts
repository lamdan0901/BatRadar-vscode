import { ProviderId, ProviderState } from '../providers/types';

interface ProviderStateReader {
  getProviderState(id: ProviderId): ProviderState;
}

export interface FullUpdateMessage {
  type: 'full-update';
  states: ProviderState[];
}

export function buildFullUpdateMessage(providerStateReader: ProviderStateReader): FullUpdateMessage {
  const providers: ProviderId[] = ['claude', 'codex'];
  return {
    type: 'full-update',
    states: providers.map((id) => providerStateReader.getProviderState(id)),
  };
}
