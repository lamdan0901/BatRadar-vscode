export type ProviderId = 'claude' | 'codex';

export type ProviderStatus = 'connected' | 'disconnected' | 'expired' | 'error' | 'disabled';

export interface UsageWindow {
  utilization: number;
  reset_at: string | null;
}

export interface ExtraUsage {
  spend: number;
  limit: number;
  utilization?: number;
  currency: string;
}

export interface ProviderUsageData {
  session: UsageWindow | null;
  weekly: UsageWindow | null;
  weekly_sonnet?: UsageWindow | null;
  weekly_opus?: UsageWindow | null;
  extra_usage?: ExtraUsage | null;
  plan_type?: string | null;
  last_updated: string;
}

export interface ProviderState {
  id: ProviderId;
  status: ProviderStatus;
  usage: ProviderUsageData | null;
}
