import * as vscode from 'vscode';
import { getConfig, onConfigChanged } from './config';
import { PollingEngine, UsageUpdateEvent, ProviderStatusEvent } from './polling';
import { ProviderId } from './providers/types';
import { StatusBarLoadingTracker } from './statusBarLoading';
import { StatusBarManager } from './statusBar';
import { BatRadarPanel } from './webview/panel';

export function activate(context: vscode.ExtensionContext) {
  const config = getConfig();
  const polling = new PollingEngine();
  const statusBar = new StatusBarManager();
  const panel = new BatRadarPanel(context.extensionUri, polling);
  const loadingTracker = new StatusBarLoadingTracker();
  const getAllProviderStates = () => (['claude', 'codex'] as ProviderId[]).map((id) => polling.getProviderState(id));
  const resetLoadingTracker = () => {
    loadingTracker.reset(getAllProviderStates());
  };
  const syncStatusBar = (resolvedProvider?: ProviderId) => {
    if (resolvedProvider) {
      loadingTracker.markResolved(resolvedProvider);
    }
    statusBar.update(getAllProviderStates(), { loading: loadingTracker.isLoading() });
  };

  statusBar.setThresholds(config.alertThreshold, config.criticalThreshold);
  polling.setEnabledProviders(config.enabledProviders);
  resetLoadingTracker();

  polling.onUsageUpdate((e: UsageUpdateEvent) => {
    syncStatusBar(e.provider);
  });

  polling.onProviderStatusChanged((e: ProviderStatusEvent) => {
    syncStatusBar(e.provider);
  });

  if (!polling.hasEnabledProviders()) {
    syncStatusBar();
  }

  context.subscriptions.push(onConfigChanged((newConfig) => {
    statusBar.setThresholds(newConfig.alertThreshold, newConfig.criticalThreshold);
    polling.setEnabledProviders(newConfig.enabledProviders);
    resetLoadingTracker();
    syncStatusBar();
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
