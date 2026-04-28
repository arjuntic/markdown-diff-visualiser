/**
 * Unit Tests for Git Service
 *
 * Tests the createGitService factory and all GitService methods.
 * Uses sinon to stub child_process.execFile to mock git commands.
 *
 * Requirements covered: 6.1, 6.2, 6.3
 */

import { expect } from 'chai';
import * as sinon from 'sinon';
import { createGitService, GitError } from '../gitService';

// Use require to get a mutable reference to child_process
// (import * as creates a frozen ESM namespace in newer Node.js)
const childProcess = require('child_process');

describe('Git Service', function () {
  let execFileStub: sinon.SinonStub;

  beforeEach(function () {
    execFileStub = sinon.stub(childProcess, 'execFile');
  });

  afterEach(function () {
    sinon.restore();
  });

  /**
   * Helper to configure the execFile stub to call back with given results
   * for any invocation.
   */
  function stubExecFileAny(result: {
    stdout?: string;
    stderr?: string;
    error?: NodeJS.ErrnoException | null;
  }): void {
    execFileStub.callsFake((_cmd: string, _args: string[], _opts: any, callback: Function) => {
      callback(result.error || null, result.stdout || '', result.stderr || '');
    });
  }

  /**
   * Helper to configure the execFile stub to respond based on the git args.
   */
  function stubExecFileForArgs(
    expectedArgs: string[],
    result: {
      stdout?: string;
      stderr?: string;
      error?: NodeJS.ErrnoException | null;
    },
  ): void {
    execFileStub.callsFake((_cmd: string, args: string[], _opts: any, callback: Function) => {
      if (JSON.stringify(args) === JSON.stringify(expectedArgs)) {
        callback(result.error || null, result.stdout || '', result.stderr || '');
      } else {
        callback(null, '', '');
      }
    });
  }

  describe('getRepoRoot', function () {
    it('should return the repository root path', async function () {
      stubExecFileForArgs(['rev-parse', '--show-toplevel'], {
        stdout: '/home/user/project\n',
      });

      const service = createGitService('/home/user/project');
      const root = await service.getRepoRoot();

      expect(root).to.equal('/home/user/project');
    });

    it('should trim whitespace from the output', async function () {
      stubExecFileForArgs(['rev-parse', '--show-toplevel'], {
        stdout: '  /home/user/project  \n',
      });

      const service = createGitService('/home/user/project');
      const root = await service.getRepoRoot();

      expect(root).to.equal('/home/user/project');
    });
  });

  describe('getDiff', function () {
    it('should return diff output for unstaged mode', async function () {
      const diffOutput =
        'diff --git a/README.md b/README.md\n--- a/README.md\n+++ b/README.md\n@@ -1 +1 @@\n-old\n+new\n';

      stubExecFileForArgs(['diff', '--', 'README.md'], {
        stdout: diffOutput,
      });

      const service = createGitService('/workspace');
      const result = await service.getDiff('README.md', 'unstaged');

      expect(result).to.equal(diffOutput);
    });

    it('should return diff output for staged mode', async function () {
      const diffOutput =
        'diff --git a/README.md b/README.md\n--- a/README.md\n+++ b/README.md\n@@ -1 +1 @@\n-old\n+new\n';

      stubExecFileForArgs(['diff', '--cached', '--', 'README.md'], {
        stdout: diffOutput,
      });

      const service = createGitService('/workspace');
      const result = await service.getDiff('README.md', 'staged');

      expect(result).to.equal(diffOutput);
    });

    it('should return diff output for commit mode', async function () {
      const diffOutput =
        'diff --git a/README.md b/README.md\n--- a/README.md\n+++ b/README.md\n@@ -1 +1 @@\n-old\n+new\n';

      stubExecFileForArgs(['diff', 'abc123~1', 'abc123', '--', 'README.md'], {
        stdout: diffOutput,
      });

      const service = createGitService('/workspace', 'abc123');
      const result = await service.getDiff('README.md', 'commit');

      expect(result).to.equal(diffOutput);
    });

    it('should throw GitError when commit mode is used without commitSha', async function () {
      const service = createGitService('/workspace');

      try {
        await service.getDiff('README.md', 'commit');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).to.be.instanceOf(GitError);
        expect((err as GitError).code).to.equal('COMMAND_FAILED');
      }
    });

    it('should convert absolute file paths to relative paths', async function () {
      stubExecFileForArgs(['diff', '--', 'src/README.md'], {
        stdout: 'some diff output',
      });

      const service = createGitService('/workspace');
      const result = await service.getDiff('/workspace/src/README.md', 'unstaged');

      expect(result).to.equal('some diff output');
    });
  });

  describe('getFileContent', function () {
    it('should return file content at a specific ref', async function () {
      const content = '# Hello World\n\nSome content here.\n';

      stubExecFileForArgs(['show', 'HEAD:README.md'], {
        stdout: content,
      });

      const service = createGitService('/workspace');
      const result = await service.getFileContent('README.md', 'HEAD');

      expect(result).to.equal(content);
    });

    it('should convert absolute paths to relative and normalize separators', async function () {
      stubExecFileForArgs(['show', 'HEAD:src/docs/README.md'], {
        stdout: 'file content',
      });

      const service = createGitService('/workspace');
      const result = await service.getFileContent('/workspace/src/docs/README.md', 'HEAD');

      expect(result).to.equal('file content');
    });
  });

  describe('hasChanges', function () {
    it('should return true when diff output is non-empty', async function () {
      stubExecFileForArgs(['diff', '--', 'README.md'], {
        stdout: 'diff --git a/README.md b/README.md\n-old\n+new\n',
      });

      const service = createGitService('/workspace');
      const result = await service.hasChanges('README.md', 'unstaged');

      expect(result).to.be.true;
    });

    it('should return false when diff output is empty', async function () {
      stubExecFileForArgs(['diff', '--', 'README.md'], {
        stdout: '',
      });

      const service = createGitService('/workspace');
      const result = await service.hasChanges('README.md', 'unstaged');

      expect(result).to.be.false;
    });

    it('should return false when diff output is only whitespace', async function () {
      stubExecFileForArgs(['diff', '--', 'README.md'], {
        stdout: '   \n  \n',
      });

      const service = createGitService('/workspace');
      const result = await service.hasChanges('README.md', 'unstaged');

      expect(result).to.be.false;
    });

    it('should return false when file is not tracked (FILE_NOT_TRACKED error)', async function () {
      const error = new Error('pathspec did not match any file') as NodeJS.ErrnoException;

      stubExecFileForArgs(['diff', '--', 'untracked.md'], {
        error,
        stderr: 'pathspec did not match any file',
      });

      const service = createGitService('/workspace');
      const result = await service.hasChanges('untracked.md', 'unstaged');

      expect(result).to.be.false;
    });

    it('should rethrow non-FILE_NOT_TRACKED errors', async function () {
      const error = new Error('fatal: not a git repository') as NodeJS.ErrnoException;

      stubExecFileForArgs(['diff', '--', 'README.md'], {
        error,
        stderr: 'fatal: not a git repository (or any of the parent directories): .git',
      });

      const service = createGitService('/workspace');

      try {
        await service.hasChanges('README.md', 'unstaged');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).to.be.instanceOf(GitError);
        expect((err as GitError).code).to.equal('NOT_A_REPO');
      }
    });
  });

  describe('getChangedMarkdownFiles', function () {
    it('should correctly parse and filter markdown files for unstaged mode', async function () {
      const nameStatusOutput = 'M\tREADME.md\nM\tsrc/index.ts\nA\tdocs/new.markdown\nD\told.md\n';

      stubExecFileForArgs(['diff', '--name-status'], {
        stdout: nameStatusOutput,
      });

      const service = createGitService('/workspace');
      const files = await service.getChangedMarkdownFiles('unstaged');

      expect(files).to.have.lengthOf(3);
      expect(files[0]).to.deep.equal({
        filePath: 'README.md',
        status: 'modified',
      });
      expect(files[1]).to.deep.equal({
        filePath: 'docs/new.markdown',
        status: 'added',
      });
      expect(files[2]).to.deep.equal({ filePath: 'old.md', status: 'deleted' });
    });

    it('should correctly parse and filter markdown files for staged mode', async function () {
      const nameStatusOutput = 'M\tREADME.md\nA\tnew-doc.md\n';

      stubExecFileForArgs(['diff', '--cached', '--name-status'], {
        stdout: nameStatusOutput,
      });

      const service = createGitService('/workspace');
      const files = await service.getChangedMarkdownFiles('staged');

      expect(files).to.have.lengthOf(2);
      expect(files[0]).to.deep.equal({
        filePath: 'README.md',
        status: 'modified',
      });
      expect(files[1]).to.deep.equal({
        filePath: 'new-doc.md',
        status: 'added',
      });
    });

    it('should correctly parse and filter markdown files for commit mode', async function () {
      const nameStatusOutput = 'M\tREADME.md\nM\tsrc/app.ts\n';

      stubExecFileForArgs(['diff', 'abc123~1', 'abc123', '--name-status'], {
        stdout: nameStatusOutput,
      });

      const service = createGitService('/workspace', 'abc123');
      const files = await service.getChangedMarkdownFiles('commit');

      expect(files).to.have.lengthOf(1);
      expect(files[0]).to.deep.equal({
        filePath: 'README.md',
        status: 'modified',
      });
    });

    it('should handle renamed markdown files with old and new paths', async function () {
      const nameStatusOutput = 'R100\told-name.md\tnew-name.md\n';

      stubExecFileForArgs(['diff', '--name-status'], {
        stdout: nameStatusOutput,
      });

      const service = createGitService('/workspace');
      const files = await service.getChangedMarkdownFiles('unstaged');

      expect(files).to.have.lengthOf(1);
      expect(files[0]).to.deep.equal({
        filePath: 'new-name.md',
        status: 'renamed',
        oldPath: 'old-name.md',
      });
    });

    it('should exclude non-markdown renamed files', async function () {
      const nameStatusOutput = 'R100\told-name.ts\tnew-name.ts\n';

      stubExecFileForArgs(['diff', '--name-status'], {
        stdout: nameStatusOutput,
      });

      const service = createGitService('/workspace');
      const files = await service.getChangedMarkdownFiles('unstaged');

      expect(files).to.have.lengthOf(0);
    });

    it('should return empty array when no markdown files changed', async function () {
      const nameStatusOutput = 'M\tsrc/index.ts\nA\tsrc/utils.js\n';

      stubExecFileForArgs(['diff', '--name-status'], {
        stdout: nameStatusOutput,
      });

      const service = createGitService('/workspace');
      const files = await service.getChangedMarkdownFiles('unstaged');

      expect(files).to.have.lengthOf(0);
    });

    it('should return empty array when output is empty', async function () {
      stubExecFileForArgs(['diff', '--name-status'], {
        stdout: '',
      });

      const service = createGitService('/workspace');
      const files = await service.getChangedMarkdownFiles('unstaged');

      expect(files).to.have.lengthOf(0);
    });

    it('should throw GitError when commit mode is used without commitSha', async function () {
      const service = createGitService('/workspace');

      try {
        await service.getChangedMarkdownFiles('commit');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).to.be.instanceOf(GitError);
        expect((err as GitError).code).to.equal('COMMAND_FAILED');
      }
    });
  });

  describe('Error Handling', function () {
    it('should throw GIT_NOT_INSTALLED error when git is not found (ENOENT)', async function () {
      const error = new Error('spawn git ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';

      stubExecFileAny({ error, stderr: '' });

      const service = createGitService('/workspace');

      try {
        await service.getRepoRoot();
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).to.be.instanceOf(GitError);
        expect((err as GitError).code).to.equal('GIT_NOT_INSTALLED');
        expect((err as GitError).message).to.include('Git is not available');
      }
    });

    it('should throw NOT_A_REPO error when not in a git repository', async function () {
      const error = new Error('fatal: not a git repository') as NodeJS.ErrnoException;

      stubExecFileAny({
        error,
        stderr: 'fatal: not a git repository (or any of the parent directories): .git',
      });

      const service = createGitService('/not-a-repo');

      try {
        await service.getRepoRoot();
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).to.be.instanceOf(GitError);
        expect((err as GitError).code).to.equal('NOT_A_REPO');
        expect((err as GitError).message).to.include('No git repository found');
      }
    });

    it('should throw FILE_NOT_TRACKED error when file does not exist in git', async function () {
      const error = new Error('pathspec did not match any file') as NodeJS.ErrnoException;

      stubExecFileAny({
        error,
        stderr: "error: pathspec 'unknown.md' did not match any file(s) known to git",
      });

      const service = createGitService('/workspace');

      try {
        await service.getDiff('unknown.md', 'unstaged');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).to.be.instanceOf(GitError);
        expect((err as GitError).code).to.equal('FILE_NOT_TRACKED');
        expect((err as GitError).message).to.include('not tracked');
      }
    });

    it('should throw FILE_NOT_TRACKED error when path does not exist', async function () {
      const error = new Error('path does not exist') as NodeJS.ErrnoException;

      stubExecFileAny({
        error,
        stderr: "fatal: path 'missing.md' does not exist in 'HEAD'",
      });

      const service = createGitService('/workspace');

      try {
        await service.getFileContent('missing.md', 'HEAD');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).to.be.instanceOf(GitError);
        expect((err as GitError).code).to.equal('FILE_NOT_TRACKED');
      }
    });

    it('should throw COMMAND_FAILED error for generic git failures', async function () {
      const error = new Error('git command failed') as NodeJS.ErrnoException;

      stubExecFileAny({
        error,
        stderr: 'error: some unexpected git error occurred',
      });

      const service = createGitService('/workspace');

      try {
        await service.getDiff('README.md', 'unstaged');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).to.be.instanceOf(GitError);
        expect((err as GitError).code).to.equal('COMMAND_FAILED');
        expect((err as GitError).message).to.include('Git command failed');
      }
    });

    it('should use error.message when stderr is empty', async function () {
      const error = new Error('Something went wrong') as NodeJS.ErrnoException;

      stubExecFileAny({
        error,
        stderr: '',
      });

      const service = createGitService('/workspace');

      try {
        await service.getDiff('README.md', 'unstaged');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).to.be.instanceOf(GitError);
        expect((err as GitError).code).to.equal('COMMAND_FAILED');
        expect((err as GitError).message).to.include('Something went wrong');
      }
    });
  });
});
