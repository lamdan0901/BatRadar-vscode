import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { refreshClaudeToken, refreshCodexAuth } from './credentials';

const originalFetch = globalThis.fetch;
const originalClaudeDir = process.env.CLAUDE_CONFIG_DIR;
const originalCodexHome = process.env.CODEX_HOME;

function tempDir(name: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

async function testClaudeRefreshSuccess(): Promise<void> {
  const dir = tempDir('batradar-claude');
  process.env.CLAUDE_CONFIG_DIR = dir;
  const credPath = path.join(dir, '.credentials.json');

  fs.writeFileSync(credPath, JSON.stringify({
    claudeAiOauth: {
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      subscriptionType: 'pro',
    },
  }, null, 2));

  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    assert.equal(url, 'https://console.anthropic.com/v1/oauth/token');
    assert.match(String(init?.body), /"client_id":"9d1c250a-e61b-44d9-88ed-5944d1962f5e"/);
    assert.match(String(init?.body), /"refresh_token":"old-refresh"/);
    return jsonResponse({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      expires_in: 3600,
    });
  }) as typeof fetch;

  const token = await refreshClaudeToken();
  const saved = JSON.parse(fs.readFileSync(credPath, 'utf8'));

  assert.equal(token, 'new-access');
  assert.equal(saved.claudeAiOauth.accessToken, 'new-access');
  assert.equal(saved.claudeAiOauth.refreshToken, 'new-refresh');
  assert.equal(typeof saved.claudeAiOauth.expiresAt, 'number');
  assert.equal(fs.existsSync(`${credPath}.batradar-tmp`), false);
}

async function testClaudeRefreshFailure(): Promise<void> {
  const dir = tempDir('batradar-claude-fail');
  process.env.CLAUDE_CONFIG_DIR = dir;
  const credPath = path.join(dir, '.credentials.json');

  fs.writeFileSync(credPath, JSON.stringify({
    claudeAiOauth: {
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
    },
  }, null, 2));

  globalThis.fetch = (async () => ({ ok: false, status: 401 } as Response)) as typeof fetch;

  await assert.rejects(() => refreshClaudeToken(), /refresh_failed:401/);

  const saved = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  assert.equal(saved.claudeAiOauth.accessToken, 'old-access');
}

async function testCodexRefreshSuccess(): Promise<void> {
  const dir = tempDir('batradar-codex');
  process.env.CODEX_HOME = dir;
  const credPath = path.join(dir, 'auth.json');

  fs.writeFileSync(credPath, JSON.stringify({
    tokens: {
      access_token: 'old-access',
      refresh_token: 'old-refresh',
      id_token: 'old-id',
      account_id: 'acct_123',
    },
  }, null, 2));

  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    assert.equal(url, 'https://auth.openai.com/oauth/token');
    assert.match(String(init?.body), /"client_id":"app_EMoamEEZ73f0CkXaXp7hrann"/);
    assert.match(String(init?.body), /"scope":"openid profile email"/);
    return jsonResponse({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      id_token: 'new-id',
    });
  }) as typeof fetch;

  const auth = await refreshCodexAuth();
  const saved = JSON.parse(fs.readFileSync(credPath, 'utf8'));

  assert.deepEqual(auth, { token: 'new-access', accountId: 'acct_123' });
  assert.equal(saved.tokens.access_token, 'new-access');
  assert.equal(saved.tokens.refresh_token, 'new-refresh');
  assert.equal(saved.tokens.id_token, 'new-id');
  assert.equal(typeof saved.last_refresh, 'string');
  assert.equal(fs.existsSync(`${credPath}.batradar-tmp`), false);
}

async function main(): Promise<void> {
  try {
    await testClaudeRefreshSuccess();
    await testClaudeRefreshFailure();
    await testCodexRefreshSuccess();
  } finally {
    globalThis.fetch = originalFetch;
    process.env.CLAUDE_CONFIG_DIR = originalClaudeDir;
    process.env.CODEX_HOME = originalCodexHome;
  }

  console.log('credentials.test.ts passed');
}

void main();
