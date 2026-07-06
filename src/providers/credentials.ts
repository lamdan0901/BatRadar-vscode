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
  const existingMode = fs.existsSync(filePath)
    ? fs.statSync(filePath).mode & 0o777
    : undefined;
  fs.writeFileSync(tmpPath, JSON.stringify(value, null, 2), existingMode != null ? { mode: existingMode } : undefined);
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
