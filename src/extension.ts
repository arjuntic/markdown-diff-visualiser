/**
 * Extension Controller - Registers commands, orchestrates the diff preview pipeline,
 * and manages lifecycle/disposables.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { createGitService, DiffMode, GitError } from './gitService';
import { parseDiff, reconstructContent, DiffResult } from './diffParser';
import { highlightDiff } from './diffHighlighter';
import { createPanelManager, PanelManager, WebviewMessage } from './webviewPanelManager';

/** Threshold for large file warning (lines). */
const LARGE_FILE_LINE_THRESHOLD = 50_000;

/** Threshold for incremental rendering (lines). */
const INCREMENTAL_RENDER_LINE_THRESHOLD = 1_000;

/** Number of hunks to process per incremental batch. */
const INCREMENTAL_BATCH_SIZE = 10;

/** Output channel for extension logging. */
let outputChannel: vscode.OutputChannel;

/** The active panel manager instance. */
let panelManager: PanelManager | undefined;

/** The active file watcher disposable. */
let fileWatcher: vscode.Disposable | undefined;

/** Current diff mode, defaults to unstaged. */
let currentDiffMode: DiffMode = 'unstaged';

/** The file path currently being previewed. */
let currentFilePath: string | undefined;

/** Current commit SHA when in commit mode. */
let currentCommitSha: string | undefined;

/**
 * Check if a file path has a markdown extension.
 */
function isMarkdownFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.md' || ext === '.markdown';
}

/**
 * Log a message to the output channel.
 */
function log(message: string): void {
  if (outputChannel) {
    outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
  }
}

/**
 * Run the full diff preview pipeline for a given file and mode.
 */
async function runPipeline(
  filePath: string,
  mode: DiffMode,
  context: vscode.ExtensionContext,
  commitSha?: string,
  changedSectionsOnly?: boolean
): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder is open.');
    return;
  }

  const workspaceRoot = workspaceFolder.uri.fsPath;
  const fileName = path.basename(filePath);

  log(`Running pipeline for "${fileName}" in ${mode} mode`);

  // Step 1: Get diff via Git Service
  const gitService = createGitService(workspaceRoot, commitSha);
  let rawDiff: string;
  try {
    rawDiff = await gitService.getDiff(filePath, mode);
  } catch (error) {
    if (error instanceof GitError) {
      switch (error.code) {
        case 'GIT_NOT_INSTALLED':
          vscode.window.showErrorMessage(error.message);
          log(`Error: ${error.message}`);
          return;
        case 'NOT_A_REPO':
          vscode.window.showErrorMessage(error.message);
          log(`Error: ${error.message}`);
          return;
        case 'FILE_NOT_TRACKED':
          vscode.window.showInformationMessage(error.message);
          log(`Info: ${error.message}`);
          return;
        default:
          vscode.window.showErrorMessage(error.message);
          log(`Error: ${error.message}`);
          return;
      }
    }
    const msg = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Git error: ${msg}`);
    log(`Unexpected error: ${msg}`);
    return;
  }

  // Step 2: Check for no changes
  if (!rawDiff || rawDiff.trim().length === 0) {
    vscode.window.showInformationMessage(`No changes found for ${fileName}`);
    log(`No changes found for "${fileName}"`);
    return;
  }

  // Step 3: Parse diff
  const diffResults = parseDiff(rawDiff);
  if (diffResults.length === 0) {
    vscode.window.showInformationMessage(`No changes found for ${fileName}`);
    log(`Parsed diff returned no results for "${fileName}"`);
    return;
  }

  // Use the first diff result for this file
  const diffResult = diffResults[0];

  // Step 4: Read current file content for reconstruction
  let currentContent: string;
  try {
    const fileUri = vscode.Uri.file(
      path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot, filePath)
    );
    const fileBytes = await vscode.workspace.fs.readFile(fileUri);
    currentContent = Buffer.from(fileBytes).toString('utf-8');
  } catch {
    // If file doesn't exist (deleted), use empty content
    currentContent = '';
  }

  // Step 5: Check for large files
  const lineCount = currentContent.split('\n').length;
  if (lineCount > LARGE_FILE_LINE_THRESHOLD && !changedSectionsOnly) {
    const choice = await vscode.window.showWarningMessage(
      `This file has ${lineCount} lines, which may take a while to render. Render changed sections only?`,
      'Changed Sections Only',
      'Render Full File'
    );
    if (choice === 'Changed Sections Only') {
      return runPipeline(filePath, mode, context, commitSha, true);
    }
    // If 'Render Full File' or dismissed, continue with full rendering
  }

  // Step 6: Reconstruct old/new content
  const { oldContent, newContent } = reconstructContent(currentContent, diffResult.hunks);

  // Step 7: Ensure panel is ready before rendering
  if (!panelManager) {
    panelManager = createPanelManager(context, handleWebviewMessage(context));
  }

  // Step 8: Decide between incremental and full rendering
  const shouldRenderIncrementally =
    lineCount > INCREMENTAL_RENDER_LINE_THRESHOLD &&
    diffResult.hunks.length > INCREMENTAL_BATCH_SIZE &&
    !changedSectionsOnly;

  if (shouldRenderIncrementally) {
    await runIncrementalPipeline(
      oldContent,
      newContent,
      diffResult,
      fileName,
      mode,
      commitSha
    );
  } else {
    // Full rendering for small files
    let highlighted;
    try {
      highlighted = highlightDiff(oldContent, newContent, diffResult.hunks);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log(`Rendering/highlighting error: ${msg}. Falling back to raw content.`);
      highlighted = {
        oldHtml: `<pre>${escapeHtml(oldContent)}</pre>`,
        newHtml: `<pre>${escapeHtml(newContent)}</pre>`,
      };
    }

    panelManager.showPreview({
      oldHtml: highlighted.oldHtml,
      newHtml: highlighted.newHtml,
      fileName,
      fileStatus: diffResult.status,
      diffMode: mode,
      commitRef: commitSha,
    });
  }

  log(`Preview shown for "${fileName}" (${diffResult.status}, ${mode} mode)`);
}

/**
 * Run the pipeline incrementally for large files.
 *
 * Processes hunks in batches, sending the first batch as an initial `update`
 * message and subsequent batches as `appendContent` messages. This ensures
 * the user sees initial content before the full diff is processed.
 */
async function runIncrementalPipeline(
  oldContent: string,
  newContent: string,
  diffResult: DiffResult,
  fileName: string,
  mode: DiffMode,
  commitSha?: string
): Promise<void> {
  if (!panelManager) {
    return;
  }

  const hunks = diffResult.hunks;
  const totalBatches = Math.ceil(hunks.length / INCREMENTAL_BATCH_SIZE);

  log(`Incremental rendering: ${hunks.length} hunks in ${totalBatches} batches`);

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const start = batchIndex * INCREMENTAL_BATCH_SIZE;
    const end = Math.min(start + INCREMENTAL_BATCH_SIZE, hunks.length);
    const batchHunks = hunks.slice(start, end);

    let highlighted;
    try {
      highlighted = highlightDiff(oldContent, newContent, batchHunks);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log(`Incremental rendering error (batch ${batchIndex + 1}): ${msg}. Falling back to raw content.`);
      highlighted = {
        oldHtml: `<pre>${escapeHtml(oldContent)}</pre>`,
        newHtml: `<pre>${escapeHtml(newContent)}</pre>`,
      };
    }

    if (batchIndex === 0) {
      // First batch: send as full update (sets header, clears panes, renders initial content)
      panelManager.showPreview({
        oldHtml: highlighted.oldHtml,
        newHtml: highlighted.newHtml,
        fileName,
        fileStatus: diffResult.status,
        diffMode: mode,
        commitRef: commitSha,
      });
    } else {
      // Subsequent batches: append to existing content
      panelManager.postMessage({
        type: 'appendContent',
        payload: {
          oldHtml: highlighted.oldHtml,
          newHtml: highlighted.newHtml,
        },
      });
    }

    // Yield to the event loop between batches so the webview can render
    if (batchIndex < totalBatches - 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
}

/**
 * Escape HTML special characters for fallback rendering.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Create a message handler for webview messages.
 */
function handleWebviewMessage(context: vscode.ExtensionContext): (message: WebviewMessage) => void {
  return (message: WebviewMessage) => {
    switch (message.type) {
      case 'refresh': {
        log('Received refresh request from webview');
        if (currentFilePath) {
          runPipeline(currentFilePath, currentDiffMode, context, currentCommitSha).catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            log(`Error during refresh: ${msg}`);
            vscode.window.showErrorMessage(`Refresh failed: ${msg}`);
          });
        }
        break;
      }
      case 'switchMode': {
        const payload = message.payload;
        if (payload) {
          const newMode = payload['mode'] as DiffMode | undefined;
          const commitSha = payload['commitSha'] as string | undefined;
          if (newMode && (newMode === 'unstaged' || newMode === 'staged' || newMode === 'commit')) {
            currentDiffMode = newMode;
            currentCommitSha = commitSha;
            log(`Switched to ${newMode} mode${commitSha ? ` (commit: ${commitSha})` : ''}`);
            if (currentFilePath) {
              runPipeline(currentFilePath, currentDiffMode, context, currentCommitSha).catch((err) => {
                const msg = err instanceof Error ? err.message : String(err);
                log(`Error during mode switch: ${msg}`);
                vscode.window.showErrorMessage(`Mode switch failed: ${msg}`);
              });
            }
          }
        }
        break;
      }
      case 'requestCommitSha': {
        log('Received requestCommitSha from webview');
        (async () => {
          const sha = await vscode.window.showInputBox({
            prompt: 'Enter a commit SHA or short hash',
            placeHolder: 'e.g. abc1234 or HEAD~1',
            validateInput: (value) => {
              if (!value || value.trim().length === 0) {
                return 'Please enter a commit reference';
              }
              return undefined;
            },
          });
          if (sha) {
            currentDiffMode = 'commit';
            currentCommitSha = sha.trim();
            log(`Commit mode selected with SHA: ${currentCommitSha}`);
            if (currentFilePath) {
              await runPipeline(currentFilePath, currentDiffMode, context, currentCommitSha);
            }
          }
        })().catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          log(`Error during commit SHA request: ${msg}`);
          vscode.window.showErrorMessage(`Failed to load commit diff: ${msg}`);
        });
        break;
      }
      default:
        break;
    }
  };
}

/**
 * Set up a file watcher for the given markdown file to auto-refresh the preview.
 */
function setupFileWatcher(filePath: string, context: vscode.ExtensionContext): void {
  // Dispose any existing file watcher
  if (fileWatcher) {
    fileWatcher.dispose();
    fileWatcher = undefined;
  }

  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '', filePath);

  const pattern = new vscode.RelativePattern(
    path.dirname(absolutePath),
    path.basename(absolutePath)
  );

  const watcher = vscode.workspace.createFileSystemWatcher(pattern);

  const refreshHandler = () => {
    if (currentFilePath && panelManager?.isOpen()) {
      log(`File changed: ${path.basename(absolutePath)}, refreshing preview`);
      runPipeline(currentFilePath, currentDiffMode, context, currentCommitSha).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        log(`Error during auto-refresh: ${msg}`);
      });
    }
  };

  watcher.onDidChange(refreshHandler);
  watcher.onDidCreate(refreshHandler);

  fileWatcher = watcher;
  context.subscriptions.push(watcher);
}

/**
 * Activate the extension. Called by VS Code when the extension is activated.
 */
export function activate(context: vscode.ExtensionContext): void {
  // Create the output channel for logging
  outputChannel = vscode.window.createOutputChannel('Markdown Diff Preview');
  context.subscriptions.push(outputChannel);

  log('Markdown Diff Preview extension activated');

  // Register the main command
  const showChangesCommand = vscode.commands.registerCommand(
    'markdownDiffPreview.showChanges',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage('No active editor found. Open a markdown file first.');
        return;
      }

      const filePath = editor.document.uri.fsPath;

      // Check if it's a markdown file
      if (!isMarkdownFile(filePath)) {
        vscode.window.showInformationMessage('This command applies only to markdown files');
        return;
      }

      // Store the current file path for refresh/mode-switch
      currentFilePath = filePath;
      currentDiffMode = 'unstaged';
      currentCommitSha = undefined;

      // Run the pipeline
      await runPipeline(filePath, currentDiffMode, context, currentCommitSha);

      // Set up file watcher for auto-refresh
      setupFileWatcher(filePath, context);
    }
  );

  context.subscriptions.push(showChangesCommand);
}

/**
 * Deactivate the extension. Called by VS Code when the extension is deactivated.
 */
export function deactivate(): void {
  // Dispose file watcher
  if (fileWatcher) {
    fileWatcher.dispose();
    fileWatcher = undefined;
  }

  // Dispose panel manager
  if (panelManager) {
    panelManager.dispose();
    panelManager = undefined;
  }

  // Reset state
  currentFilePath = undefined;
  currentDiffMode = 'unstaged';
  currentCommitSha = undefined;
}
