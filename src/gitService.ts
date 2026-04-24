/**
 * Git Service - Retrieves diff output and file content for unstaged, staged, and commit modes.
 * Uses child_process.execFile throughout for safety (no shell injection).
 */

import { execFile } from 'child_process';
import * as path from 'path';

export type DiffMode = 'unstaged' | 'staged' | 'commit';

export interface DiffOptions {
  mode: DiffMode;
  commitSha?: string;
}

export interface ChangedFile {
  filePath: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed';
  oldPath?: string;
}

export interface GitService {
  getDiff(filePath: string, mode: DiffMode): Promise<string>;
  getFileContent(filePath: string, ref: string): Promise<string>;
  hasChanges(filePath: string, mode: DiffMode): Promise<boolean>;
  getRepoRoot(): Promise<string>;
  getChangedMarkdownFiles(mode: DiffMode): Promise<ChangedFile[]>;
}

export class GitError extends Error {
  constructor(
    message: string,
    public readonly code: 'GIT_NOT_INSTALLED' | 'NOT_A_REPO' | 'FILE_NOT_TRACKED' | 'NO_CHANGES' | 'COMMAND_FAILED'
  ) {
    super(message);
    this.name = 'GitError';
  }
}

/**
 * Execute a git command using child_process.execFile for safety.
 */
function execGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const message = stderr?.trim() || error.message;

        // Git not installed or not in PATH
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(new GitError(
            'Git is not available. Please install Git to use Markdown Diff Preview.',
            'GIT_NOT_INSTALLED'
          ));
          return;
        }

        // Not a git repository
        if (message.includes('not a git repository')) {
          reject(new GitError(
            'No git repository found for the current workspace.',
            'NOT_A_REPO'
          ));
          return;
        }

        // File not tracked / path does not exist
        if (message.includes('does not exist') || message.includes('did not match any file')) {
          reject(new GitError(
            'This file is not tracked by git.',
            'FILE_NOT_TRACKED'
          ));
          return;
        }

        // Generic command failure
        reject(new GitError(
          `Git command failed: ${message}`,
          'COMMAND_FAILED'
        ));
        return;
      }

      resolve(stdout);
    });
  });
}

/**
 * Parse the status letter from git diff --name-status output.
 */
function parseFileStatus(statusLetter: string): 'modified' | 'added' | 'deleted' | 'renamed' {
  switch (statusLetter.charAt(0)) {
    case 'A': return 'added';
    case 'D': return 'deleted';
    case 'R': return 'renamed';
    case 'M': return 'modified';
    default: return 'modified';
  }
}

/**
 * Check if a file path is a markdown file.
 */
function isMarkdownFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.md' || ext === '.markdown';
}

/**
 * Factory function to create a GitService instance.
 * @param workspaceRoot - The root directory of the workspace
 * @param commitSha - Optional commit SHA for commit mode diffs
 */
export function createGitService(workspaceRoot: string, commitSha?: string): GitService {
  return {
    async getRepoRoot(): Promise<string> {
      const output = await execGit(['rev-parse', '--show-toplevel'], workspaceRoot);
      return output.trim();
    },

    async getDiff(filePath: string, mode: DiffMode): Promise<string> {
      const relativePath = path.isAbsolute(filePath)
        ? path.relative(workspaceRoot, filePath)
        : filePath;

      let args: string[];

      switch (mode) {
        case 'unstaged':
          args = ['diff', '--', relativePath];
          break;
        case 'staged':
          args = ['diff', '--cached', '--', relativePath];
          break;
        case 'commit': {
          const sha = commitSha;
          if (!sha) {
            throw new GitError(
              'Commit SHA is required for commit mode.',
              'COMMAND_FAILED'
            );
          }
          args = ['diff', `${sha}~1`, sha, '--', relativePath];
          break;
        }
      }

      return execGit(args, workspaceRoot);
    },

    async getFileContent(filePath: string, ref: string): Promise<string> {
      const relativePath = path.isAbsolute(filePath)
        ? path.relative(workspaceRoot, filePath)
        : filePath;

      // git show uses colon syntax: <ref>:<path>
      // Normalize path separators to forward slashes for git
      const gitPath = relativePath.split(path.sep).join('/');
      return execGit(['show', `${ref}:${gitPath}`], workspaceRoot);
    },

    async hasChanges(filePath: string, mode: DiffMode): Promise<boolean> {
      try {
        const diff = await this.getDiff(filePath, mode);
        return diff.trim().length > 0;
      } catch (error) {
        if (error instanceof GitError && error.code === 'FILE_NOT_TRACKED') {
          return false;
        }
        throw error;
      }
    },

    async getChangedMarkdownFiles(mode: DiffMode): Promise<ChangedFile[]> {
      let args: string[];

      switch (mode) {
        case 'unstaged':
          args = ['diff', '--name-status'];
          break;
        case 'staged':
          args = ['diff', '--cached', '--name-status'];
          break;
        case 'commit': {
          const sha = commitSha;
          if (!sha) {
            throw new GitError(
              'Commit SHA is required for commit mode.',
              'COMMAND_FAILED'
            );
          }
          args = ['diff', `${sha}~1`, sha, '--name-status'];
          break;
        }
      }

      const output = await execGit(args, workspaceRoot);
      const lines = output.trim().split('\n').filter(line => line.length > 0);
      const changedFiles: ChangedFile[] = [];

      for (const line of lines) {
        const parts = line.split('\t');
        if (parts.length < 2) {
          continue;
        }

        const statusLetter = parts[0];
        const status = parseFileStatus(statusLetter);

        if (status === 'renamed' && parts.length >= 3) {
          const oldFilePath = parts[1];
          const newFilePath = parts[2];

          if (isMarkdownFile(newFilePath)) {
            changedFiles.push({
              filePath: newFilePath,
              status: 'renamed',
              oldPath: oldFilePath,
            });
          }
        } else {
          const changedFilePath = parts[1];

          if (isMarkdownFile(changedFilePath)) {
            changedFiles.push({
              filePath: changedFilePath,
              status,
            });
          }
        }
      }

      return changedFiles;
    },
  };
}
