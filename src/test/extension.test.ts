/**
 * Unit Tests for Extension Controller
 *
 * Tests the activate/deactivate lifecycle and the showChanges command handler.
 * Uses proxyquire to inject mocks for vscode and all internal modules
 * (gitService, diffParser, diffHighlighter, webviewPanelManager).
 *
 * Requirements covered: 5.1, 5.2, 5.5, 5.6, 6.1, 6.5
 */

/* eslint-disable @typescript-eslint/no-require-imports */
import { expect } from 'chai';
import * as sinon from 'sinon';
import {
  createMockExtensionContext,
  window as mockWindow,
  ViewColumn,
  ColorThemeKind,
  Uri,
} from './mocks/vscode';

const proxyquire = require('proxyquire').noCallThru();

describe('Extension Controller', function () {
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
  let fileWatcherOnDidChange: sinon.SinonStub;
  let fileWatcherOnDidCreate: sinon.SinonStub;
  let fileWatcherDispose: sinon.SinonStub;
  let mockOutputChannel: any;

  // --- Workspace mocks ---
  let workspaceMock: any;
  let commandsMock: any;

  // The module under test, loaded fresh per test
  let extensionModule: any;

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

    // File watcher mock
    fileWatcherOnDidChange = sinon.stub().returns({ dispose: sinon.stub() });
    fileWatcherOnDidCreate = sinon.stub().returns({ dispose: sinon.stub() });
    fileWatcherDispose = sinon.stub();

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
        onDidChange: fileWatcherOnDidChange,
        onDidCreate: fileWatcherOnDidCreate,
        onDidDelete: sinon.stub().returns({ dispose: sinon.stub() }),
        dispose: fileWatcherDispose,
      }),
    };

    // Reset window stubs
    mockWindow.createWebviewPanel.reset();
    mockWindow.showErrorMessage.reset();
    mockWindow.showInformationMessage.reset();
    mockWindow.showWarningMessage.reset();
    mockWindow.onDidChangeActiveColorTheme.resetHistory();

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

    // Load the extension module with all mocks injected
    extensionModule = proxyquire('../extension', {
      'vscode': vscodeMock,
      './gitService': {
        createGitService: createGitServiceStub,
        GitError: class GitError extends Error {
          code: string;
          constructor(message: string, code: string) {
            super(message);
            this.name = 'GitError';
            this.code = code;
          }
        },
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

  describe('activate', function () {
    it('should register the showChanges command', function () {
      loadExtensionModule();
      extensionModule.activate(mockContext);

      expect(commandsMock.registerCommand.calledOnce).to.be.true;
      expect(commandsMock.registerCommand.firstCall.args[0]).to.equal(
        'markdownDiffVisualiser.showChanges'
      );
    });

    it('should push disposables to context.subscriptions', function () {
      loadExtensionModule();
      const initialLength = mockContext.subscriptions.length;
      extensionModule.activate(mockContext);

      // Should have pushed at least the output channel and the command disposable
      expect(mockContext.subscriptions.length).to.be.greaterThan(initialLength);
    });
  });

  describe('showChanges command - non-markdown file', function () {
    it('should show info message when invoked on a non-markdown file', async function () {
      const vscodeMock = loadExtensionModule();
      vscodeMock.window.activeTextEditor = {
        document: {
          uri: { fsPath: '/mock/workspace/src/index.ts' },
          languageId: 'typescript',
        },
      };

      extensionModule.activate(mockContext);
      const handler = registeredCommands['markdownDiffVisualiser.showChanges'];
      expect(handler).to.be.a('function');

      await handler();

      expect(mockWindow.showInformationMessage.calledOnce).to.be.true;
      expect(mockWindow.showInformationMessage.firstCall.args[0]).to.include(
        'markdown'
      );
    });
  });

  describe('showChanges command - no active editor', function () {
    it('should show info message when no editor is active', async function () {
      const vscodeMock = loadExtensionModule();
      vscodeMock.window.activeTextEditor = undefined;

      extensionModule.activate(mockContext);
      const handler = registeredCommands['markdownDiffVisualiser.showChanges'];

      await handler();

      expect(mockWindow.showInformationMessage.calledOnce).to.be.true;
      expect(mockWindow.showInformationMessage.firstCall.args[0]).to.include(
        'No active editor'
      );
    });
  });

  describe('showChanges command - markdown file with no changes', function () {
    it('should show info message when no changes are found (empty diff)', async function () {
      const vscodeMock = loadExtensionModule();
      vscodeMock.window.activeTextEditor = {
        document: {
          uri: { fsPath: '/mock/workspace/README.md' },
          languageId: 'markdown',
        },
      };

      // Git returns empty diff
      mockGitServiceInstance.getDiff.resolves('');

      extensionModule.activate(mockContext);
      const handler = registeredCommands['markdownDiffVisualiser.showChanges'];

      await handler();

      expect(mockWindow.showInformationMessage.calledOnce).to.be.true;
      expect(mockWindow.showInformationMessage.firstCall.args[0]).to.include(
        'No changes found'
      );
    });

    it('should show info message when diff parses to empty results', async function () {
      const vscodeMock = loadExtensionModule();
      vscodeMock.window.activeTextEditor = {
        document: {
          uri: { fsPath: '/mock/workspace/README.md' },
          languageId: 'markdown',
        },
      };

      // Git returns some diff text but parser returns empty
      mockGitServiceInstance.getDiff.resolves('some diff text');
      parseDiffStub.returns([]);

      extensionModule.activate(mockContext);
      const handler = registeredCommands['markdownDiffVisualiser.showChanges'];

      await handler();

      expect(mockWindow.showInformationMessage.calledOnce).to.be.true;
      expect(mockWindow.showInformationMessage.firstCall.args[0]).to.include(
        'No changes found'
      );
    });
  });

  describe('showChanges command - markdown file with changes', function () {
    it('should open panel with correct content when changes exist', async function () {
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
      highlightDiffStub.returns({
        oldHtml: '<p>old highlighted</p>',
        newHtml: '<p>new highlighted</p>',
      });

      extensionModule.activate(mockContext);
      const handler = registeredCommands['markdownDiffVisualiser.showChanges'];

      await handler();

      // Panel manager should have been created
      expect(createPanelManagerStub.calledOnce).to.be.true;

      // showPreview should have been called with the highlighted content
      expect(mockPanelManagerInstance.showPreview.calledOnce).to.be.true;
      const previewData = mockPanelManagerInstance.showPreview.firstCall.args[0];
      expect(previewData.oldHtml).to.equal('<p>old highlighted</p>');
      expect(previewData.newHtml).to.equal('<p>new highlighted</p>');
      expect(previewData.fileName).to.equal('README.md');
      expect(previewData.fileStatus).to.equal('modified');
      expect(previewData.diffMode).to.equal('unstaged');
    });

    it('should default to unstaged diff mode', async function () {
      const vscodeMock = loadExtensionModule();
      vscodeMock.window.activeTextEditor = {
        document: {
          uri: { fsPath: '/mock/workspace/README.md' },
          languageId: 'markdown',
        },
      };

      mockGitServiceInstance.getDiff.resolves('diff text');
      parseDiffStub.returns([{
        oldFilePath: 'README.md',
        newFilePath: 'README.md',
        hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, changes: [] }],
        status: 'modified',
      }]);
      reconstructContentStub.returns({ oldContent: 'old', newContent: 'new' });
      highlightDiffStub.returns({ oldHtml: '<p>old</p>', newHtml: '<p>new</p>' });

      extensionModule.activate(mockContext);
      const handler = registeredCommands['markdownDiffVisualiser.showChanges'];

      await handler();

      // createGitService should have been called with workspace root
      expect(createGitServiceStub.calledOnce).to.be.true;
      expect(createGitServiceStub.firstCall.args[0]).to.equal('/mock/workspace');

      // getDiff should have been called with unstaged mode
      expect(mockGitServiceInstance.getDiff.calledOnce).to.be.true;
      expect(mockGitServiceInstance.getDiff.firstCall.args[1]).to.equal('unstaged');
    });
  });

  describe('auto-refresh on file changes', function () {
    it('should set up a file watcher after showing preview', async function () {
      const vscodeMock = loadExtensionModule();
      vscodeMock.window.activeTextEditor = {
        document: {
          uri: { fsPath: '/mock/workspace/README.md' },
          languageId: 'markdown',
        },
      };

      mockGitServiceInstance.getDiff.resolves('diff text');
      parseDiffStub.returns([{
        oldFilePath: 'README.md',
        newFilePath: 'README.md',
        hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, changes: [] }],
        status: 'modified',
      }]);
      reconstructContentStub.returns({ oldContent: 'old', newContent: 'new' });
      highlightDiffStub.returns({ oldHtml: '<p>old</p>', newHtml: '<p>new</p>' });

      extensionModule.activate(mockContext);
      const handler = registeredCommands['markdownDiffVisualiser.showChanges'];

      await handler();

      // createFileSystemWatcher should have been called
      expect(workspaceMock.createFileSystemWatcher.calledOnce).to.be.true;

      // onDidChange should have been registered
      expect(fileWatcherOnDidChange.calledOnce).to.be.true;
    });

    it('should re-run pipeline when file changes and panel is open', async function () {
      const vscodeMock = loadExtensionModule();
      vscodeMock.window.activeTextEditor = {
        document: {
          uri: { fsPath: '/mock/workspace/README.md' },
          languageId: 'markdown',
        },
      };

      mockGitServiceInstance.getDiff.resolves('diff text');
      parseDiffStub.returns([{
        oldFilePath: 'README.md',
        newFilePath: 'README.md',
        hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, changes: [] }],
        status: 'modified',
      }]);
      reconstructContentStub.returns({ oldContent: 'old', newContent: 'new' });
      highlightDiffStub.returns({ oldHtml: '<p>old</p>', newHtml: '<p>new</p>' });

      extensionModule.activate(mockContext);
      const handler = registeredCommands['markdownDiffVisualiser.showChanges'];

      await handler();

      // Get the file change handler that was registered
      const changeHandler = fileWatcherOnDidChange.firstCall.args[0];
      expect(changeHandler).to.be.a('function');

      // Reset stubs to track the refresh call
      mockGitServiceInstance.getDiff.resetHistory();
      parseDiffStub.resetHistory();
      highlightDiffStub.resetHistory();
      mockPanelManagerInstance.showPreview.resetHistory();

      // Simulate file change
      changeHandler();

      // Wait for the async pipeline to complete
      await new Promise(resolve => setTimeout(resolve, 50));

      // getDiff should have been called again (refresh)
      expect(mockGitServiceInstance.getDiff.calledOnce).to.be.true;
    });
  });

  describe('diff mode switching via webview messages', function () {
    it('should handle switchMode message and re-run pipeline with new mode', async function () {
      const vscodeMock = loadExtensionModule();
      vscodeMock.window.activeTextEditor = {
        document: {
          uri: { fsPath: '/mock/workspace/README.md' },
          languageId: 'markdown',
        },
      };

      mockGitServiceInstance.getDiff.resolves('diff text');
      parseDiffStub.returns([{
        oldFilePath: 'README.md',
        newFilePath: 'README.md',
        hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, changes: [] }],
        status: 'modified',
      }]);
      reconstructContentStub.returns({ oldContent: 'old', newContent: 'new' });
      highlightDiffStub.returns({ oldHtml: '<p>old</p>', newHtml: '<p>new</p>' });

      extensionModule.activate(mockContext);
      const handler = registeredCommands['markdownDiffVisualiser.showChanges'];

      await handler();

      // createPanelManager was called with context and a message handler
      expect(createPanelManagerStub.calledOnce).to.be.true;
      const messageHandler = createPanelManagerStub.firstCall.args[1];
      expect(messageHandler).to.be.a('function');

      // Reset stubs to track the mode switch call
      mockGitServiceInstance.getDiff.resetHistory();
      createGitServiceStub.resetHistory();
      parseDiffStub.resetHistory();
      highlightDiffStub.resetHistory();
      mockPanelManagerInstance.showPreview.resetHistory();

      // Simulate switchMode message from webview
      messageHandler({ type: 'switchMode', payload: { mode: 'staged' } });

      // Wait for the async pipeline to complete
      await new Promise(resolve => setTimeout(resolve, 50));

      // getDiff should have been called with 'staged' mode
      expect(mockGitServiceInstance.getDiff.calledOnce).to.be.true;
      expect(mockGitServiceInstance.getDiff.firstCall.args[1]).to.equal('staged');
    });

    it('should handle switchMode to commit mode with commitSha', async function () {
      const vscodeMock = loadExtensionModule();
      vscodeMock.window.activeTextEditor = {
        document: {
          uri: { fsPath: '/mock/workspace/README.md' },
          languageId: 'markdown',
        },
      };

      mockGitServiceInstance.getDiff.resolves('diff text');
      parseDiffStub.returns([{
        oldFilePath: 'README.md',
        newFilePath: 'README.md',
        hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, changes: [] }],
        status: 'modified',
      }]);
      reconstructContentStub.returns({ oldContent: 'old', newContent: 'new' });
      highlightDiffStub.returns({ oldHtml: '<p>old</p>', newHtml: '<p>new</p>' });

      extensionModule.activate(mockContext);
      const handler = registeredCommands['markdownDiffVisualiser.showChanges'];

      await handler();

      const messageHandler = createPanelManagerStub.firstCall.args[1];

      // Reset stubs
      mockGitServiceInstance.getDiff.resetHistory();
      createGitServiceStub.resetHistory();

      // Simulate switchMode to commit mode
      messageHandler({
        type: 'switchMode',
        payload: { mode: 'commit', commitSha: 'abc123' },
      });

      // Wait for the async pipeline
      await new Promise(resolve => setTimeout(resolve, 50));

      // createGitService should have been called with the commitSha
      expect(createGitServiceStub.calledOnce).to.be.true;
      expect(createGitServiceStub.firstCall.args[1]).to.equal('abc123');
    });

    it('should handle refresh message from webview', async function () {
      const vscodeMock = loadExtensionModule();
      vscodeMock.window.activeTextEditor = {
        document: {
          uri: { fsPath: '/mock/workspace/README.md' },
          languageId: 'markdown',
        },
      };

      mockGitServiceInstance.getDiff.resolves('diff text');
      parseDiffStub.returns([{
        oldFilePath: 'README.md',
        newFilePath: 'README.md',
        hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, changes: [] }],
        status: 'modified',
      }]);
      reconstructContentStub.returns({ oldContent: 'old', newContent: 'new' });
      highlightDiffStub.returns({ oldHtml: '<p>old</p>', newHtml: '<p>new</p>' });

      extensionModule.activate(mockContext);
      const handler = registeredCommands['markdownDiffVisualiser.showChanges'];

      await handler();

      const messageHandler = createPanelManagerStub.firstCall.args[1];

      // Reset stubs
      mockGitServiceInstance.getDiff.resetHistory();
      mockPanelManagerInstance.showPreview.resetHistory();

      // Simulate refresh message
      messageHandler({ type: 'refresh' });

      // Wait for the async pipeline
      await new Promise(resolve => setTimeout(resolve, 50));

      // getDiff should have been called again
      expect(mockGitServiceInstance.getDiff.calledOnce).to.be.true;
    });
  });

  describe('deactivate', function () {
    it('should clean up resources on deactivation', async function () {
      const vscodeMock = loadExtensionModule();
      vscodeMock.window.activeTextEditor = {
        document: {
          uri: { fsPath: '/mock/workspace/README.md' },
          languageId: 'markdown',
        },
      };

      mockGitServiceInstance.getDiff.resolves('diff text');
      parseDiffStub.returns([{
        oldFilePath: 'README.md',
        newFilePath: 'README.md',
        hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, changes: [] }],
        status: 'modified',
      }]);
      reconstructContentStub.returns({ oldContent: 'old', newContent: 'new' });
      highlightDiffStub.returns({ oldHtml: '<p>old</p>', newHtml: '<p>new</p>' });

      extensionModule.activate(mockContext);
      const handler = registeredCommands['markdownDiffVisualiser.showChanges'];
      await handler();

      // Deactivate should not throw
      extensionModule.deactivate();

      // File watcher should have been disposed
      expect(fileWatcherDispose.calledOnce).to.be.true;

      // Panel manager should have been disposed
      expect(mockPanelManagerInstance.dispose.calledOnce).to.be.true;
    });
  });

  describe('.markdown extension support', function () {
    it('should accept files with .markdown extension', async function () {
      const vscodeMock = loadExtensionModule();
      vscodeMock.window.activeTextEditor = {
        document: {
          uri: { fsPath: '/mock/workspace/docs/guide.markdown' },
          languageId: 'markdown',
        },
      };

      mockGitServiceInstance.getDiff.resolves('diff text');
      parseDiffStub.returns([{
        oldFilePath: 'docs/guide.markdown',
        newFilePath: 'docs/guide.markdown',
        hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, changes: [] }],
        status: 'modified',
      }]);
      reconstructContentStub.returns({ oldContent: 'old', newContent: 'new' });
      highlightDiffStub.returns({ oldHtml: '<p>old</p>', newHtml: '<p>new</p>' });

      extensionModule.activate(mockContext);
      const handler = registeredCommands['markdownDiffVisualiser.showChanges'];

      await handler();

      // Should NOT show the "not markdown" info message
      const infoMessages = mockWindow.showInformationMessage.getCalls()
        .map((c: any) => c.args[0]);
      const hasMarkdownWarning = infoMessages.some(
        (msg: string) => msg.includes('markdown files')
      );
      expect(hasMarkdownWarning).to.be.false;

      // Should have proceeded to get diff
      expect(mockGitServiceInstance.getDiff.calledOnce).to.be.true;
    });
  });
});
