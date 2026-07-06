import { ProviderId, ProviderState } from './providers/types';

export class StatusBarLoadingTracker {
  private enabledProviders = new Set<ProviderId>();
  private pendingProviders = new Set<ProviderId>();

  reset(states: ProviderState[]): void {
    this.enabledProviders = new Set(
      states.filter((state) => state.status !== 'disabled').map((state) => state.id)
    );
    this.pendingProviders = new Set(this.enabledProviders);
  }

  reconcile(states: ProviderState[]): void {
    const nextEnabledProviders = new Set(
      states.filter((state) => state.status !== 'disabled').map((state) => state.id)
    );
    const nextPendingProviders = new Set<ProviderId>();

    for (const provider of this.pendingProviders) {
      if (nextEnabledProviders.has(provider)) {
        nextPendingProviders.add(provider);
      }
    }

    for (const provider of nextEnabledProviders) {
      if (!this.enabledProviders.has(provider)) {
        nextPendingProviders.add(provider);
      }
    }

    this.enabledProviders = nextEnabledProviders;
    this.pendingProviders = nextPendingProviders;
  }

  markResolved(provider: ProviderId): void {
    this.pendingProviders.delete(provider);
  }

  isLoading(): boolean {
    return this.pendingProviders.size > 0;
  }
}
