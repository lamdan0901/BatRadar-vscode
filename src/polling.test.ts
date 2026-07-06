import assert from 'node:assert/strict';
import { PollingEngine, PollingDeps } from './polling';
import { ProviderUsageData } from './providers/types';

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

async function testMissingCredentialsBecomesDisconnected(): Promise<void> {
  const nowRef = { value: 1_000_000 };
  const deps = createDeps(nowRef);
  deps.readClaudeToken = () => null;

  const polling = new PollingEngine(deps);
  await polling.poll();

  assert.equal(polling.getProviderState('claude').status, 'disconnected');
}

async function testSuccessfulFetchBecomesConnected(): Promise<void> {
  const nowRef = { value: 1_000_000 };
  const polling = new PollingEngine(createDeps(nowRef));

  await polling.poll();

  const state = polling.getProviderState('claude');
  assert.equal(state.status, 'connected');
  assert.equal(state.usage?.plan_type, 'claude');
}

async function testRateLimitAddsBackoffWithoutError(): Promise<void> {
  const nowRef = { value: 1_000_000 };
  let calls = 0;
  const deps = createDeps(nowRef);
  deps.fetchClaudeUsage = async () => {
    calls += 1;
    throw new Error('rate_limited');
  };

  const polling = new PollingEngine(deps);
  await polling.poll();
  nowRef.value += 31_000;
  await polling.poll();

  assert.equal(calls, 1);
  assert.equal(polling.getProviderState('claude').status, 'disconnected');
}

async function testExpiredRefreshRetryCanRecover(): Promise<void> {
  const nowRef = { value: 1_000_000 };
  let calls = 0;
  const deps = createDeps(nowRef);
  deps.fetchClaudeUsage = async () => {
    calls += 1;
    if (calls === 1) {
      throw new Error('token_expired');
    }
    return {} as never;
  };

  const polling = new PollingEngine(deps);
  await polling.poll();

  const state = polling.getProviderState('claude');
  assert.equal(state.status, 'connected');
  assert.equal(calls, 2);
}

async function testExpiredStatusPreservesCachedUsage(): Promise<void> {
  const nowRef = { value: 1_000_000 };
  const deps = createDeps(nowRef);
  let shouldFail = false;

  deps.fetchCodexUsage = async () => {
    if (shouldFail) {
      throw new Error('token_expired');
    }
    return {} as never;
  };
  deps.refreshCodexAuth = async () => {
    throw new Error('refresh_failed:401');
  };

  const polling = new PollingEngine(deps);
  await polling.poll();

  shouldFail = true;
  nowRef.value += 600_000;
  await polling.poll();

  const state = polling.getProviderState('codex');
  assert.equal(state.status, 'expired');
  assert.equal(state.usage?.plan_type, 'codex');
}

async function testDisablingProviderEmitsDisabledStatusAndPreservesCachedUsage(): Promise<void> {
  const nowRef = { value: 1_000_000 };
  const polling = new PollingEngine(createDeps(nowRef));
  const statuses: string[] = [];

  polling.onProviderStatusChanged((event) => {
    if (event.provider === 'claude') {
      statuses.push(event.status);
    }
  });

  await polling.poll();
  polling.setEnabledProviders(['codex']);

  const state = polling.getProviderState('claude');
  assert.equal(state.status, 'disabled');
  assert.equal(state.usage?.plan_type, 'claude');
  assert.deepEqual(statuses, ['connected', 'disabled']);
}

async function testLateSubscriberDoesNotReplayDisabledStatusWhileEnabledProvidersRemain(): Promise<void> {
  const nowRef = { value: 1_000_000 };
  const polling = new PollingEngine(createDeps(nowRef));
  const statuses: string[] = [];

  polling.setEnabledProviders(['codex']);

  polling.onProviderStatusChanged((event) => {
    if (event.provider === 'claude') {
      statuses.push(event.status);
    }
  });

  polling.emitDisabledProviderStatuses();

  assert.deepEqual(statuses, []);
}

async function testLateSubscriberCanReplayDisabledStatusWhenAllProvidersDisabled(): Promise<void> {
  const nowRef = { value: 1_000_000 };
  const polling = new PollingEngine(createDeps(nowRef));
  const statuses: string[] = [];

  polling.setEnabledProviders([]);

  polling.onProviderStatusChanged((event) => {
    statuses.push(`${event.provider}:${event.status}`);
  });

  polling.emitDisabledProviderStatuses();

  assert.deepEqual(statuses, ['claude:disabled', 'codex:disabled']);
}

async function testNonAuthFailureBecomesError(): Promise<void> {
  const nowRef = { value: 1_000_000 };
  const deps = createDeps(nowRef);
  deps.fetchClaudeUsage = async () => {
    throw new Error('api_error:500');
  };

  const polling = new PollingEngine(deps);
  await polling.poll();

  assert.equal(polling.getProviderState('claude').status, 'error');
}

async function main(): Promise<void> {
  await testMissingCredentialsBecomesDisconnected();
  await testSuccessfulFetchBecomesConnected();
  await testRateLimitAddsBackoffWithoutError();
  await testExpiredRefreshRetryCanRecover();
  await testExpiredStatusPreservesCachedUsage();
  await testDisablingProviderEmitsDisabledStatusAndPreservesCachedUsage();
  await testLateSubscriberDoesNotReplayDisabledStatusWhileEnabledProvidersRemain();
  await testLateSubscriberCanReplayDisabledStatusWhenAllProvidersDisabled();
  await testNonAuthFailureBecomesError();
  console.log('polling.test.ts passed');
}

void main();
