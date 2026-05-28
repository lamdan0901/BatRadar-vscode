import * as vscode from 'vscode';
import { ProviderId, ProviderState, ProviderStatus } from './providers/types';

export class StatusBarManager {
  private item: vscode.StatusBarItem;
  private providerStates: Map<ProviderId, ProviderState> = new Map();
  private loading = true;
  private alertThreshold = 0.8;
  private criticalThreshold = 0.95;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.item.command = 'batradar.showDetails';
    this.showLoading();
    this.item.show();
  }

  setThresholds(alert: number, critical: number): void {
    this.alertThreshold = alert;
    this.criticalThreshold = critical;
  }

  update(providers: ProviderState[]): void {
    this.loading = false;
    for (const p of providers) {
      this.providerStates.set(p.id, p);
    }
    this.render();
  }

  updateSingle(provider: ProviderState): void {
    this.loading = false;
    this.providerStates.set(provider.id, provider);
    this.render();
  }

  removeProvider(id: ProviderId): void {
    this.providerStates.delete(id);
    this.render();
  }

  private render(): void {
    const states = Array.from(this.providerStates.values());
    const connected = states.filter(s => s.status === 'connected' && s.usage);
    const anyDisconnected = states.some(s =>
      ['disconnected', 'expired', 'error'].includes(s.status)
    );

    if (connected.length === 0 && anyDisconnected) {
      this.showDisconnected();
      return;
    }

    if (connected.length === 0) {
      if (this.loading) {
        this.showLoading();
      } else {
        this.showDisconnected();
      }
      return;
    }

    const parts: string[] = [];
    let highestUsed = 0;

    for (const s of connected) {
      const sessionUsed = s.usage?.session?.utilization ?? 0;
      const weeklyUsed = s.usage?.weekly?.utilization ?? 0;
      const sessionRem = Math.round((1 - sessionUsed) * 100);
      const weeklyRem = Math.round((1 - weeklyUsed) * 100);
      parts.push(`${sessionRem}%/${weeklyRem}%`);
      if (sessionUsed > highestUsed) { highestUsed = sessionUsed; }
      if (weeklyUsed > highestUsed) { highestUsed = weeklyUsed; }
    }

    let icon = '$(pulse)';
    if (highestUsed >= 0.95) {
      icon = '$(error)';
    } else if (highestUsed >= 0.80) {
      icon = '$(warning)';
    }

    this.item.text = `${icon} ${parts.join(' | ')}`;
    this.item.color = this.getUsageColor(highestUsed);
    this.item.backgroundColor = this.getUsageBackground(highestUsed);
    this.item.tooltip = this.buildTooltip(states);
  }

  private getUsageColor(util: number): vscode.ThemeColor | undefined {
    if (util >= 0.95) {
      return new vscode.ThemeColor('statusBarItem.errorForeground');
    }
    if (util >= 0.80) {
      return new vscode.ThemeColor('statusBarItem.warningForeground');
    }
    return undefined;
  }

  private getUsageBackground(util: number): vscode.ThemeColor | undefined {
    if (util >= this.criticalThreshold) {
      return new vscode.ThemeColor('statusBarItem.errorBackground');
    }
    if (util >= this.alertThreshold) {
      return new vscode.ThemeColor('statusBarItem.warningBackground');
    }
    return undefined;
  }

  private buildTooltip(states: ProviderState[]): vscode.MarkdownString {
    const md = new vscode.MarkdownString('', true);
    md.isTrusted = true;
    md.supportThemeIcons = true;

    for (const s of states) {
      const name = s.id === 'claude' ? 'Claude' : 'Codex';
      const statusLabel = this.getStatusLabel(s.status);

      md.appendMarkdown(`**${name}** — ${statusLabel}\n\n`);

      if (s.usage) {
        const sessionUsed = s.usage.session?.utilization ?? 0;
        const weeklyUsed = s.usage.weekly?.utilization ?? 0;
        const sessionRem = Math.round((1 - sessionUsed) * 100);
        const weeklyRem = Math.round((1 - weeklyUsed) * 100);

        md.appendMarkdown(`| Window | Remaining |\n|---|---|\n`);
        md.appendMarkdown(`| Session (5h) | ${sessionRem}% |\n`);
        md.appendMarkdown(`| Weekly (7d) | ${weeklyRem}% |\n`);

        if (s.usage.weekly_sonnet) {
          const rem = Math.round((1 - s.usage.weekly_sonnet.utilization) * 100);
          md.appendMarkdown(`| Weekly Sonnet | ${rem}% |\n`);
        }
        if (s.usage.weekly_opus) {
          const rem = Math.round((1 - s.usage.weekly_opus.utilization) * 100);
          md.appendMarkdown(`| Weekly Opus | ${rem}% |\n`);
        }

        md.appendMarkdown(`\n`);

        if (s.usage.session?.reset_at) {
          const resetLine = this.fmtResetWithClock(s.usage.session.reset_at);
          md.appendMarkdown(`*Session reset ${resetLine}*\n\n`);
        }

        if (s.usage.extra_usage) {
          const eu = s.usage.extra_usage;
          md.appendMarkdown(
            `Extra spend: ${eu.currency} ${eu.spend.toFixed(2)} / ${eu.currency} ${eu.limit.toFixed(2)}\n\n`
          );
        }

        if (s.usage.plan_type) {
          md.appendMarkdown(`Plan: ${s.usage.plan_type}\n\n`);
        }
      } else {
        md.appendMarkdown(`*No usage data available*\n\n`);
      }
    }

    md.appendMarkdown(`---\n\n`);
    md.appendMarkdown(`*Click to open details panel*`);
    return md;
  }

  private getStatusLabel(status: ProviderStatus): string {
    switch (status) {
      case 'connected':
        return '$(check) Connected';
      case 'disconnected':
        return '$(circle-slash) Disconnected';
      case 'expired':
        return '$(warning) Token expired';
      case 'error':
        return '$(error) Error';
      case 'disabled':
        return '$(circle-slash) Disabled';
      default:
        return status;
    }
  }

  private fmtResetWithClock(iso: string): string {
    const resetDate = new Date(iso);
    const seconds = Math.max(0, Math.floor((resetDate.getTime() - Date.now()) / 1000));
    if (seconds <= 0) {
      return 'now';
    }
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    let dur: string;
    if (h > 0) {
      dur = `in ${h}h ${m}m`;
    } else {
      dur = `in ${m}m`;
    }
    const hours = resetDate.getHours();
    const mins = resetDate.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h12 = hours % 12 || 12;
    const mm = mins.toString().padStart(2, '0');
    return `${dur} until ${h12}:${mm} ${ampm}`;
  }

  private showDisconnected(): void {
    this.item.text = '$(circle-slash) BatRadar';
    this.item.color = new vscode.ThemeColor('statusBarItem.warningForeground');
    this.item.backgroundColor = undefined;
    this.item.tooltip = 'BatRadar — No providers connected';
  }

  private showLoading(): void {
    this.item.text = '$(loading~spin) BatRadar';
    this.item.color = undefined;
    this.item.backgroundColor = undefined;
    this.item.tooltip = 'BatRadar — Loading...';
  }

  dispose(): void {
    this.item.dispose();
  }
}
