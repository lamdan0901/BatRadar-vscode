import { ProviderId, ProviderState } from './providers/types';

export class StatusBarLoadingTracker {
  private pendingProviders = new Set<ProviderId>();

  reset(states: ProviderState[]): void {
    this.pendingProviders = new Set(
      states.filter((state) => state.status !== 'disabled').map((state) => state.id)
    );
  }

  markResolved(provider: ProviderId): void {
    this.pendingProviders.delete(provider);
  }

  isLoading(): boolean {
    return this.pendingProviders.size > 0;
  }
}
