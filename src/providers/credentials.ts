import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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
    const raw = fs.readFileSync(getClaudeCredPath(), 'utf8');
    const d = JSON.parse(raw);
    return d?.claudeAiOauth?.accessToken || d?.oauth_token || d?.access_token || null;
  } catch {
    return null;
  }
}

export function readClaudePlan(): string | null {
  if (readManualApiKey()) return 'api-key';
  try {
    const raw = fs.readFileSync(getClaudeCredPath(), 'utf8');
    const d = JSON.parse(raw);
    return d?.claudeAiOauth?.subscriptionType || d?.account_type || null;
  } catch {
    return null;
  }
}

export function getClaudeAuthMethod(): 'api-key' | 'oauth' | 'none' {
  if (readManualApiKey()) return 'api-key';
  try {
    const raw = fs.readFileSync(getClaudeCredPath(), 'utf8');
    const d = JSON.parse(raw);
    if (d?.claudeAiOauth?.accessToken) return 'oauth';
  } catch {}
  return 'none';
}

export interface CodexAuth {
  token: string;
  accountId: string;
}

export function readCodexAuth(): CodexAuth | null {
  try {
    const raw = fs.readFileSync(getCodexCredPath(), 'utf8');
    const d = JSON.parse(raw);
    const token = d?.tokens?.access_token;
    const accountId = d?.tokens?.account_id;
    if (token && accountId) return { token, accountId };
  } catch {}
  return null;
}

export function readCodexPlan(cachedPlanType?: string): string | null {
  if (cachedPlanType) return cachedPlanType;
  try {
    const raw = fs.readFileSync(getCodexCredPath(), 'utf8');
    const d = JSON.parse(raw);
    const idToken = d?.tokens?.id_token;
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
