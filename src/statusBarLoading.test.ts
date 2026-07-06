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

function testLoadingPhaseWinsWhileConnectedProviderExistsButAnotherIsPending(): void {
  const phase = getStatusBarPhase([
    state('claude', 'connected'),
    state('codex', 'disconnected'),
  ], true);

  assert.equal(phase, 'loading');
}

function main(): void {
  testLoadingPersistsWhileAnotherEnabledProviderIsPending();
  testReconcilePreservesResolvedProvidersAcrossUnrelatedConfigChanges();
  testLoadingPhaseWinsWhileConnectedProviderExistsButAnotherIsPending();
  console.log('statusBarLoading.test.ts passed');
}

main();
