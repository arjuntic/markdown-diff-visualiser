/**
 * Unit Tests for Diff Parser
 *
 * Tests the parseDiff function with realistic git diff format strings.
 * Covers single-hunk, multi-hunk, rename, empty input, binary, added, and deleted file scenarios.
 *
 * Requirements covered: 1.1, 1.2, 1.3, 1.4, 1.5
 */

import { expect } from 'chai';
import { parseDiff } from '../diffParser';

describe('Diff Parser - parseDiff', function () {
  it('should parse a simple single-hunk diff and verify structure', function () {
    const rawDiff = [
      'diff --git a/README.md b/README.md',
      'index abc1234..def5678 100644',
      '--- a/README.md',
      '+++ b/README.md',
      '@@ -1,4 +1,4 @@',
      ' # Title',
      '-Old line',
      '+New line',
      ' ',
      ' End of file',
    ].join('\n');

    const results = parseDiff(rawDiff);

    expect(results).to.have.lengthOf(1);

    const result = results[0];
    expect(result.oldFilePath).to.equal('README.md');
    expect(result.newFilePath).to.equal('README.md');
    expect(result.status).to.equal('modified');
    expect(result.hunks).to.have.lengthOf(1);

    const hunk = result.hunks[0];
    expect(hunk.oldStart).to.equal(1);
    expect(hunk.oldLines).to.equal(4);
    expect(hunk.newStart).to.equal(1);
    expect(hunk.newLines).to.equal(4);

    // Verify changes structure
    expect(hunk.changes).to.have.lengthOf(5);

    // First change: context line "# Title"
    expect(hunk.changes[0].type).to.equal('normal');
    expect(hunk.changes[0].content).to.equal('# Title');
    expect(hunk.changes[0].oldLineNumber).to.equal(1);
    expect(hunk.changes[0].newLineNumber).to.equal(1);

    // Second change: deleted line "Old line"
    expect(hunk.changes[1].type).to.equal('del');
    expect(hunk.changes[1].content).to.equal('Old line');
    expect(hunk.changes[1].oldLineNumber).to.equal(2);

    // Third change: added line "New line"
    expect(hunk.changes[2].type).to.equal('add');
    expect(hunk.changes[2].content).to.equal('New line');
    expect(hunk.changes[2].newLineNumber).to.equal(2);
  });

  it('should parse a multi-hunk diff and verify hunk count and order', function () {
    const rawDiff = [
      'diff --git a/docs/guide.md b/docs/guide.md',
      'index 1111111..2222222 100644',
      '--- a/docs/guide.md',
      '+++ b/docs/guide.md',
      '@@ -2,3 +2,3 @@',
      ' Line before',
      '-Old first section',
      '+New first section',
      ' Line after',
      '@@ -20,3 +20,3 @@',
      ' Another context',
      '-Old second section',
      '+New second section',
      ' More context',
    ].join('\n');

    const results = parseDiff(rawDiff);

    expect(results).to.have.lengthOf(1);
    expect(results[0].hunks).to.have.lengthOf(2);

    // Verify hunk order is preserved
    expect(results[0].hunks[0].oldStart).to.equal(2);
    expect(results[0].hunks[1].oldStart).to.equal(20);

    // Verify each hunk has the expected changes
    expect(results[0].hunks[0].changes.length).to.be.greaterThan(0);
    expect(results[0].hunks[1].changes.length).to.be.greaterThan(0);
  });

  it('should parse a rename diff and verify old/new paths and status', function () {
    const rawDiff = [
      'diff --git a/old-name.md b/new-name.md',
      'similarity index 90%',
      'rename from old-name.md',
      'rename to new-name.md',
      'index aaa1111..bbb2222 100644',
      '--- a/old-name.md',
      '+++ b/new-name.md',
      '@@ -1,3 +1,3 @@',
      ' # Document',
      '-Old content',
      '+Updated content',
      ' Footer',
    ].join('\n');

    const results = parseDiff(rawDiff);

    expect(results).to.have.lengthOf(1);

    const result = results[0];
    expect(result.oldFilePath).to.equal('old-name.md');
    expect(result.newFilePath).to.equal('new-name.md');
    expect(result.status).to.equal('renamed');
  });

  it('should return empty array for empty diff input', function () {
    expect(parseDiff('')).to.deep.equal([]);
    expect(parseDiff('   ')).to.deep.equal([]);
    expect(parseDiff('\n\n')).to.deep.equal([]);
  });

  it('should handle binary file diff markers gracefully and return empty array', function () {
    const binaryDiff = [
      'diff --git a/image.png b/image.png',
      'index 1234567..abcdefg 100644',
      'Binary files a/image.png and b/image.png differ',
    ].join('\n');

    const results = parseDiff(binaryDiff);
    expect(results).to.deep.equal([]);

    // Also test the GIT binary patch variant
    const gitBinaryPatch = [
      'diff --git a/data.bin b/data.bin',
      'index 1234567..abcdefg 100644',
      'GIT binary patch',
      'literal 1234',
      'some binary data here',
    ].join('\n');

    const results2 = parseDiff(gitBinaryPatch);
    expect(results2).to.deep.equal([]);
  });

  it('should parse an added file diff with status "added"', function () {
    const rawDiff = [
      'diff --git a/new-file.md b/new-file.md',
      'new file mode 100644',
      'index 0000000..abc1234',
      '--- /dev/null',
      '+++ b/new-file.md',
      '@@ -0,0 +1,3 @@',
      '+# New Document',
      '+',
      '+This is a new file.',
    ].join('\n');

    const results = parseDiff(rawDiff);

    expect(results).to.have.lengthOf(1);

    const result = results[0];
    expect(result.status).to.equal('added');
    expect(result.newFilePath).to.equal('new-file.md');
    expect(result.hunks).to.have.lengthOf(1);

    // All changes should be additions
    for (const change of result.hunks[0].changes) {
      expect(change.type).to.equal('add');
    }
  });

  it('should parse a deleted file diff with status "deleted"', function () {
    const rawDiff = [
      'diff --git a/removed.md b/removed.md',
      'deleted file mode 100644',
      'index abc1234..0000000',
      '--- a/removed.md',
      '+++ /dev/null',
      '@@ -1,3 +0,0 @@',
      '-# Old Document',
      '-',
      '-This file is being deleted.',
    ].join('\n');

    const results = parseDiff(rawDiff);

    expect(results).to.have.lengthOf(1);

    const result = results[0];
    expect(result.status).to.equal('deleted');
    expect(result.oldFilePath).to.equal('removed.md');
    expect(result.hunks).to.have.lengthOf(1);

    // All changes should be deletions
    for (const change of result.hunks[0].changes) {
      expect(change.type).to.equal('del');
    }
  });
});
