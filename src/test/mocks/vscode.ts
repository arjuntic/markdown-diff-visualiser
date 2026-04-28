/**
 * Mock for the 'vscode' module used in unit tests.
 *
 * Provides stubs for the VS Code APIs used by webviewPanelManager.ts,
 * including WebviewPanel, ExtensionContext, Uri, and window APIs.
 */

import * as sinon from 'sinon';

// --- Uri mock ---

export class Uri {
  readonly scheme: string;
  readonly path: string;

  private constructor(scheme: string, path: string) {
    this.scheme = scheme;
    this.path = path;
  }

  static file(path: string): Uri {
    return new Uri('file', path);
  }

  static joinPath(base: Uri, ...pathSegments: string[]): Uri {
    const joined = [base.path, ...pathSegments].join('/');
    return new Uri(base.scheme, joined);
  }

  toString(): string {
    return `${this.scheme}://${this.path}`;
  }
}

// --- Enums ---

export enum ViewColumn {
  One = 1,
  Two = 2,
  Three = 3,
}

export enum ColorThemeKind {
  Light = 1,
  Dark = 2,
  HighContrast = 3,
  HighContrastLight = 4,
}

// --- Webview mock ---

export function createMockWebview(): any {
  return {
    html: '',
    options: {},
    cspSource: 'mock-csp-source',
    onDidReceiveMessage: sinon.stub().returns({ dispose: sinon.stub() }),
    postMessage: sinon.stub().resolves(true),
    asWebviewUri: sinon.stub().callsFake((uri: Uri) => uri),
  };
}

// --- WebviewPanel mock ---

export function createMockWebviewPanel(): any {
  const webview = createMockWebview();
  const onDidDisposeListeners: Function[] = [];

  const panel: any = {
    viewType: 'markdownDiffVisualiser',
    title: '',
    webview,
    visible: true,
    viewColumn: ViewColumn.One,
    onDidDispose: sinon
      .stub()
      .callsFake((listener: Function, _thisArg?: any, disposables?: any[]) => {
        onDidDisposeListeners.push(listener);
        const disposable = { dispose: sinon.stub() };
        if (disposables) {
          disposables.push(disposable);
        }
        return disposable;
      }),
    reveal: sinon.stub(),
    dispose: sinon.stub().callsFake(() => {
      // Trigger onDidDispose listeners when panel is disposed
      onDidDisposeListeners.forEach((fn) => fn());
    }),
    // Test helper to access dispose listeners
    _onDidDisposeListeners: onDidDisposeListeners,
  };

  return panel;
}

// --- ExtensionContext mock ---

export function createMockExtensionContext(): any {
  return {
    extensionUri: Uri.file('/mock/extension'),
    extensionPath: '/mock/extension',
    subscriptions: [],
    workspaceState: {
      get: sinon.stub(),
      update: sinon.stub(),
    },
    globalState: {
      get: sinon.stub(),
      update: sinon.stub(),
    },
    storagePath: '/mock/storage',
    globalStoragePath: '/mock/global-storage',
    logPath: '/mock/log',
  };
}

// --- Theme change listener tracking ---

let themeChangeListeners: Function[] = [];

export function _getThemeChangeListeners(): Function[] {
  return themeChangeListeners;
}

export function _resetThemeChangeListeners(): void {
  themeChangeListeners = [];
}

// --- window mock ---

export const window = {
  createWebviewPanel: sinon.stub(),
  onDidChangeActiveColorTheme: sinon
    .stub()
    .callsFake((listener: Function, _thisArg?: any, disposables?: any[]) => {
      themeChangeListeners.push(listener);
      const disposable = { dispose: sinon.stub() };
      if (disposables) {
        disposables.push(disposable);
      }
      return disposable;
    }),
  showErrorMessage: sinon.stub(),
  showInformationMessage: sinon.stub(),
  showWarningMessage: sinon.stub(),
};
