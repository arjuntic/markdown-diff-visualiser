/**
 * Unit Tests for Extension Controller
 *
 * Tests the activate/deactivate lifecycle and the showChanges command handler.
 * Uses proxyquire to inject mocks for vscode and all internal modules
 * (gitService, diffParser, diffHighlighter, webviewPanelManager).
 *
 * The showChanges command now uses runVersionComparison (committed vs unstaged)
 * which calls findGitRoot and getFileAtVersion (using child_process.execFile
 * and vscode.workspace.fs.readFile), then diffLib.createTwoFilesPatch, parseDiff,
 * and highlightDiff.
 *
 * Requirements covered: 5.1, 5.2, 5.5, 5.6, 6.1, 6.5
 */

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

  // --- child_process mock ---
  let execFileStub: sinon.SinonStub;

  // --- diff library mock ---
  let createTwoFilesPatchStub: sinon.SinonStub;

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

    // child_process.execFile mock — used by findGitRoot and getFileAtVersion
    execFileStub = sinon.stub();

    // diff library mock
    createTwoFilesPatchStub = sinon.stub();

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
      workspaceFolders: [{ uri: { fsPath: '/mock/workspace' }, name: 'workspace', index: 0 }],
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
      vscode: vscodeMock,
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
      child_process: {
        execFile: execFileStub,
        '@noCallThru': true,
      },
      diff: {
        createTwoFilesPatch: createTwoFilesPatchStub,
        '@noCallThru': true,
      },
    });

    return vscodeMock;
  }

  /**
   * Configure mocks for a successful runVersionComparison flow.
   *
   * The showChanges command calls runVersionComparison('committed', 'unstaged') which:
   * 1. findGitRoot: execFile('git', ['rev-parse', '--show-toplevel'], ...)
   * 2. getFileAtVersion('committed'): execFile('git', ['show', 'HEAD:<path>'], ...)
   * 3. getFileAtVersion('unstaged'): vscode.workspace.fs.readFile(...)
   * 4. diffLib.createTwoFilesPatch(...)
   * 5. parseDiff(...)
   * 6. highlightDiff(...)
   * 7. panelManager.showPreview(...)
   */
  function setupSuccessfulVersionComparison(options?: {
    committedContent?: string;
    unstagedContent?: string;
    filePath?: string;
  }) {
    const committedContent = options?.committedContent ?? '# Old Content';
    const unstagedContent = options?.unstagedContent ?? '# Current Content\n\nSome text.';
    const filePath = options?.filePath ?? '/mock/workspace/README.md';

    // Mock execFile for findGitRoot and getFileAtVersion('committed')
    execFileStub.callsFake(
      (_cmd: string, args: string[], _opts: any, callback: Function) => {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
          // findGitRoot
          callback(null, '/mock/workspace\n', '');
        } else if (args[0] === 'show' && typeof args[1] === 'string' && args[1].startsWith('HEAD:')) {
          // getFileAtVersion('committed')
          callback(null, committedContent, '');
        } else {
          callback(null, '', '');
        }
      },
    );

    // Mock workspace.fs.readFile for getFileAtVersion('unstaged')
    workspaceMock.fs.readFile.resolves(Buffer.from(unstagedContent));

    // Mock diff library
    const rawPatch =
      `diff --git a/README.md b/README.md\n--- a/README.md\n+++ b/README.md\n@@ -1 +1,3 @@\n-# Old Content\n+# Current Content\n+\n+Some text.\n`;
    createTwoFilesPatchStub.returns(rawPatch);

    // Mock parseDiff
    const mockHunks = [
      {
        oldStart: 1,
        oldLines: 1,
        newStart: 1,
        newLines: 3,
        changes: [
          { type: 'del', content: '# Old Content', oldLineNumber: 1 },
          { type: 'add', content: '# Current Content', newLineNumber: 1 },
          { type: 'add', content: '', newLineNumber: 2 },
          { type: 'add', content: 'Some text.', newLineNumber: 3 },
        ],
      },
    ];
    parseDiffStub.returns([
      {
        oldFilePath: 'README.md',
        newFilePath: 'README.md',
        hunks: mockHunks,
        status: 'modified',
      },
    ]);

    // Mock highlightDiff
    highlightDiffStub.returns({
      oldHtml: '<p>old highlighted</p>',
      newHtml: '<p>new highlighted</p>',
    });
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
        'markdownDiffVisualiser.showChanges',
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
      expect(mockWindow.showInformationMessage.firstCall.args[0]).to.include('markdown');
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
      expect(mockWindow.showInformationMessage.firstCall.args[0]).to.include('No active editor');
    });
  });

  describe('showChanges command - markdown file with no changes', function () {
    it('should show info message when no changes are found (identical content)', async function () {
      const vscodeMock = loadExtensionModule();
      vscodeMock.window.activeTextEditor = {
        document: {
          uri: { fsPath: '/mock/workspace/README.md' },
          languageId: 'markdown',
        },
      };

      const sameContent = '# Same Content';

      // findGitRoot succeeds
      execFileStub.callsFake(
        (_cmd: string, args: string[], _opts: any, callback: Function) => {
          if (args[0] === 'rev-parse') {
            callback(null, '/mock/workspace\n', '');
          } else if (args[0] === 'show') {
            callback(null, sameContent, '');
          } else {
            callback(null, '', '');
          }
        },
      );

      // Unstaged content is the same as committed
      workspaceMock.fs.readFile.resolves(Buffer.from(sameContent));

      extensionModule.activate(mockContext);
      const handler = registeredCommands['markdownDiffVisualiser.showChanges'];

      await handler();

      expect(mockWindow.showInformationMessage.calledOnce).to.be.true;
      expect(mockWindow.showInformationMessage.firstCall.args[0]).to.include('No differences');
    });

    it('should show info message when diff parses to empty results', async function () {
      const vscodeMock = loadExtensionModule();
      vscodeMock.window.activeTextEditor = {
        document: {
          uri: { fsPath: '/mock/workspace/README.md' },
          languageId: 'markdown',
        },
      };

      // findGitRoot succeeds
      execFileStub.callsFake(
        (_cmd: string, args: string[], _opts: any, callback: Function) => {
          if (args[0] === 'rev-parse') {
            callback(null, '/mock/workspace\n', '');
          } else if (args[0] === 'show') {
            callback(null, '# Old Content', '');
          } else {
            callback(null, '', '');
          }
        },
      );

      // Different unstaged content
      workspaceMock.fs.readFile.resolves(Buffer.from('# New Content'));

      // diff library returns a patch
      createTwoFilesPatchStub.returns('some patch text');

      // parseDiff returns empty (malformed/unparseable)
      parseDiffStub.returns([]);

      extensionModule.activate(mockContext);
      const handler = registeredCommands['markdownDiffVisualiser.showChanges'];

      await handler();

      expect(mockWindow.showInformationMessage.calledOnce).to.be.true;
      expect(mockWindow.showInformationMessage.firstCall.args[0]).to.include('No differences');
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

      setupSuccessfulVersionComparison();

      extensionModule.activate(mockContext);
      const handler = registeredCommands['markdownDiffVisualiser.showChanges'];

      await handler();

      // Panel manager should have been created
      expect(createPanelManagerStub.called).to.be.true;

      // showPreview should have been called with the highlighted content
      expect(mockPanelManagerInstance.showPreview.calledOnce).to.be.true;
      const previewData = mockPanelManagerInstance.showPreview.firstCall.args[0];
      expect(previewData.oldHtml).to.equal('<p>old highlighted</p>');
      expect(previewData.newHtml).to.equal('<p>new highlighted</p>');
      expect(previewData.fileName).to.equal('README.md');
      expect(previewData.fileStatus).to.equal('modified');
      expect(previewData.diffMode).to.equal('unstaged');
    });

    it('should default to committed vs unstaged comparison', async function () {
      const vscodeMock = loadExtensionModule();
      vscodeMock.window.activeTextEditor = {
        document: {
          uri: { fsPath: '/mock/workspace/README.md' },
          languageId: 'markdown',
        },
      };

      setupSuccessfulVersionComparison();

      extensionModule.activate(mockContext);
      const handler = registeredCommands['markdownDiffVisualiser.showChanges'];

      await handler();

      // execFile should have been called for findGitRoot (rev-parse)
      const revParseCall = execFileStub.getCalls().find(
        (c: any) => c.args[1][0] === 'rev-parse',
      );
      expect(revParseCall).to.exist;

      // execFile should have been called for getFileAtVersion('committed') with HEAD:
      const showCall = execFileStub.getCalls().find(
        (c: any) => c.args[1][0] === 'show' && c.args[1][1].startsWith('HEAD:'),
      );
      expect(showCall).to.exist;

      // workspace.fs.readFile should have been called for getFileAtVersion('unstaged')
      expect(workspaceMock.fs.readFile.called).to.be.true;

      // parseDiff should have been called
      expect(parseDiffStub.calledOnce).to.be.true;

      // highlightDiff should have been called
      expect(highlightDiffStub.calledOnce).to.be.true;
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

      setupSuccessfulVersionComparison();

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

      setupSuccessfulVersionComparison();

      // Also set up mocks for the refresh path (runPipeline uses gitService.getDiff)
      mockGitServiceInstance.getDiff.resolves(
        'diff --git a/README.md b/README.md\n--- a/README.md\n+++ b/README.md\n@@ -1 +1 @@\n-old\n+new\n',
      );
      reconstructContentStub.returns({ oldContent: 'old', newContent: 'new' });

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

      // Simulate file change — this triggers runPipeline (not runVersionComparison)
      changeHandler();

      // Wait for the async pipeline to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      // runPipeline uses gitService.getDiff
      expect(mockGitServiceInstance.getDiff.calledOnce).to.be.true;
    });
  });

  describe('webview message handling', function () {
    it('should handle refresh message from webview', async function () {
      const vscodeMock = loadExtensionModule();
      vscodeMock.window.activeTextEditor = {
        document: {
          uri: { fsPath: '/mock/workspace/README.md' },
          languageId: 'markdown',
        },
      };

      setupSuccessfulVersionComparison();

      // Also set up mocks for the refresh path (runPipeline uses gitService.getDiff)
      mockGitServiceInstance.getDiff.resolves(
        'diff --git a/README.md b/README.md\n--- a/README.md\n+++ b/README.md\n@@ -1 +1 @@\n-old\n+new\n',
      );
      reconstructContentStub.returns({ oldContent: 'old', newContent: 'new' });

      extensionModule.activate(mockContext);
      const handler = registeredCommands['markdownDiffVisualiser.showChanges'];

      await handler();

      // createPanelManager was called with context and a message handler
      expect(createPanelManagerStub.called).to.be.true;
      const messageHandler = createPanelManagerStub.firstCall.args[1];
      expect(messageHandler).to.be.a('function');

      // Reset stubs
      mockGitServiceInstance.getDiff.resetHistory();
      mockPanelManagerInstance.showPreview.resetHistory();

      // Simulate refresh message — this triggers runPipeline
      messageHandler({ type: 'refresh' });

      // Wait for the async pipeline
      await new Promise((resolve) => setTimeout(resolve, 50));

      // runPipeline uses gitService.getDiff
      expect(mockGitServiceInstance.getDiff.calledOnce).to.be.true;
    });

    it('should handle compareVersions message from webview', async function () {
      const vscodeMock = loadExtensionModule();
      vscodeMock.window.activeTextEditor = {
        document: {
          uri: { fsPath: '/mock/workspace/README.md' },
          languageId: 'markdown',
        },
      };

      setupSuccessfulVersionComparison();

      extensionModule.activate(mockContext);
      const handler = registeredCommands['markdownDiffVisualiser.showChanges'];

      await handler();

      const messageHandler = createPanelManagerStub.firstCall.args[1];

      // Reset stubs to track the compareVersions call
      execFileStub.resetHistory();
      parseDiffStub.resetHistory();
      highlightDiffStub.resetHistory();
      mockPanelManagerInstance.showPreview.resetHistory();

      // Re-setup execFile for the second runVersionComparison call
      setupSuccessfulVersionComparison();

      // Simulate compareVersions message
      messageHandler({
        type: 'compareVersions',
        payload: { leftVersion: 'committed', rightVersion: 'unstaged' },
      });

      // Wait for the async pipeline
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should have called parseDiff again
      expect(parseDiffStub.called).to.be.true;
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

      setupSuccessfulVersionComparison();

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

      setupSuccessfulVersionComparison({
        filePath: '/mock/workspace/docs/guide.markdown',
      });

      extensionModule.activate(mockContext);
      const handler = registeredCommands['markdownDiffVisualiser.showChanges'];

      await handler();

      // Should NOT show the "not markdown" info message
      const infoMessages = mockWindow.showInformationMessage.getCalls().map((c: any) => c.args[0]);
      const hasMarkdownWarning = infoMessages.some((msg: string) => msg.includes('markdown files'));
      expect(hasMarkdownWarning).to.be.false;

      // Should have proceeded to show preview
      expect(mockPanelManagerInstance.showPreview.calledOnce).to.be.true;
    });
  });
});
