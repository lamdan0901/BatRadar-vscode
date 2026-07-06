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
