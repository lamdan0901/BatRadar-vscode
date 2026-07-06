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
