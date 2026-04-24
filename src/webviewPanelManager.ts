/**
 * Webview Panel Manager - Creates and manages the WebviewPanel.
 * Handles messaging between extension and webview.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { DiffMode } from './gitService';

export interface PanelManager {
  showPreview(data: PreviewData): void;
  /** Send an arbitrary message to the webview. */
  postMessage(message: Record<string, unknown>): void;
  dispose(): void;
  isOpen(): boolean;
}

export interface PreviewData {
  oldHtml: string;
  newHtml: string;
  fileName: string;
  fileStatus: 'modified' | 'added' | 'deleted' | 'renamed';
  diffMode: DiffMode;
  commitRef?: string;
}

export interface WebviewMessage {
  type: 'refresh' | 'switchMode' | 'scroll';
  payload?: Record<string, unknown>;
}

export type MessageCallback = (message: WebviewMessage) => void;

export function createPanelManager(
  context: vscode.ExtensionContext,
  onMessage?: MessageCallback
): PanelManager {
  let panel: vscode.WebviewPanel | undefined;
  const disposables: vscode.Disposable[] = [];

  function getWebviewContent(webview: vscode.Webview): string {
    const webviewDir = vscode.Uri.joinPath(context.extensionUri, 'src', 'webview');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewDir, 'main.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewDir, 'styles.css'));

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource};">
  <link rel="stylesheet" href="${styleUri}">
  <title>Markdown Diff Preview</title>
</head>
<body>
  <div class="panel-header">
    <span class="file-name" id="fileName"></span>
    <span class="file-status" id="fileStatus"></span>
  </div>
  <div class="diff-container">
    <div class="diff-pane diff-pane-left" id="oldPane"></div>
    <div class="diff-pane diff-pane-right" id="newPane"></div>
  </div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
  }

  function createPanel(): vscode.WebviewPanel {
    const newPanel = vscode.window.createWebviewPanel(
      'markdownDiffPreview',
      'Markdown Diff Preview',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'src', 'webview'),
        ],
        retainContextWhenHidden: true,
      }
    );

    // Handle panel disposal by the user
    newPanel.onDidDispose(
      () => {
        panel = undefined;
        disposeListeners();
      },
      null,
      disposables
    );

    // Listen for messages from the webview
    newPanel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => {
        if (onMessage) {
          onMessage(message);
        }
      },
      null,
      disposables
    );

    // Listen for theme changes
    const themeDisposable = vscode.window.onDidChangeActiveColorTheme((theme) => {
      if (panel) {
        let kind: 'light' | 'dark' | 'highContrast';
        switch (theme.kind) {
          case vscode.ColorThemeKind.Light:
            kind = 'light';
            break;
          case vscode.ColorThemeKind.Dark:
            kind = 'dark';
            break;
          case vscode.ColorThemeKind.HighContrast:
          case vscode.ColorThemeKind.HighContrastLight:
            kind = 'highContrast';
            break;
          default:
            kind = 'dark';
        }
        panel.webview.postMessage({ type: 'themeChanged', payload: { kind } });
      }
    });
    disposables.push(themeDisposable);

    // Set the HTML content
    newPanel.webview.html = getWebviewContent(newPanel.webview);

    return newPanel;
  }

  function disposeListeners(): void {
    while (disposables.length > 0) {
      const d = disposables.pop();
      if (d) {
        d.dispose();
      }
    }
  }

  const manager: PanelManager = {
    showPreview(data: PreviewData): void {
      if (!panel) {
        panel = createPanel();
      } else {
        panel.reveal(vscode.ViewColumn.One);
      }

      panel.title = `Diff: ${data.fileName}`;

      panel.webview.postMessage({
        type: 'update',
        payload: {
          oldHtml: data.oldHtml,
          newHtml: data.newHtml,
          fileName: data.fileName,
          fileStatus: data.fileStatus,
          diffMode: data.diffMode,
          commitRef: data.commitRef,
        },
      });
    },

    postMessage(message: Record<string, unknown>): void {
      if (panel) {
        panel.webview.postMessage(message);
      }
    },

    dispose(): void {
      if (panel) {
        panel.dispose();
        panel = undefined;
      }
      disposeListeners();
    },

    isOpen(): boolean {
      return panel !== undefined && panel.visible;
    },
  };

  // Register the manager's dispose with the extension context
  context.subscriptions.push({ dispose: () => manager.dispose() });

  return manager;
}
