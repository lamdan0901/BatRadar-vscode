import * as vscode from 'vscode';
import { PollingEngine } from '../polling';
import { getWebviewContent } from './content';
import { buildFullUpdateMessage } from './stateSync';

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

    this.panel.webview.html = getWebviewContent(buildFullUpdateMessage(this.polling).states);

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

    this.polling.onUsageUpdate((_e) => {
      this.sendFullUpdate();
    }, this.disposables);

    this.polling.onProviderStatusChanged((_e) => {
      this.sendFullUpdate();
    }, this.disposables);
  }

  private sendFullUpdate(): void {
    this.postMessage(buildFullUpdateMessage(this.polling));
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
