import * as vscode from 'vscode';
import { ProviderId, ProviderState, ProviderStatus, ProviderUsageData } from './providers/types';
import { readClaudeToken } from './providers/credentials';
import { readCodexAuth } from './providers/credentials';
import { fetchClaudeUsage, parseClaudeUsage } from './providers/claude';
import { fetchCodexUsage, parseCodexUsage } from './providers/codex';

export interface UsageUpdateEvent {
  provider: ProviderId;
  data: ProviderUsageData;
}

export interface ProviderStatusEvent {
  provider: ProviderId;
  status: ProviderStatus;
}

interface InternalProviderState {
  cache: ProviderUsageData | null;
  extraDelay: number;
  lastPollAt: number;
  alertState: Record<string, unknown>;
}

const MIN_POLL_GAP_MS = 30_000;
const INITIAL_DELAY_MS = 5_000;
const MAX_EXTRA_DELAY_S = 300;

export class PollingEngine {
  private timer: ReturnType<typeof setInterval> | undefined;
  private initialTimer: ReturnType<typeof setTimeout> | undefined;
  private providerState: Record<ProviderId, InternalProviderState> = {
    claude: { cache: null, extraDelay: 0, lastPollAt: 0, alertState: {} },
    codex:  { cache: null, extraDelay: 0, lastPollAt: 0, alertState: {} },
  };

  private readonly _onUsageUpdate = new vscode.EventEmitter<UsageUpdateEvent>();
  private readonly _onProviderStatusChanged = new vscode.EventEmitter<ProviderStatusEvent>();

  public readonly onUsageUpdate = this._onUsageUpdate.event;
  public readonly onProviderStatusChanged = this._onProviderStatusChanged.event;

  private enabledProviders: ProviderId[] = ['claude', 'codex'];

  setEnabledProviders(providers: string[]): void {
    this.enabledProviders = providers.filter(
      (p): p is ProviderId => p === 'claude' || p === 'codex'
    );
  }

  start(intervalSec: number): void {
    this.stop();
    this.initialTimer = setTimeout(() => {
      this.initialTimer = undefined;
      this.poll();
      this.timer = setInterval(() => this.poll(), intervalSec * 1000);
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
      status: enabled ? (st.cache ? 'connected' : 'disconnected') : 'disabled',
      usage: st.cache,
    };
  }

  dispose(): void {
    this.stop();
    this._onUsageUpdate.dispose();
    this._onProviderStatusChanged.dispose();
  }

  private async pollClaude(): Promise<void> {
    const st = this.providerState.claude;
    const now = Date.now();

    if (now - st.lastPollAt < MIN_POLL_GAP_MS) {
      return;
    }

    const token = readClaudeToken();
    if (!token) {
      this._onProviderStatusChanged.fire({ provider: 'claude', status: 'disconnected' });
      return;
    }

    try {
      st.lastPollAt = now;
      const raw = await fetchClaudeUsage(token);
      const data = parseClaudeUsage(raw);
      st.cache = data;
      st.extraDelay = 0;
      this._onUsageUpdate.fire({ provider: 'claude', data });
      this._onProviderStatusChanged.fire({ provider: 'claude', status: 'connected' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'token_expired') {
        this._onProviderStatusChanged.fire({ provider: 'claude', status: 'expired' });
      } else if (msg === 'rate_limited') {
        st.extraDelay = Math.min((st.extraDelay || 30) * 2, MAX_EXTRA_DELAY_S);
      } else {
        this._onProviderStatusChanged.fire({ provider: 'claude', status: 'error' });
      }
    }
  }

  private async pollCodex(): Promise<void> {
    const st = this.providerState.codex;
    const now = Date.now();

    if (st.lastPollAt > 0 && now - st.lastPollAt < MIN_POLL_GAP_MS) {
      return;
    }

    const auth = readCodexAuth();
    if (!auth) {
      this._onProviderStatusChanged.fire({ provider: 'codex', status: 'disconnected' });
      return;
    }

    try {
      st.lastPollAt = now;
      const raw = await fetchCodexUsage(auth.token, auth.accountId);
      const data = parseCodexUsage(raw);
      st.cache = data;
      st.extraDelay = 0;
      this._onUsageUpdate.fire({ provider: 'codex', data });
      this._onProviderStatusChanged.fire({ provider: 'codex', status: 'connected' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'token_expired') {
        this._onProviderStatusChanged.fire({ provider: 'codex', status: 'expired' });
      } else if (msg === 'rate_limited') {
        st.extraDelay = Math.min((st.extraDelay || 30) * 2, MAX_EXTRA_DELAY_S);
      } else {
        this._onProviderStatusChanged.fire({ provider: 'codex', status: 'error' });
      }
    }
  }
}
