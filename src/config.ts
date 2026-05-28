import * as vscode from 'vscode';

export interface BatRadarConfig {
  pollInterval: number;
  alertThreshold: number;
  criticalThreshold: number;
  enabledProviders: string[];
  notificationsEnabled: boolean;
}

const DEFAULTS: BatRadarConfig = {
  pollInterval: 30,
  alertThreshold: 0.8,
  criticalThreshold: 0.95,
  enabledProviders: ['claude', 'codex'],
  notificationsEnabled: true,
};

export function getConfig(): BatRadarConfig {
  const cfg = vscode.workspace.getConfiguration('batradar');
  return {
    pollInterval: cfg.get<number>('pollInterval', DEFAULTS.pollInterval),
    alertThreshold: cfg.get<number>('alertThreshold', DEFAULTS.alertThreshold),
    criticalThreshold: cfg.get<number>('criticalThreshold', DEFAULTS.criticalThreshold),
    enabledProviders: cfg.get<string[]>('enabledProviders', DEFAULTS.enabledProviders),
    notificationsEnabled: cfg.get<boolean>('notificationsEnabled', DEFAULTS.notificationsEnabled),
  };
}

export function onConfigChanged(callback: (config: BatRadarConfig) => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (
      e.affectsConfiguration('batradar.pollInterval') ||
      e.affectsConfiguration('batradar.alertThreshold') ||
      e.affectsConfiguration('batradar.criticalThreshold') ||
      e.affectsConfiguration('batradar.enabledProviders') ||
      e.affectsConfiguration('batradar.notificationsEnabled')
    ) {
      callback(getConfig());
    }
  });
}
