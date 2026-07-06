import assert from 'node:assert/strict';
import { ProviderState } from './providers/types';
import {
  getConnectedStatusBarPresentations,
  getStatusBarPhase,
  getZeroConnectedPresentation,
  shouldShowStatusBarUsageDetails,
} from './statusBarSummary';

function state(id: ProviderState['id'], status: ProviderState['status']): ProviderState {
  return { id, status, usage: null };
}

function connectedState(
  id: ProviderState['id'],
  sessionUtilization: number,
  weeklyUtilization: number
): ProviderState {
  return {
    id,
    status: 'connected',
    usage: {
      session: { utilization: sessionUtilization, reset_at: '2099-06-25T09:20:00' },
      weekly: { utilization: weeklyUtilization, reset_at: '2099-06-28T09:20:00' },
      weekly_sonnet: null,
      weekly_opus: null,
      last_updated: '2099-06-20T10:00:00',
    },
  };
}

function testAllDisabledStatesStayExplicit(): void {
  const presentation = getZeroConnectedPresentation([
    state('claude', 'disabled'),
    state('codex', 'disabled'),
  ]);

  assert.equal(presentation.text, '$(circle-slash) BatRadar');
  assert.equal(presentation.tooltip, 'BatRadar - Claude disabled; Codex disabled');
  assert.equal(presentation.colorTone, 'warning');
}

function testMixedNonConnectedStatesStayExplicit(): void {
  const presentation = getZeroConnectedPresentation([
    state('claude', 'disabled'),
    state('codex', 'error'),
  ]);

  assert.equal(presentation.text, '$(error) BatRadar');
  assert.equal(presentation.tooltip, 'BatRadar - Claude disabled; Codex error');
  assert.equal(presentation.colorTone, 'error');
}

function testNonConnectedStatusesHideUsageDetails(): void {
  assert.equal(shouldShowStatusBarUsageDetails('connected'), true);
  assert.equal(shouldShowStatusBarUsageDetails('disabled'), false);
  assert.equal(shouldShowStatusBarUsageDetails('expired'), false);
  assert.equal(shouldShowStatusBarUsageDetails('error'), false);
}

function testConnectedProvidersKeepIndependentWarningTones(): void {
  const presentations = getConnectedStatusBarPresentations([
    connectedState('claude', 0.10, 0.15),
    connectedState('codex', 0.82, 0.30),
  ], 0.8, 0.95);

  assert.deepEqual(presentations, [
    { id: 'claude', text: '$(batradar-claude)90%/85%', tone: 'normal' },
    { id: 'codex', text: '$(batradar-codex)18%/70%', tone: 'warning' },
  ]);
}

function testConnectedProvidersKeepIndependentErrorTones(): void {
  const presentations = getConnectedStatusBarPresentations([
    connectedState('claude', 0.96, 0.40),
    connectedState('codex', 0.15, 0.30),
  ], 0.8, 0.95);

  assert.deepEqual(presentations, [
    { id: 'claude', text: '$(batradar-claude)4%/60%', tone: 'error' },
    { id: 'codex', text: '$(batradar-codex)85%/70%', tone: 'normal' },
  ]);
}

function testConnectedPhaseWinsOverLoadingWhenUsageExists(): void {
  const phase = getStatusBarPhase([
    connectedState('claude', 0.10, 0.15),
    state('codex', 'disconnected'),
  ], true);

  assert.equal(phase, 'connected');
}

function testLoadingPhaseShowsWhileNoConnectedUsageExists(): void {
  const phase = getStatusBarPhase([
    state('claude', 'disconnected'),
    state('codex', 'disconnected'),
  ], true);

  assert.equal(phase, 'loading');
}

function testConnectedPresentationsStayInProviderOrder(): void {
  const presentations = getConnectedStatusBarPresentations([
    connectedState('codex', 0.20, 0.30),
    connectedState('claude', 0.10, 0.15),
  ], 0.8, 0.95);

  assert.deepEqual(presentations.map((presentation) => presentation.id), ['claude', 'codex']);
}

function main(): void {
  testAllDisabledStatesStayExplicit();
  testMixedNonConnectedStatesStayExplicit();
  testNonConnectedStatusesHideUsageDetails();
  testConnectedPhaseWinsOverLoadingWhenUsageExists();
  testLoadingPhaseShowsWhileNoConnectedUsageExists();
  testConnectedProvidersKeepIndependentWarningTones();
  testConnectedProvidersKeepIndependentErrorTones();
  testConnectedPresentationsStayInProviderOrder();
  console.log('statusBarSummary.test.ts passed');
}

main();
