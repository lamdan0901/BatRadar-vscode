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
];

const html = getWebviewContent(states);

assert.match(html, /resets 09:20AM on 25 Jun/);
assert.doesNotMatch(html, /resets in /);
assert.match(html, /label\.indexOf\('Weekly'\) === 0/);

console.log('content.test.ts passed');
