/**
 * Unit Tests for Error Handling Paths
 *
 * Tests error scenarios in the extension pipeline:
 * - Git not installed error shows correct message (GIT_NOT_INSTALLED → showErrorMessage)
 * - Malformed diff shows info message and logs warning (parseDiff returns empty → showInformationMessage)
 * - Rendering failure falls back to raw markdown (highlightDiff throws → fallback to escaped HTML)
 * - Webview disposed unexpectedly triggers cleanup (onDidDispose → resources cleaned up)
 *
 * Uses the same proxyquire approach as extension.test.ts to inject mocks.
 *
 * Requirements covered: 1.4, 9.2
 */

/* eslint-disable @typescript-eslint/no-require-imports */
import { expect } from 'chai';
import * as sinon from 'sinon';
import {
  createMockExtensionContext,
  createMockWebviewPanel,
  window as mockWindow,
  ViewColumn,
  ColorThemeKind,
  Uri,
  _resetThemeChangeListeners,
} from './mocks/vscode';

const proxyquire = require('proxyquire').noCallThru();

describe('Error Handling Paths', function () {
  // --- Stubs for internal modules ---
  let mockGitServiceInstance: any;
  let createGitServiceStub: sinon.SinonStub;
  let parseDiffStub: sinon.SinonStub;
  let reconstructContentStub: sinon.SinonStub;
  let highlightDiffStub: sinon.SinonStub;
  let mockPanelManagerInstance: any;
  let createPanelManagerStub: sinon.SinonStub;

  // --- VS Code mocks ---
  let mockContext: any;
  let registeredCommands: Record<string, Function>;
  let mockOutputChannel: any;
  let workspaceMock: any;
  let commandsMock: any;

  // The module under test, loaded fresh per test
  let extensionModule: any;

  // GitError class used in mocks
  let GitErrorClass: any;

  /**
   * Build a fresh vscode mock and load the extension module via proxyquire.
   * This ensures module-level state is reset for each test.
   */
  function loadExtensionModule() {
    // Reset stubs
    mockGitServiceInstance = {
      getDiff: sinon.stub(),
      getFileContent: sinon.stub(),
      hasChanges: sinon.stub(),
      getRepoRoot: sinon.stub(),
      getChangedMarkdownFiles: sinon.stub(),
    };
    createGitServiceStub = sinon.stub().returns(mockGitServiceInstance);

    parseDiffStub = sinon.stub();
    reconstructContentStub = sinon.stub();
    highlightDiffStub = sinon.stub();

    mockPanelManagerInstance = {
      showPreview: sinon.stub(),
      postMessage: sinon.stub(),
      dispose: sinon.stub(),
      isOpen: sinon.stub().returns(true),
    };
    createPanelManagerStub = sinon.stub().returns(mockPanelManagerInstance);

    // Track registered commands
    registeredCommands = {};
    commandsMock = {
      registerCommand: sinon.stub().callsFake((id: string, handler: Function) => {
        registeredCommands[id] = handler;
        return { dispose: sinon.stub() };
      }),
    };

    // Output channel mock
    mockOutputChannel = {
      appendLine: sinon.stub(),
      dispose: sinon.stub(),
    };

    // Workspace mock
    workspaceMock = {
      workspaceFolders: [
        { uri: { fsPath: '/mock/workspace' }, name: 'workspace', index: 0 },
      ],
      fs: {
        readFile: sinon.stub().resolves(Buffer.from('# Current Content\n\nSome text.')),
      },
      createFileSystemWatcher: sinon.stub().returns({
        onDidChange: sinon.stub().returns({ dispose: sinon.stub() }),
        onDidCreate: sinon.stub().returns({ dispose: sinon.stub() }),
        onDidDelete: sinon.stub().returns({ dispose: sinon.stub() }),
        dispose: sinon.stub(),
      }),
    };

    // Reset window stubs
    mockWindow.createWebviewPanel.reset();
    mockWindow.showErrorMessage.reset();
    mockWindow.showInformationMessage.reset();
    mockWindow.showWarningMessage.reset();
    mockWindow.onDidChangeActiveColorTheme.resetHistory();
    _resetThemeChangeListeners();

    // Build the full vscode mock
    const vscodeMock = {
      window: {
        ...mockWindow,
        activeTextEditor: undefined as any,
        createOutputChannel: sinon.stub().returns(mockOutputChannel),
      },
      commands: commandsMock,
      workspace: workspaceMock,
      ViewColumn,
      ColorThemeKind,
      Uri,
      RelativePattern: sinon.stub().callsFake((base: string, pattern: string) => ({
        base,
        pattern,
      })),
      '@noCallThru': true,
    };

    // Mock context
    mockContext = createMockExtensionContext();

    // Define GitError class for mocking
    GitErrorClass = class GitError extends Error {
      code: string;
      constructor(message: string, code: string) {
        super(message);
        this.name = 'GitError';
        this.code = code;
      }
    };

    // Load the extension module with all mocks injected
    extensionModule = proxyquire('../extension', {
      'vscode': vscodeMock,
      './gitService': {
        createGitService: createGitServiceStub,
        GitError: GitErrorClass,
        '@noCallThru': true,
      },
      './diffParser': {
        parseDiff: parseDiffStub,
        reconstructContent: reconstructContentStub,
        '@noCallThru': true,
      },
      './diffHighlighter': {
        highlightDiff: highlightDiffStub,
        '@noCallThru': true,
      },
      './webviewPanelManager': {
        createPanelManager: createPanelManagerStub,
        '@noCallThru': true,
      },
    });

    return vscodeMock;
  }

  afterEach(function () {
    sinon.restore();
  });

  describe('Git not installed error (GIT_NOT_INSTALLED)', function () {
    it('should show error message when git is not installed', async function () {
      const vscodeMock = loadExtensionModule();
      vscodeMock.window.activeTextEditor = {
        document: {
          uri: { fsPath: '/mock/workspace/README.md' },
          languageId: 'markdown',
        },
      };

      // Simulate GIT_NOT_INSTALLED error
      mockGitServiceInstance.getDiff.rejects(
        new GitErrorClass(
          'Git is not available. Please install Git to use Markdown Diff Visualiser.',
          'GIT_NOT_INSTALLED'
        )
      );

      extensionModule.activate(mockContext);
      const handler = registeredCommands['markdownDiffVisualiser.showChanges'];

      await handler();

      // Should show error message (not info message)
      expect(mockWindow.showErrorMessage.calledOnce).to.be.true;
      expect(mockWindow.showErrorMessage.firstCall.args[0]).to.include('Git is not available');

      // Should log the error to the output channel
      const logCalls = mockOutputChannel.appendLine.getCalls().map((c: any) => c.args[0]);
      const hasErrorLog = logCalls.some((msg: string) => msg.includes('Git is not available'));
      expect(hasErrorLog).to.be.true;

      // Should NOT have opened a panel
      expect(mockPanelManagerInstance.showPreview.called).to.be.false;
    });

    it('should show error message when repository is not found', async function () {
      const vscodeMock = loadExtensionModule();
      vscodeMock.window.activeTextEditor = {
        document: {
          uri: { fsPath: '/mock/workspace/README.md' },
          languageId: 'markdown',
        },
      };

      // Simulate NOT_A_REPO error
      mockGitServiceInstance.getDiff.rejects(
        new GitErrorClass(
          'No git repository found for the current workspace.',
          'NOT_A_REPO'
        )
      );

      extensionModule.activate(mockContext);
      const handler = registeredCommands['markdownDiffVisualiser.showChanges'];

      await handler();

      expect(mockWindow.showErrorMessage.calledOnce).to.be.true;
      expect(mockWindow.showErrorMessage.firstCall.args[0]).to.include('git repository');
    });

    it('should show info message when file is not tracked', async function () {
      const vscodeMock = loadExtensionModule();
      vscodeMock.window.activeTextEditor = {
        document: {
          uri: { fsPath: '/mock/workspace/README.md' },
          languageId: 'markdown',
        },
      };

      // Simulate FILE_NOT_TRACKED error
      mockGitServiceInstance.getDiff.rejects(
        new GitErrorClass(
          'This file is not tracked by git.',
          'FILE_NOT_TRACKED'
        )
      );

      extensionModule.activate(mockContext);
      const handler = registeredCommands['markdownDiffVisualiser.showChanges'];

      await handler();

      // FILE_NOT_TRACKED should show info message, not error
      expect(mockWindow.showInformationMessage.calledOnce).to.be.true;
      expect(mockWindow.showInformationMessage.firstCall.args[0]).to.include('not tracked');
    });
  });

  describe('Malformed diff handling', function () {
    it('should show info message when parseDiff returns empty for non-empty diff text', async function () {
      const vscodeMock = loadExtensionModule();
      vscodeMock.window.activeTextEditor = {
        document: {
          uri: { fsPath: '/mock/workspace/README.md' },
          languageId: 'markdown',
        },
      };

      // Git returns some text, but parseDiff returns empty (malformed diff)
      mockGitServiceInstance.getDiff.resolves('this is not a valid diff format');
      parseDiffStub.returns([]);

      extensionModule.activate(mockContext);
      const handler = registeredCommands['markdownDiffVisualiser.showChanges'];

      await handler();

      // Should show info message about no changes
      expect(mockWindow.showInformationMessage.calledOnce).to.be.true;
      expect(mockWindow.showInformationMessage.firstCall.args[0]).to.include('No changes found');

      // Should log a warning about parsed diff returning no results
      const logCalls = mockOutputChannel.appendLine.getCalls().map((c: any) => c.args[0]);
      const hasWarningLog = logCalls.some(
        (msg: string) => msg.includes('Parsed diff returned no results')
      );
      expect(hasWarningLog).to.be.true;

      // Should NOT have opened a panel
      expect(mockPanelManagerInstance.showPreview.called).to.be.false;
    });
  });

  describe('Rendering failure fallback', function () {
    it('should fall back to raw escaped HTML when highlightDiff throws', async function () {
      const vscodeMock = loadExtensionModule();
      vscodeMock.window.activeTextEditor = {
        document: {
          uri: { fsPath: '/mock/workspace/README.md' },
          languageId: 'markdown',
        },
      };

      const rawDiff = 'diff --git a/README.md b/README.md\n--- a/README.md\n+++ b/README.md\n@@ -1 +1 @@\n-old\n+new\n';
      const mockHunks = [
        {
          oldStart: 1,
          oldLines: 1,
          newStart: 1,
          newLines: 1,
          changes: [
            { type: 'del', content: 'old', oldLineNumber: 1 },
            { type: 'add', content: 'new', newLineNumber: 1 },
          ],
        },
      ];
      const mockDiffResult = {
        oldFilePath: 'README.md',
        newFilePath: 'README.md',
        hunks: mockHunks,
        status: 'modified',
      };

      mockGitServiceInstance.getDiff.resolves(rawDiff);
      parseDiffStub.returns([mockDiffResult]);
      reconstructContentStub.returns({
        oldContent: '# Old Content',
        newContent: '# Current Content\n\nSome text.',
      });

      // highlightDiff throws an error
      highlightDiffStub.throws(new Error('Rendering engine failure'));

      extensionModule.activate(mockContext);
      const handler = registeredCommands['markdownDiffVisualiser.showChanges'];

      await handler();

      // Should still show the preview panel (fallback rendering)
      expect(mockPanelManagerInstance.showPreview.calledOnce).to.be.true;

      const previewData = mockPanelManagerInstance.showPreview.firstCall.args[0];

      // Fallback should use escaped HTML in <pre> tags
      expect(previewData.oldHtml).to.include('<pre>');
      expect(previewData.oldHtml).to.include('# Old Content');
      expect(previewData.newHtml).to.include('<pre>');
      expect(previewData.newHtml).to.include('# Current Content');

      // Should log the rendering error
      const logCalls = mockOutputChannel.appendLine.getCalls().map((c: any) => c.args[0]);
      const hasRenderErrorLog = logCalls.some(
        (msg: string) => msg.includes('Rendering/highlighting error') && msg.includes('Rendering engine failure')
      );
      expect(hasRenderErrorLog).to.be.true;
    });

    it('should escape HTML special characters in fallback rendering', async function () {
      const vscodeMock = loadExtensionModule();
      vscodeMock.window.activeTextEditor = {
        document: {
          uri: { fsPath: '/mock/workspace/README.md' },
          languageId: 'markdown',
        },
      };

      const mockDiffResult = {
        oldFilePath: 'README.md',
        newFilePath: 'README.md',
        hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, changes: [{ type: 'del', content: 'old', oldLineNumber: 1 }, { type: 'add', content: 'new', newLineNumber: 1 }] }],
        status: 'modified',
      };

      mockGitServiceInstance.getDiff.resolves('diff text');
      parseDiffStub.returns([mockDiffResult]);
      reconstructContentStub.returns({
        oldContent: '<script>alert("xss")</script>',
        newContent: 'Safe & "clean" content',
      });

      // highlightDiff throws
      highlightDiffStub.throws(new Error('Rendering failure'));

      extensionModule.activate(mockContext);
      const handler = registeredCommands['markdownDiffVisualiser.showChanges'];

      await handler();

      const previewData = mockPanelManagerInstance.showPreview.firstCall.args[0];

      // HTML special characters should be escaped in the fallback
      expect(previewData.oldHtml).to.include('&lt;script&gt;');
      expect(previewData.oldHtml).to.include('&lt;/script&gt;');
      expect(previewData.oldHtml).to.include('&quot;xss&quot;');
      expect(previewData.newHtml).to.include('&amp;');
      expect(previewData.newHtml).to.include('&quot;clean&quot;');
    });
  });

  describe('Webview disposed unexpectedly', function () {
    it('should clean up resources when webview panel is disposed by user', function () {
      const mockPanel = createMockWebviewPanel();
      mockWindow.createWebviewPanel.reset();
      mockWindow.createWebviewPanel.returns(mockPanel);

      // Load webviewPanelManager with mocked vscode
      const vscodeMock = {
        window: mockWindow,
        ViewColumn,
        ColorThemeKind,
        Uri,
        '@noCallThru': true,
      };

      const { createPanelManager: createPanelManagerDirect } = proxyquire(
        '../webviewPanelManager',
        { vscode: vscodeMock }
      );

      const context = createMockExtensionContext();
      const manager = createPanelManagerDirect(context);

      // Open the panel
      manager.showPreview({
        oldHtml: '<p>old</p>',
        newHtml: '<p>new</p>',
        fileName: 'test.md',
        fileStatus: 'modified' as const,
        diffMode: 'unstaged' as const,
      });

      expect(manager.isOpen()).to.be.true;

      // Simulate unexpected disposal (user closes the panel)
      mockPanel._onDidDisposeListeners.forEach((fn: Function) => fn());

      // After disposal, isOpen should return false
      expect(manager.isOpen()).to.be.false;

      // Manager should allow re-opening after unexpected disposal
      const newMockPanel = createMockWebviewPanel();
      mockWindow.createWebviewPanel.returns(newMockPanel);

      manager.showPreview({
        oldHtml: '<p>reopened old</p>',
        newHtml: '<p>reopened new</p>',
        fileName: 'test.md',
        fileStatus: 'modified' as const,
        diffMode: 'unstaged' as const,
      });

      // A new panel should have been created
      expect(mockWindow.createWebviewPanel.calledTwice).to.be.true;
      expect(manager.isOpen()).to.be.true;
    });

    it('should register onDidDispose handler when panel is created', function () {
      const mockPanel = createMockWebviewPanel();
      mockWindow.createWebviewPanel.reset();
      mockWindow.createWebviewPanel.returns(mockPanel);

      const vscodeMock = {
        window: mockWindow,
        ViewColumn,
        ColorThemeKind,
        Uri,
        '@noCallThru': true,
      };

      const { createPanelManager: createPanelManagerDirect } = proxyquire(
        '../webviewPanelManager',
        { vscode: vscodeMock }
      );

      const context = createMockExtensionContext();
      const manager = createPanelManagerDirect(context);

      manager.showPreview({
        oldHtml: '<p>old</p>',
        newHtml: '<p>new</p>',
        fileName: 'test.md',
        fileStatus: 'modified' as const,
        diffMode: 'unstaged' as const,
      });

      // onDidDispose should have been called to register a cleanup handler
      expect(mockPanel.onDidDispose.called).to.be.true;

      // The dispose listeners array should have at least one entry
      expect(mockPanel._onDidDisposeListeners.length).to.be.greaterThan(0);
    });
  });
});
