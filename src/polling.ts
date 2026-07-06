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
        this.setStatus('claude', 'disconnected');
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
        this.setStatus('codex', 'disconnected');
      } else {
        this.setStatus('codex', 'error');
      }
    }
  }
}
