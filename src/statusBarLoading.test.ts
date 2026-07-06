import assert from 'node:assert/strict';
import { ProviderState } from './providers/types';
import { StatusBarLoadingTracker } from './statusBarLoading';
import { getStatusBarPhase } from './statusBarSummary';

function state(id: ProviderState['id'], status: ProviderState['status']): ProviderState {
  return { id, status, usage: null };
}

function testLoadingPersistsWhileAnotherEnabledProviderIsPending(): void {
  const tracker = new StatusBarLoadingTracker();
  tracker.reset([
    state('claude', 'disabled'),
    state('codex', 'disconnected'),
  ]);

  assert.equal(tracker.isLoading(), true);

  tracker.markResolved('claude');
  assert.equal(tracker.isLoading(), true);

  tracker.markResolved('codex');
  assert.equal(tracker.isLoading(), false);
}

function testReconcilePreservesResolvedProvidersAcrossUnrelatedConfigChanges(): void {
  const tracker = new StatusBarLoadingTracker();
  tracker.reset([
    state('claude', 'error'),
    state('codex', 'disabled'),
  ]);

  tracker.markResolved('claude');
  assert.equal(tracker.isLoading(), false);

  tracker.reconcile([
    state('claude', 'error'),
    state('codex', 'disabled'),
  ]);

  assert.equal(tracker.isLoading(), false);
}

function testConnectedPhaseWinsWhileAnotherEnabledProviderIsPending(): void {
  const phase = getStatusBarPhase([
    {
      id: 'claude',
      status: 'connected',
      usage: {
        session: { utilization: 0.1, reset_at: '2099-06-25T09:20:00' },
        weekly: { utilization: 0.15, reset_at: '2099-06-28T09:20:00' },
        weekly_sonnet: null,
        weekly_opus: null,
        last_updated: '2099-06-20T10:00:00',
      },
    },
    state('codex', 'disconnected'),
  ], true);

  assert.equal(phase, 'connected');
}

function main(): void {
  testLoadingPersistsWhileAnotherEnabledProviderIsPending();
  testReconcilePreservesResolvedProvidersAcrossUnrelatedConfigChanges();
  testConnectedPhaseWinsWhileAnotherEnabledProviderIsPending();
  console.log('statusBarLoading.test.ts passed');
}

main();
