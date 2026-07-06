import assert from 'node:assert/strict';
import { ProviderState } from '../providers/types';
import { getWebviewContent } from './content';

const states: ProviderState[] = [
  {
    id: 'claude',
    status: 'connected',
    usage: {
      session: null,
      weekly: {
        utilization: 0.42,
        reset_at: '2099-06-25T09:20:00',
      },
      weekly_sonnet: null,
      weekly_opus: null,
      last_updated: '2099-06-20T10:00:00',
    },
  },
  {
    id: 'codex',
    status: 'expired',
    usage: {
      session: { utilization: 0.1, reset_at: '2099-06-25T09:20:00' },
      weekly: { utilization: 0.2, reset_at: '2099-06-28T09:20:00' },
      weekly_sonnet: null,
      weekly_opus: null,
      last_updated: '2099-06-20T10:00:00',
    },
  },
];

const html = getWebviewContent(states);

assert.match(html, /resets 09:20AM on 25 Jun/);
assert.doesNotMatch(html, /resets in /);
assert.match(html, /label\.indexOf\('Weekly'\) === 0/);
assert.match(html, /Token expired — re-authenticate/);
assert.match(html, /⚠ Expired/);

console.log('content.test.ts passed');
