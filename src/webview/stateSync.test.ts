import assert from 'node:assert/strict';
import { PollingEngine, PollingDeps } from '../polling';
import { ProviderUsageData } from '../providers/types';
import { buildFullUpdateMessage } from './stateSync';

function sampleUsage(label: string): ProviderUsageData {
  return {
    session: { utilization: 0.25, reset_at: '2099-07-06T12:00:00Z' },
    weekly: { utilization: 0.5, reset_at: '2099-07-12T12:00:00Z' },
    weekly_sonnet: null,
    weekly_opus: null,
    plan_type: label,
    last_updated: '2099-07-06T10:00:00Z',
  };
}

function createDeps(nowRef: { value: number }): PollingDeps {
  return {
    now: () => nowRef.value,
    readClaudeToken: () => 'claude-token',
    readCodexAuth: () => ({ token: 'codex-token', accountId: 'acct_123' }),
    getClaudeAuthMethod: () => 'oauth',
    refreshClaudeToken: async () => 'claude-token-fresh',
    refreshCodexAuth: async () => ({ token: 'codex-token-fresh', accountId: 'acct_123' }),
    fetchClaudeUsage: async () => ({ ok: true } as never),
    parseClaudeUsage: () => sampleUsage('claude'),
    fetchCodexUsage: async () => ({ ok: true } as never),
    parseCodexUsage: () => sampleUsage('codex'),
  };
}

async function testReconciledMessageProjectsCurrentDisabledState(): Promise<void> {
  const nowRef = { value: 1_000_000 };
  const polling = new PollingEngine(createDeps(nowRef));

  await polling.poll();
  polling.setEnabledProviders(['codex']);

  const message = buildFullUpdateMessage(polling);
  const claude = message.states.find((state) => state.id === 'claude');

  assert.equal(message.type, 'full-update');
  assert.equal(claude?.status, 'disabled');
  assert.equal(claude?.usage?.plan_type, 'claude');
}

async function main(): Promise<void> {
  await testReconciledMessageProjectsCurrentDisabledState();
  console.log('stateSync.test.ts passed');
}

void main();
