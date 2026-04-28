/**
 * Unit Tests for Webview Panel Manager
 *
 * Tests the createPanelManager factory and all PanelManager methods.
 * Uses proxyquire to inject a mock vscode module, and sinon for stubs.
 *
 * Requirements covered: 3.1, 7.1, 7.2, 9.2
 */

import { expect } from 'chai';
import * as sinon from 'sinon';
import {
  createMockWebviewPanel,
  createMockExtensionContext,
  window as mockWindow,
  ViewColumn,
  ColorThemeKind,
  Uri,
  _getThemeChangeListeners,
  _resetThemeChangeListeners,
} from './mocks/vscode';

// Use proxyquire to replace the 'vscode' module with our mock
const proxyquire = require('proxyquire').noCallThru();

// Build the vscode mock object that proxyquire will inject
function buildVscodeMock() {
  return {
    window: mockWindow,
    ViewColumn,
    ColorThemeKind,
    Uri,
    '@noCallThru': true,
  };
}

// Load the module under test with the vscode mock injected
const { createPanelManager } = proxyquire('../webviewPanelManager', {
  vscode: buildVscodeMock(),
});

describe('Webview Panel Manager', function () {
  let mockPanel: any;
  let mockContext: any;

  beforeEach(function () {
    mockPanel = createMockWebviewPanel();
    mockContext = createMockExtensionContext();

    // Reset all sinon stubs on the window mock
    mockWindow.createWebviewPanel.reset();
    mockWindow.createWebviewPanel.returns(mockPanel);
    mockWindow.onDidChangeActiveColorTheme.resetHistory();

    _resetThemeChangeListeners();
  });

  afterEach(function () {
    sinon.restore();
  });

  describe('showPreview', function () {
    it('should create a webview panel and send update message with correct data', function () {
      const manager = createPanelManager(mockContext);

      const previewData = {
        oldHtml: '<p>old content</p>',
        newHtml: '<p>new content</p>',
        fileName: 'README.md',
        fileStatus: 'modified' as const,
        diffMode: 'unstaged' as const,
      };

      manager.showPreview(previewData);

      // Panel should have been created
      expect(mockWindow.createWebviewPanel.calledOnce).to.be.true;

      // Title should be set
      expect(mockPanel.title).to.equal('Diff: README.md');

      // postMessage should have been called with the update payload
      expect(mockPanel.webview.postMessage.calledOnce).to.be.true;
      const message = mockPanel.webview.postMessage.firstCall.args[0];
      expect(message.type).to.equal('update');
      expect(message.payload).to.deep.equal({
        oldHtml: '<p>old content</p>',
        newHtml: '<p>new content</p>',
        fileName: 'README.md',
        fileStatus: 'modified',
        diffMode: 'unstaged',
        commitRef: undefined,
      });
    });

    it('should include commitRef in the message payload when provided', function () {
      const manager = createPanelManager(mockContext);

      const previewData = {
        oldHtml: '<p>old</p>',
        newHtml: '<p>new</p>',
        fileName: 'CHANGELOG.md',
        fileStatus: 'modified' as const,
        diffMode: 'commit' as const,
        commitRef: 'abc123',
      };

      manager.showPreview(previewData);

      const message = mockPanel.webview.postMessage.firstCall.args[0];
      expect(message.payload.commitRef).to.equal('abc123');
      expect(message.payload.diffMode).to.equal('commit');
    });

    it('should reuse existing panel and call reveal on subsequent calls', function () {
      const manager = createPanelManager(mockContext);

      const data1 = {
        oldHtml: '<p>v1</p>',
        newHtml: '<p>v2</p>',
        fileName: 'file1.md',
        fileStatus: 'modified' as const,
        diffMode: 'unstaged' as const,
      };

      const data2 = {
        oldHtml: '<p>v3</p>',
        newHtml: '<p>v4</p>',
        fileName: 'file2.md',
        fileStatus: 'added' as const,
        diffMode: 'staged' as const,
      };

      manager.showPreview(data1);
      manager.showPreview(data2);

      // createWebviewPanel should only be called once
      expect(mockWindow.createWebviewPanel.calledOnce).to.be.true;

      // reveal should be called on the second invocation
      expect(mockPanel.reveal.calledOnce).to.be.true;
      expect(mockPanel.reveal.firstCall.args[0]).to.equal(ViewColumn.One);

      // postMessage should be called twice (once per showPreview)
      expect(mockPanel.webview.postMessage.calledTwice).to.be.true;

      // Second message should have the updated data
      const secondMessage = mockPanel.webview.postMessage.secondCall.args[0];
      expect(secondMessage.payload.fileName).to.equal('file2.md');
    });

    it('should handle all file statuses correctly', function () {
      const statuses: Array<'modified' | 'added' | 'deleted' | 'renamed'> = [
        'modified',
        'added',
        'deleted',
        'renamed',
      ];

      for (const status of statuses) {
        // Reset for each iteration
        mockPanel = createMockWebviewPanel();
        mockWindow.createWebviewPanel.reset();
        mockWindow.createWebviewPanel.returns(mockPanel);
        _resetThemeChangeListeners();

        const manager = createPanelManager(mockContext);
        manager.showPreview({
          oldHtml: '<p>old</p>',
          newHtml: '<p>new</p>',
          fileName: 'test.md',
          fileStatus: status,
          diffMode: 'unstaged' as const,
        });

        const message = mockPanel.webview.postMessage.firstCall.args[0];
        expect(message.payload.fileStatus).to.equal(status);
      }
    });
  });

  describe('dispose', function () {
    it('should dispose the panel and clean up resources', function () {
      const manager = createPanelManager(mockContext);

      // Open the panel first
      manager.showPreview({
        oldHtml: '<p>old</p>',
        newHtml: '<p>new</p>',
        fileName: 'test.md',
        fileStatus: 'modified' as const,
        diffMode: 'unstaged' as const,
      });

      // Dispose the manager
      manager.dispose();

      // Panel's dispose should have been called
      expect(mockPanel.dispose.called).to.be.true;

      // After dispose, isOpen should return false
      expect(manager.isOpen()).to.be.false;
    });

    it('should be safe to call dispose multiple times', function () {
      const manager = createPanelManager(mockContext);

      manager.showPreview({
        oldHtml: '<p>old</p>',
        newHtml: '<p>new</p>',
        fileName: 'test.md',
        fileStatus: 'modified' as const,
        diffMode: 'unstaged' as const,
      });

      // Dispose twice should not throw
      manager.dispose();
      manager.dispose();

      expect(manager.isOpen()).to.be.false;
    });

    it('should be safe to call dispose when no panel was created', function () {
      const manager = createPanelManager(mockContext);

      // Dispose without ever opening a panel should not throw
      manager.dispose();

      expect(manager.isOpen()).to.be.false;
    });

    it('should register dispose with extension context subscriptions', function () {
      const initialLength = mockContext.subscriptions.length;
      createPanelManager(mockContext);

      // The manager should have pushed a disposable to context.subscriptions
      expect(mockContext.subscriptions.length).to.be.greaterThan(initialLength);
    });

    it('should clean up when user closes the panel (onDidDispose)', function () {
      const manager = createPanelManager(mockContext);

      manager.showPreview({
        oldHtml: '<p>old</p>',
        newHtml: '<p>new</p>',
        fileName: 'test.md',
        fileStatus: 'modified' as const,
        diffMode: 'unstaged' as const,
      });

      expect(manager.isOpen()).to.be.true;

      // Simulate user closing the panel by triggering onDidDispose listeners
      mockPanel._onDidDisposeListeners.forEach((fn: Function) => fn());

      // After user closes, isOpen should return false
      expect(manager.isOpen()).to.be.false;
    });

    it('should allow re-opening panel after user closes it', function () {
      const manager = createPanelManager(mockContext);

      manager.showPreview({
        oldHtml: '<p>old</p>',
        newHtml: '<p>new</p>',
        fileName: 'test.md',
        fileStatus: 'modified' as const,
        diffMode: 'unstaged' as const,
      });

      // Simulate user closing the panel
      mockPanel._onDidDisposeListeners.forEach((fn: Function) => fn());
      expect(manager.isOpen()).to.be.false;

      // Create a fresh mock panel for the re-open
      const newMockPanel = createMockWebviewPanel();
      mockWindow.createWebviewPanel.returns(newMockPanel);

      // Re-open should create a new panel
      manager.showPreview({
        oldHtml: '<p>updated</p>',
        newHtml: '<p>updated new</p>',
        fileName: 'test.md',
        fileStatus: 'modified' as const,
        diffMode: 'unstaged' as const,
      });

      expect(mockWindow.createWebviewPanel.calledTwice).to.be.true;
    });
  });

  describe('isOpen', function () {
    it('should return false before any panel is created', function () {
      const manager = createPanelManager(mockContext);
      expect(manager.isOpen()).to.be.false;
    });

    it('should return true after showPreview is called', function () {
      const manager = createPanelManager(mockContext);

      manager.showPreview({
        oldHtml: '<p>old</p>',
        newHtml: '<p>new</p>',
        fileName: 'test.md',
        fileStatus: 'modified' as const,
        diffMode: 'unstaged' as const,
      });

      expect(manager.isOpen()).to.be.true;
    });

    it('should return false after dispose is called', function () {
      const manager = createPanelManager(mockContext);

      manager.showPreview({
        oldHtml: '<p>old</p>',
        newHtml: '<p>new</p>',
        fileName: 'test.md',
        fileStatus: 'modified' as const,
        diffMode: 'unstaged' as const,
      });

      manager.dispose();
      expect(manager.isOpen()).to.be.false;
    });

    it('should return false when panel is not visible', function () {
      mockPanel.visible = false;
      const manager = createPanelManager(mockContext);

      manager.showPreview({
        oldHtml: '<p>old</p>',
        newHtml: '<p>new</p>',
        fileName: 'test.md',
        fileStatus: 'modified' as const,
        diffMode: 'unstaged' as const,
      });

      expect(manager.isOpen()).to.be.false;
    });
  });

  describe('theme change handling', function () {
    it('should send themeChanged message with "light" for Light theme', function () {
      const manager = createPanelManager(mockContext);

      manager.showPreview({
        oldHtml: '<p>old</p>',
        newHtml: '<p>new</p>',
        fileName: 'test.md',
        fileStatus: 'modified' as const,
        diffMode: 'unstaged' as const,
      });

      // Reset postMessage call count (showPreview already called it once)
      mockPanel.webview.postMessage.resetHistory();

      // Simulate a theme change to Light
      const listeners = _getThemeChangeListeners();
      expect(listeners.length).to.be.greaterThan(0);

      listeners.forEach((fn) => fn({ kind: ColorThemeKind.Light }));

      expect(mockPanel.webview.postMessage.calledOnce).to.be.true;
      const message = mockPanel.webview.postMessage.firstCall.args[0];
      expect(message.type).to.equal('themeChanged');
      expect(message.payload.kind).to.equal('light');
    });

    it('should send themeChanged message with "dark" for Dark theme', function () {
      const manager = createPanelManager(mockContext);

      manager.showPreview({
        oldHtml: '<p>old</p>',
        newHtml: '<p>new</p>',
        fileName: 'test.md',
        fileStatus: 'modified' as const,
        diffMode: 'unstaged' as const,
      });

      mockPanel.webview.postMessage.resetHistory();

      const listeners = _getThemeChangeListeners();
      listeners.forEach((fn) => fn({ kind: ColorThemeKind.Dark }));

      const message = mockPanel.webview.postMessage.firstCall.args[0];
      expect(message.type).to.equal('themeChanged');
      expect(message.payload.kind).to.equal('dark');
    });

    it('should send themeChanged message with "highContrast" for HighContrast theme', function () {
      const manager = createPanelManager(mockContext);

      manager.showPreview({
        oldHtml: '<p>old</p>',
        newHtml: '<p>new</p>',
        fileName: 'test.md',
        fileStatus: 'modified' as const,
        diffMode: 'unstaged' as const,
      });

      mockPanel.webview.postMessage.resetHistory();

      const listeners = _getThemeChangeListeners();
      listeners.forEach((fn) => fn({ kind: ColorThemeKind.HighContrast }));

      const message = mockPanel.webview.postMessage.firstCall.args[0];
      expect(message.type).to.equal('themeChanged');
      expect(message.payload.kind).to.equal('highContrast');
    });

    it('should send themeChanged message with "highContrast" for HighContrastLight theme', function () {
      const manager = createPanelManager(mockContext);

      manager.showPreview({
        oldHtml: '<p>old</p>',
        newHtml: '<p>new</p>',
        fileName: 'test.md',
        fileStatus: 'modified' as const,
        diffMode: 'unstaged' as const,
      });

      mockPanel.webview.postMessage.resetHistory();

      const listeners = _getThemeChangeListeners();
      listeners.forEach((fn) => fn({ kind: ColorThemeKind.HighContrastLight }));

      const message = mockPanel.webview.postMessage.firstCall.args[0];
      expect(message.type).to.equal('themeChanged');
      expect(message.payload.kind).to.equal('highContrast');
    });

    it('should not send themeChanged when panel is not open', function () {
      const _manager = createPanelManager(mockContext);

      // Don't open a panel — just trigger theme change
      const listeners = _getThemeChangeListeners();

      // postMessage should not be called since there's no panel
      // (the listener checks if panel exists before posting)
      listeners.forEach((fn) => fn({ kind: ColorThemeKind.Dark }));

      // No panel was created, so postMessage was never called
      expect(mockPanel.webview.postMessage.called).to.be.false;
    });
  });

  describe('webview message callback', function () {
    it('should forward messages from webview to the onMessage callback', function () {
      const onMessage = sinon.stub();
      const manager = createPanelManager(mockContext, onMessage);

      manager.showPreview({
        oldHtml: '<p>old</p>',
        newHtml: '<p>new</p>',
        fileName: 'test.md',
        fileStatus: 'modified' as const,
        diffMode: 'unstaged' as const,
      });

      // The onDidReceiveMessage stub was called with a listener
      expect(mockPanel.webview.onDidReceiveMessage.called).to.be.true;

      // Get the listener that was registered and invoke it
      const messageListener = mockPanel.webview.onDidReceiveMessage.firstCall.args[0];
      const testMessage = { type: 'refresh' as const };
      messageListener(testMessage);

      expect(onMessage.calledOnce).to.be.true;
      expect(onMessage.firstCall.args[0]).to.deep.equal(testMessage);
    });
  });
});
