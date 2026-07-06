import assert from 'node:assert/strict';
import { ProviderState } from './providers/types';
import { getZeroConnectedPresentation, shouldShowStatusBarUsageDetails } from './statusBarSummary';

function state(id: ProviderState['id'], status: ProviderState['status']): ProviderState {
  return { id, status, usage: null };
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

function main(): void {
  testAllDisabledStatesStayExplicit();
  testMixedNonConnectedStatesStayExplicit();
  testNonConnectedStatusesHideUsageDetails();
  console.log('statusBarSummary.test.ts passed');
}

main();
