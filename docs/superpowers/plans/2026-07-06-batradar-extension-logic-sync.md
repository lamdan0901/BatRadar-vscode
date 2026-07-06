# BatRadar Extension Logic Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the VS Code extension's provider polling and auth-refresh behavior up to parity with the upstream BatRadar runtime without changing the extension's overall UI structure.

**Architecture:** Keep the current extension layout and make the smallest logic-focused changes. `src/providers/*` remains responsible for remote API calls and credential-file updates, while `src/polling.ts` becomes the single place that tracks explicit provider runtime state, applies backoff, rate-limits refresh attempts, and preserves stale cached usage separately from status.

**Tech Stack:** TypeScript, VS Code extension host APIs, Node 20 built-in `fetch`, `node:assert/strict` colocated tests compiled by `tsc`

## Global Constraints

- Update the VS Code extension in `batradar-vscode` to match the current upstream BatRadar provider-management logic from `BatRadar` where that logic is relevant to the extension runtime.
- The sync is limited to provider polling, credential refresh, backoff, and provider status handling.
- Electron-only tray, window, and floating UI behaviors remain out of scope.
- Keep the existing extension UI structure while improving the logic that feeds it.
- Preserve current provider parsing and credential file locations unless the upstream logic requires a change.
- Token file updates must be atomic so the upstream CLIs never observe partially written JSON.
- Refresh attempts are rate-limited to one per provider per 5 minutes.
- Polling remains parallel across providers so one provider's delay or error does not block the other.
- Keep the current extension endpoint unless additional endpoint fallback is required later by a concrete breakage.
- This change should remain a targeted logic sync and avoid unrelated refactors.

---

## File Map

- Modify: `package.json`
  Responsibility: point the existing `npm test` flow at a multi-file compiled test runner.
- Create: `src/test/run.ts`
  Responsibility: import every compiled test module so one `node` process runs the whole lightweight suite.
- Modify: `src/providers/claude.ts`
  Responsibility: keep Claude usage fetch/parsing and add the upstream-compatible OAuth refresh request.
- Modify: `src/providers/codex.ts`
  Responsibility: keep Codex usage fetch/parsing and add the upstream-compatible OAuth refresh request.
- Modify: `src/providers/credentials.ts`
  Responsibility: keep credential discovery/read helpers and own atomic writes plus high-level refresh flows that update the on-disk auth files.
- Create: `src/providers/credentials.test.ts`
  Responsibility: cover Claude and Codex refresh success/failure paths and practical atomic-write behavior.
- Create: `src/lib/simpleEvent.ts`
  Responsibility: replace the runtime-only `vscode.EventEmitter` dependency inside `PollingEngine` so the polling logic can run in plain Node tests.
- Modify: `src/polling.ts`
  Responsibility: track explicit provider runtime state, apply per-provider backoff, rate-limit refresh attempts, retry once after refresh, and expose test seams.
- Create: `src/polling.test.ts`
  Responsibility: cover polling state transitions, backoff behavior, refresh retry behavior, and `getProviderState()` cache-vs-status semantics.
- Modify: `src/extension.ts`
  Responsibility: always reconcile status-bar state from `PollingEngine.getProviderState()` instead of deleting disconnected providers outright.
- Modify: `src/webview/content.test.ts`
  Responsibility: regression-check that an explicit non-connected state wins over stale cached usage in the rendered details HTML.

### Task 1: Provider Refresh Helpers And Test Harness

**Files:**
- Create: `src/test/run.ts`
- Create: `src/providers/credentials.test.ts`
- Modify: `package.json:91-97`
- Modify: `src/providers/claude.ts:1-87`
- Modify: `src/providers/codex.ts:1-86`
- Modify: `src/providers/credentials.ts:1-134`

**Interfaces:**
- Consumes: credential files at `getClaudeCredPath()` and `getCodexCredPath()`; `globalThis.fetch`
- Produces: `requestClaudeTokenRefresh(refreshToken: string): Promise<ClaudeRefreshResponse>`
- Produces: `requestCodexTokenRefresh(refreshToken: string): Promise<CodexRefreshResponse>`
- Produces: `refreshClaudeToken(): Promise<string>`
- Produces: `refreshCodexAuth(): Promise<CodexAuth>`

- [ ] **Step 1: Write the failing test**

```ts
// src/test/run.ts
import '../webview/content.test';
import '../providers/credentials.test';

console.log('run.ts passed');
```

```ts
// src/providers/credentials.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run compile`
Expected: FAIL with TypeScript errors such as `Module '"./credentials"' has no exported member 'refreshClaudeToken'` and `Cannot find module '../providers/credentials.test'`.

- [ ] **Step 3: Write minimal implementation**

```json
// package.json
{
  "name": "batradar",
  "displayName": "BatRadar — AI Usage Monitor",
  "description": "Monitor Claude and Codex AI usage in real-time from your status bar",
  "version": "0.1.0",
  "publisher": "batradar",
  "license": "MIT",
  "icon": "icon.png",
  "repository": {
    "type": "git",
    "url": "https://github.com/ZenithHawking/BatRadar.git"
  },
  "engines": {
    "vscode": "^1.89.0"
  },
  "categories": [
    "Other"
  ],
  "activationEvents": [
    "onStartupFinished"
  ],
  "main": "./out/extension.js",
  "contributes": {
    "icons": {
      "batradar-claude": {
        "description": "Claude Code icon",
        "default": {
          "fontPath": "fonts/batradar-icons.ttf",
          "fontCharacter": "\\E001"
        }
      },
      "batradar-codex": {
        "description": "Codex icon",
        "default": {
          "fontPath": "fonts/batradar-icons.ttf",
          "fontCharacter": "\\E002"
        }
      }
    },
    "commands": [
      {
        "command": "batradar.refresh",
        "title": "BatRadar: Refresh Now"
      },
      {
        "command": "batradar.showDetails",
        "title": "BatRadar: Show Details"
      },
      {
        "command": "batradar.openSettings",
        "title": "BatRadar: Open Settings"
      }
    ],
    "configuration": {
      "title": "BatRadar",
      "properties": {
        "batradar.pollInterval": {
          "type": "number",
          "default": 30,
          "description": "Polling interval in seconds"
        },
        "batradar.alertThreshold": {
          "type": "number",
          "default": 0.8,
          "description": "Usage percentage to trigger warning (0-1)"
        },
        "batradar.criticalThreshold": {
          "type": "number",
          "default": 0.95,
          "description": "Usage percentage to trigger critical alert (0-1)"
        },
        "batradar.enabledProviders": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "default": [
            "claude",
            "codex"
          ],
          "description": "List of providers to monitor"
        },
        "batradar.notificationsEnabled": {
          "type": "boolean",
          "default": true,
          "description": "Enable threshold alert notifications"
        }
      }
    }
  },
  "scripts": {
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "package": "vsce package",
    "test": "npm run compile && node out/test/run.js",
    "generate-icons": "node scripts/generate-icons.cjs"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@types/vscode": "^1.85.0",
    "@vscode/vsce": "^3.2.0",
    "svg2ttf": "^6.1.0",
    "svgicons2svgfont": "^16.0.0",
    "ttf2woff": "^3.0.0",
    "typescript": "^5.3.0"
  }
}
```

```ts
// src/providers/claude.ts
import { ProviderUsageData, UsageWindow, ExtraUsage } from './types';

const CLAUDE_OAUTH_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';

interface RawWindow {
  utilization?: number;
  resets_at?: string;
  reset_at?: string;
}

interface RawExtraUsage {
  is_enabled?: boolean;
  used_credits?: number;
  monthly_limit?: number;
  utilization?: number;
  currency?: string;
}

interface RawClaudeResponse {
  five_hour?: RawWindow;
  seven_day?: RawWindow;
  seven_day_sonnet?: RawWindow;
  seven_day_opus?: RawWindow;
  extra_usage?: RawExtraUsage;
  _authMethod?: string;
}

export interface ClaudeRefreshResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

function parseWindow(raw: RawWindow | undefined): UsageWindow | null {
  if (!raw || raw.utilization == null) {
    return null;
  }
  const util = raw.utilization > 1 ? raw.utilization / 100 : raw.utilization;
  return {
    utilization: Math.min(1, util),
    reset_at: raw.resets_at || raw.reset_at || null,
  };
}

export function parseClaudeUsage(raw: RawClaudeResponse): ProviderUsageData {
  const eu = raw.extra_usage;
  let extraUsage: ExtraUsage | null = null;
  if (eu && eu.is_enabled) {
    const util = eu.utilization != null
      ? (eu.utilization > 1 ? eu.utilization / 100 : eu.utilization)
      : 0;
    extraUsage = {
      spend: eu.used_credits != null ? eu.used_credits / 100 : 0,
      limit: eu.monthly_limit != null ? eu.monthly_limit / 100 : 0,
      utilization: util,
      currency: eu.currency || 'USD',
    };
  }

  return {
    session: parseWindow(raw.five_hour),
    weekly: parseWindow(raw.seven_day),
    weekly_sonnet: parseWindow(raw.seven_day_sonnet),
    weekly_opus: parseWindow(raw.seven_day_opus),
    extra_usage: extraUsage,
    last_updated: new Date().toISOString(),
  };
}

export async function fetchClaudeUsage(token: string): Promise<RawClaudeResponse> {
  const isApiKey = token.startsWith('sk-ant-api');
  if (isApiKey) {
    return { _authMethod: 'api-key' };
  }

  const res = await fetch('https://api.anthropic.com/api/oauth/usage', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'anthropic-beta': 'oauth-2025-04-20',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (res.status === 401) {
    throw new Error('token_expired');
  }
  if (res.status === 429) {
    throw new Error('rate_limited');
  }
  if (!res.ok) {
    throw new Error(`api_error:${res.status}`);
  }

  return res.json() as Promise<RawClaudeResponse>;
}

export async function requestClaudeTokenRefresh(refreshToken: string): Promise<ClaudeRefreshResponse> {
  const res = await fetch('https://console.anthropic.com/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLAUDE_OAUTH_CLIENT_ID,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`refresh_failed:${res.status}`);
  }

  const payload = await res.json() as ClaudeRefreshResponse;
  if (!payload.access_token) {
    throw new Error('refresh_failed:no_access_token');
  }

  return payload;
}
```

```ts
// src/providers/codex.ts
import { ProviderUsageData, UsageWindow, ExtraUsage } from './types';

const CODEX_OAUTH_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';

interface RawCodexWindow {
  used_percent?: number;
  reset_at?: number;
}

interface RawCodexCredits {
  has_credits?: boolean;
  balance?: string;
}

interface RawCodexRateLimit {
  primary_window?: RawCodexWindow;
  secondary_window?: RawCodexWindow;
}

interface RawCodexResponse {
  rate_limit?: RawCodexRateLimit;
  credits?: RawCodexCredits;
  plan_type?: string;
}

export interface CodexRefreshResponse {
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
}

function parseWindow(w: RawCodexWindow | undefined): UsageWindow | null {
  if (!w) {
    return null;
  }
  const pct = w.used_percent;
  if (pct == null) {
    return null;
  }
  const util = pct / 100;
  const resetAt = w.reset_at
    ? new Date(w.reset_at * 1000).toISOString()
    : null;
  return {
    utilization: Math.min(1, util),
    reset_at: resetAt,
  };
}

export function parseCodexUsage(raw: RawCodexResponse): ProviderUsageData {
  const rl = raw.rate_limit || {};
  const credits = raw.credits;
  let extraUsage: ExtraUsage | null = null;
  if (credits && credits.has_credits) {
    extraUsage = {
      spend: 0,
      limit: parseFloat(credits.balance || '0') || 0,
      currency: 'USD',
    };
  }

  return {
    session: parseWindow(rl.primary_window),
    weekly: parseWindow(rl.secondary_window),
    weekly_sonnet: null,
    weekly_opus: null,
    extra_usage: extraUsage,
    plan_type: raw.plan_type || null,
    last_updated: new Date().toISOString(),
  };
}

export async function fetchCodexUsage(token: string, accountId: string): Promise<RawCodexResponse> {
  const url = 'https://chatgpt.com/backend-api/wham/usage';

  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'ChatGPT-Account-Id': accountId,
    },
    signal: AbortSignal.timeout(15000),
  });

  if (res.status === 200) {
    return res.json() as Promise<RawCodexResponse>;
  }
  if (res.status === 429) {
    throw new Error('rate_limited');
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error('token_expired');
  }
  throw new Error(`api_error:${res.status}`);
}

export async function requestCodexTokenRefresh(refreshToken: string): Promise<CodexRefreshResponse> {
  const res = await fetch('https://auth.openai.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CODEX_OAUTH_CLIENT_ID,
      scope: 'openid profile email',
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`refresh_failed:${res.status}`);
  }

  const payload = await res.json() as CodexRefreshResponse;
  if (!payload.access_token) {
    throw new Error('refresh_failed:no_access_token');
  }

  return payload;
}
```

```ts
// src/providers/credentials.ts
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { requestClaudeTokenRefresh } from './claude';
import { requestCodexTokenRefresh } from './codex';

function getAppDataDir(): string {
  if (process.env.APPDATA) return process.env.APPDATA;
  const home = os.homedir();
  switch (process.platform) {
    case 'darwin':
      return path.join(home, 'Library', 'Application Support');
    case 'linux':
      return path.join(home, '.config');
    default:
      return path.join(home, 'AppData', 'Roaming');
  }
}

const BATRADAR_DIR = path.join(getAppDataDir(), 'batradar');
const APIKEY_PATH = path.join(BATRADAR_DIR, 'apikey.enc');
const TEMP_WRITE_SUFFIX = '.batradar-tmp';

function atomicWriteJson(filePath: string, value: unknown): void {
  const tmpPath = `${filePath}${TEMP_WRITE_SUFFIX}`;
  fs.writeFileSync(tmpPath, JSON.stringify(value, null, 2));
  fs.renameSync(tmpPath, filePath);
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

export function getClaudeCredPath(): string {
  const dirs = [
    process.env.CLAUDE_CONFIG_DIR,
    path.join(os.homedir(), '.claude'),
  ].filter(Boolean) as string[];
  for (const dir of dirs) {
    const p = path.join(dir, '.credentials.json');
    if (fs.existsSync(p)) return p;
  }
  return path.join(os.homedir(), '.claude', '.credentials.json');
}

export function getCodexCredPath(): string {
  const dirs = [
    process.env.CODEX_HOME,
    path.join(os.homedir(), '.codex'),
  ].filter(Boolean) as string[];
  for (const dir of dirs) {
    const p = path.join(dir, 'auth.json');
    if (fs.existsSync(p)) return p;
  }
  return path.join(os.homedir(), '.codex', 'auth.json');
}

export function readManualApiKey(): string | null {
  try {
    if (fs.existsSync(APIKEY_PATH)) {
      const encoded = fs.readFileSync(APIKEY_PATH, 'utf8').trim();
      return Buffer.from(encoded, 'base64').toString('utf8');
    }
  } catch {}
  return null;
}

export function saveManualApiKey(key: string): void {
  try {
    fs.mkdirSync(BATRADAR_DIR, { recursive: true });
    fs.writeFileSync(APIKEY_PATH, Buffer.from(key).toString('base64'));
  } catch (e) {
    console.error('saveManualApiKey', e);
  }
}

export function deleteManualApiKey(): void {
  try {
    if (fs.existsSync(APIKEY_PATH)) fs.unlinkSync(APIKEY_PATH);
  } catch {}
}

export function readClaudeToken(): string | null {
  const apiKey = readManualApiKey();
  if (apiKey) return apiKey;
  try {
    const d = readJsonFile<Record<string, unknown>>(getClaudeCredPath());
    return (d as any)?.claudeAiOauth?.accessToken || (d as any)?.oauth_token || (d as any)?.access_token || null;
  } catch {
    return null;
  }
}

export function readClaudePlan(): string | null {
  if (readManualApiKey()) return 'api-key';
  try {
    const d = readJsonFile<Record<string, unknown>>(getClaudeCredPath());
    return (d as any)?.claudeAiOauth?.subscriptionType || (d as any)?.account_type || null;
  } catch {
    return null;
  }
}

export function getClaudeAuthMethod(): 'api-key' | 'oauth' | 'none' {
  if (readManualApiKey()) return 'api-key';
  try {
    const d = readJsonFile<Record<string, unknown>>(getClaudeCredPath());
    if ((d as any)?.claudeAiOauth?.accessToken) return 'oauth';
  } catch {}
  return 'none';
}

export interface CodexAuth {
  token: string;
  accountId: string;
}

export function readCodexAuth(): CodexAuth | null {
  try {
    const d = readJsonFile<Record<string, unknown>>(getCodexCredPath());
    const token = (d as any)?.tokens?.access_token;
    const accountId = (d as any)?.tokens?.account_id;
    if (token && accountId) return { token, accountId };
  } catch {}
  return null;
}

export function readCodexPlan(cachedPlanType?: string): string | null {
  if (cachedPlanType) return cachedPlanType;
  try {
    const d = readJsonFile<Record<string, unknown>>(getCodexCredPath());
    const idToken = (d as any)?.tokens?.id_token;
    if (idToken) {
      const parts = idToken.split('.');
      if (parts.length >= 2) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
        return payload?.['https://api.openai.com/auth']?.chatgpt_plan_type || null;
      }
    }
  } catch {}
  return null;
}

export async function refreshClaudeToken(): Promise<string> {
  const credPath = getClaudeCredPath();
  const data = readJsonFile<any>(credPath);
  const refreshToken = data?.claudeAiOauth?.refreshToken;
  if (!refreshToken) {
    throw new Error('no_refresh_token');
  }

  const refreshed = await requestClaudeTokenRefresh(refreshToken);
  data.claudeAiOauth.accessToken = refreshed.access_token;
  if (refreshed.refresh_token) {
    data.claudeAiOauth.refreshToken = refreshed.refresh_token;
  }
  if (refreshed.expires_in) {
    data.claudeAiOauth.expiresAt = Date.now() + refreshed.expires_in * 1000;
  }

  atomicWriteJson(credPath, data);
  return data.claudeAiOauth.accessToken;
}

export async function refreshCodexAuth(): Promise<CodexAuth> {
  const credPath = getCodexCredPath();
  const data = readJsonFile<any>(credPath);
  const refreshToken = data?.tokens?.refresh_token;
  if (!refreshToken) {
    throw new Error('no_refresh_token');
  }

  const refreshed = await requestCodexTokenRefresh(refreshToken);
  data.tokens.access_token = refreshed.access_token;
  if (refreshed.id_token) {
    data.tokens.id_token = refreshed.id_token;
  }
  if (refreshed.refresh_token) {
    data.tokens.refresh_token = refreshed.refresh_token;
  }
  data.last_refresh = new Date().toISOString();

  atomicWriteJson(credPath, data);
  return {
    token: data.tokens.access_token,
    accountId: data.tokens.account_id,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS with lines including `content.test.ts passed`, `credentials.test.ts passed`, and `run.ts passed`.

- [ ] **Step 5: Commit**

```bash
git add package.json src/test/run.ts src/providers/claude.ts src/providers/codex.ts src/providers/credentials.ts src/providers/credentials.test.ts
git commit -m "feat: add provider token refresh helpers"
```

### Task 2: Polling Runtime State, Backoff, And Status Propagation

**Files:**
- Create: `src/lib/simpleEvent.ts`
- Create: `src/polling.test.ts`
- Modify: `src/test/run.ts`
- Modify: `src/polling.ts:1-170`
- Modify: `src/extension.ts:16-28`
- Modify: `src/webview/content.test.ts:1-28`

**Interfaces:**
- Consumes: `refreshClaudeToken(): Promise<string>`
- Consumes: `refreshCodexAuth(): Promise<CodexAuth>`
- Consumes: `requestClaudeTokenRefresh(refreshToken: string): Promise<ClaudeRefreshResponse>` indirectly through Task 1 helpers
- Produces: `SimpleEventEmitter<T>` with `event(listener, disposables?)`, `fire(value)`, `dispose()`
- Produces: `new PollingEngine(deps?: PollingDeps)`
- Produces: `getProviderState(id: ProviderId): ProviderState` returning explicit tracked `status` plus cached `usage`

- [ ] **Step 1: Write the failing test**

```ts
// src/test/run.ts
import '../webview/content.test';
import '../providers/credentials.test';
import '../polling.test';

console.log('run.ts passed');
```

```ts
// src/polling.test.ts
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
  await testNonAuthFailureBecomesError();
  console.log('polling.test.ts passed');
}

void main();
```

```ts
// src/webview/content.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL before assertions with a runtime error like `Cannot find module 'vscode'` from `out/polling.js`, plus the new polling expectations are not implemented yet.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/simpleEvent.ts
export interface DisposableLike {
  dispose(): void;
}

type Listener<T> = (event: T) => unknown;

export class SimpleEventEmitter<T> {
  private listeners = new Set<Listener<T>>();

  readonly event = (listener: Listener<T>, disposables?: DisposableLike[]): DisposableLike => {
    this.listeners.add(listener);

    const disposable: DisposableLike = {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };

    disposables?.push(disposable);
    return disposable;
  };

  fire(event: T): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  dispose(): void {
    this.listeners.clear();
  }
}
```

```ts
// src/polling.ts
import { ProviderId, ProviderState, ProviderStatus, ProviderUsageData } from './providers/types';
import { getClaudeAuthMethod, readClaudeToken, readCodexAuth, refreshClaudeToken, refreshCodexAuth } from './providers/credentials';
import { fetchClaudeUsage, parseClaudeUsage } from './providers/claude';
import { fetchCodexUsage, parseCodexUsage } from './providers/codex';
import { SimpleEventEmitter } from './lib/simpleEvent';

export interface UsageUpdateEvent {
  provider: ProviderId;
  data: ProviderUsageData;
}

export interface ProviderStatusEvent {
  provider: ProviderId;
  status: ProviderStatus;
}

interface InternalProviderState {
  status: ProviderStatus;
  cache: ProviderUsageData | null;
  extraDelay: number;
  lastPollAt: number;
  lastRefreshAt: number;
  alertState: Record<string, unknown>;
}

export interface PollingDeps {
  now: () => number;
  readClaudeToken: typeof readClaudeToken;
  readCodexAuth: typeof readCodexAuth;
  getClaudeAuthMethod: typeof getClaudeAuthMethod;
  refreshClaudeToken: typeof refreshClaudeToken;
  refreshCodexAuth: typeof refreshCodexAuth;
  fetchClaudeUsage: typeof fetchClaudeUsage;
  parseClaudeUsage: typeof parseClaudeUsage;
  fetchCodexUsage: typeof fetchCodexUsage;
  parseCodexUsage: typeof parseCodexUsage;
}

const MIN_POLL_GAP_MS = 30_000;
const INITIAL_DELAY_MS = 5_000;
const MAX_EXTRA_DELAY_S = 300;
const REFRESH_COOLDOWN_MS = 5 * 60 * 1000;

const defaultDeps: PollingDeps = {
  now: () => Date.now(),
  readClaudeToken,
  readCodexAuth,
  getClaudeAuthMethod,
  refreshClaudeToken,
  refreshCodexAuth,
  fetchClaudeUsage,
  parseClaudeUsage,
  fetchCodexUsage,
  parseCodexUsage,
};

export class PollingEngine {
  private timer: ReturnType<typeof setInterval> | undefined;
  private initialTimer: ReturnType<typeof setTimeout> | undefined;
  private providerState: Record<ProviderId, InternalProviderState> = {
    claude: { status: 'disconnected', cache: null, extraDelay: 0, lastPollAt: 0, lastRefreshAt: 0, alertState: {} },
    codex: { status: 'disconnected', cache: null, extraDelay: 0, lastPollAt: 0, lastRefreshAt: 0, alertState: {} },
  };

  private readonly _onUsageUpdate = new SimpleEventEmitter<UsageUpdateEvent>();
  private readonly _onProviderStatusChanged = new SimpleEventEmitter<ProviderStatusEvent>();

  public readonly onUsageUpdate = this._onUsageUpdate.event;
  public readonly onProviderStatusChanged = this._onProviderStatusChanged.event;

  private enabledProviders: ProviderId[] = ['claude', 'codex'];

  constructor(private readonly deps: PollingDeps = defaultDeps) {}

  setEnabledProviders(providers: string[]): void {
    this.enabledProviders = providers.filter(
      (p): p is ProviderId => p === 'claude' || p === 'codex'
    );
  }

  start(intervalSec: number): void {
    this.stop();
    this.initialTimer = setTimeout(() => {
      this.initialTimer = undefined;
      void this.poll();
      this.timer = setInterval(() => {
        void this.poll();
      }, intervalSec * 1000);
    }, INITIAL_DELAY_MS);
  }

  stop(): void {
    if (this.initialTimer) {
      clearTimeout(this.initialTimer);
      this.initialTimer = undefined;
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  restart(intervalSec: number): void {
    this.stop();
    this.start(intervalSec);
  }

  async poll(): Promise<void> {
    const tasks: Promise<void>[] = [];
    if (this.enabledProviders.includes('claude')) {
      tasks.push(this.pollClaude());
    }
    if (this.enabledProviders.includes('codex')) {
      tasks.push(this.pollCodex());
    }
    await Promise.allSettled(tasks);
  }

  getProviderState(id: ProviderId): ProviderState {
    const st = this.providerState[id];
    const enabled = this.enabledProviders.includes(id);
    return {
      id,
      status: enabled ? st.status : 'disabled',
      usage: st.cache,
    };
  }

  dispose(): void {
    this.stop();
    this._onUsageUpdate.dispose();
    this._onProviderStatusChanged.dispose();
  }

  private getMinPollGapMs(st: InternalProviderState): number {
    return MIN_POLL_GAP_MS + st.extraDelay * 1000;
  }

  private setStatus(provider: ProviderId, status: ProviderStatus): void {
    const st = this.providerState[provider];
    st.status = status;
    this._onProviderStatusChanged.fire({ provider, status });
  }

  private async tryRefresh(provider: ProviderId, st: InternalProviderState): Promise<boolean> {
    const now = this.deps.now();
    if (now - st.lastRefreshAt < REFRESH_COOLDOWN_MS) {
      return false;
    }

    st.lastRefreshAt = now;

    try {
      if (provider === 'claude') {
        await this.deps.refreshClaudeToken();
      } else {
        await this.deps.refreshCodexAuth();
      }
      return true;
    } catch {
      return false;
    }
  }

  private async pollClaude(): Promise<void> {
    const st = this.providerState.claude;
    const now = this.deps.now();

    if (st.lastPollAt > 0 && now - st.lastPollAt < this.getMinPollGapMs(st)) {
      return;
    }

    const token = this.deps.readClaudeToken();
    if (!token) {
      this.setStatus('claude', 'disconnected');
      return;
    }

    try {
      st.lastPollAt = now;
      const raw = await this.deps.fetchClaudeUsage(token);
      const data = this.deps.parseClaudeUsage(raw);
      st.cache = data;
      st.extraDelay = 0;
      st.status = 'connected';
      this._onUsageUpdate.fire({ provider: 'claude', data });
      this._onProviderStatusChanged.fire({ provider: 'claude', status: 'connected' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'token_expired') {
        if (this.deps.getClaudeAuthMethod() === 'oauth' && await this.tryRefresh('claude', st)) {
          st.lastPollAt = 0;
          return this.pollClaude();
        }
        this.setStatus('claude', 'expired');
      } else if (msg === 'rate_limited') {
        st.extraDelay = Math.min((st.extraDelay || 30) * 2, MAX_EXTRA_DELAY_S);
      } else {
        this.setStatus('claude', 'error');
      }
    }
  }

  private async pollCodex(): Promise<void> {
    const st = this.providerState.codex;
    const now = this.deps.now();

    if (st.lastPollAt > 0 && now - st.lastPollAt < this.getMinPollGapMs(st)) {
      return;
    }

    const auth = this.deps.readCodexAuth();
    if (!auth) {
      this.setStatus('codex', 'disconnected');
      return;
    }

    try {
      st.lastPollAt = now;
      const raw = await this.deps.fetchCodexUsage(auth.token, auth.accountId);
      const data = this.deps.parseCodexUsage(raw);
      st.cache = data;
      st.extraDelay = 0;
      st.status = 'connected';
      this._onUsageUpdate.fire({ provider: 'codex', data });
      this._onProviderStatusChanged.fire({ provider: 'codex', status: 'connected' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'token_expired') {
        if (await this.tryRefresh('codex', st)) {
          st.lastPollAt = 0;
          return this.pollCodex();
        }
        this.setStatus('codex', 'expired');
      } else if (msg === 'rate_limited') {
        st.extraDelay = Math.min((st.extraDelay || 30) * 2, MAX_EXTRA_DELAY_S);
      } else {
        this.setStatus('codex', 'error');
      }
    }
  }
}
```

```ts
// src/extension.ts
import * as vscode from 'vscode';
import { getConfig, onConfigChanged } from './config';
import { PollingEngine, UsageUpdateEvent, ProviderStatusEvent } from './polling';
import { StatusBarManager } from './statusBar';
import { BatRadarPanel } from './webview/panel';

export function activate(context: vscode.ExtensionContext) {
  const config = getConfig();
  const polling = new PollingEngine();
  const statusBar = new StatusBarManager();
  const panel = new BatRadarPanel(context.extensionUri, polling);

  statusBar.setThresholds(config.alertThreshold, config.criticalThreshold);
  polling.setEnabledProviders(config.enabledProviders);

  polling.onUsageUpdate((e: UsageUpdateEvent) => {
    const state = polling.getProviderState(e.provider);
    statusBar.updateSingle(state);
  });

  polling.onProviderStatusChanged((e: ProviderStatusEvent) => {
    const state = polling.getProviderState(e.provider);
    statusBar.updateSingle(state);
  });

  context.subscriptions.push(onConfigChanged((newConfig) => {
    statusBar.setThresholds(newConfig.alertThreshold, newConfig.criticalThreshold);
    polling.setEnabledProviders(newConfig.enabledProviders);
    polling.restart(newConfig.pollInterval);
  }));

  context.subscriptions.push(
    vscode.commands.registerCommand('batradar.refresh', () => {
      void polling.poll();
    }),
    vscode.commands.registerCommand('batradar.showDetails', () => {
      panel.show();
    }),
    vscode.commands.registerCommand('batradar.openSettings', () => {
      void vscode.commands.executeCommand('workbench.action.openSettings', 'batradar');
    })
  );

  polling.start(config.pollInterval);

  context.subscriptions.push({
    dispose() {
      polling.dispose();
      statusBar.dispose();
      panel.dispose();
    },
  });
}

export function deactivate() {}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS with lines including `content.test.ts passed`, `credentials.test.ts passed`, `polling.test.ts passed`, and `run.ts passed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/simpleEvent.ts src/polling.ts src/polling.test.ts src/extension.ts src/webview/content.test.ts src/test/run.ts
git commit -m "feat: sync extension polling state with upstream logic"
```

## Verification Notes

- `npm run compile` is the repo's effective typecheck command.
- `npm test` is the repo's existing test entry point after Task 1 rewires it to the compiled test runner.
- No lint script exists in `package.json` today, so do not invent one in this change.

## Self-Review

### Spec Coverage

- Claude refresh helper success and failure: covered by Task 1 tests and `refreshClaudeToken()`.
- Codex refresh helper success and failure: covered by Task 1 tests and `refreshCodexAuth()`.
- Atomic credential file writes: covered by Task 1 `atomicWriteJson()` and temp-file assertions.
- Polling transitions for disconnected, connected, rate-limited, expired, and error: covered by Task 2 tests.
- `getProviderState()` explicit status plus preserved cached usage: covered by Task 2 `testExpiredStatusPreservesCachedUsage()`.
- Status consumers using tracked state instead of inferred cache presence: covered by Task 2 `extension.ts` update and webview regression.

### Placeholder Scan

- No placeholder markers or deferred steps remain.
- Every code-edit step contains concrete file contents and concrete commands.

### Type Consistency

- Task 1 defines `refreshClaudeToken(): Promise<string>` and `refreshCodexAuth(): Promise<CodexAuth>`.
- Task 2 consumes those exact names in `PollingDeps` and `PollingEngine`.
- Task 2 keeps `ProviderState` unchanged and only changes how its `status` is populated.
