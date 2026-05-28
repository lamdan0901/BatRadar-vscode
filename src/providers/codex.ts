import { ProviderUsageData, UsageWindow, ExtraUsage } from './types';

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
