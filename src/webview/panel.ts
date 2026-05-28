import * as vscode from 'vscode';
import { ProviderId, ProviderState } from '../providers/types';
import { PollingEngine } from '../polling';
import { getWebviewContent } from './content';

export class BatRadarPanel {
  private panel: vscode.WebviewPanel | undefined;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly polling: PollingEngine,
  ) {}

  show(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      this.sendFullUpdate();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'batradarDetails',
      'BatRadar — AI Usage',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    const states = this.collectStates();
    this.panel.webview.html = getWebviewContent(states);

    this.panel.webview.onDidReceiveMessage(
      (msg: { type: string }) => {
        if (msg.type === 'refresh') {
          this.polling.poll();
        }
      },
      null,
      this.disposables,
    );

    this.panel.onDidDispose(
      () => {
        this.panel = undefined;
        this.disposeListeners();
      },
      null,
      this.disposables,
    );

    this.polling.onUsageUpdate((e) => {
      this.postMessage({
        type: 'usage-update',
        provider: e.provider,
        data: e.data,
      });
    }, this.disposables);

    this.polling.onProviderStatusChanged((e) => {
      this.postMessage({
        type: 'provider-status-changed',
        provider: e.provider,
        status: e.status,
      });
    }, this.disposables);
  }

  private sendFullUpdate(): void {
    const states = this.collectStates();
    this.postMessage({ type: 'full-update', states });
  }

  private collectStates(): ProviderState[] {
    const providers: ProviderId[] = ['claude', 'codex'];
    return providers.map((id) => this.polling.getProviderState(id));
  }

  private postMessage(message: unknown): void {
    if (this.panel) {
      this.panel.webview.postMessage(message);
    }
  }

  private disposeListeners(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }

  dispose(): void {
    if (this.panel) {
      this.panel.dispose();
    }
    this.disposeListeners();
  }
}
