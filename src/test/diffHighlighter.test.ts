/**
 * Unit Tests for Diff Highlighter
 *
 * Tests the highlightDiff, computeBlockDiffs, and computeWordDiff functions
 * with realistic DiffHunk objects. Verifies CSS class presence in output HTML.
 *
 * Requirements covered: 4.1, 4.2, 4.3, 4.4
 */

import { expect } from 'chai';
import { highlightDiff, computeBlockDiffs, computeWordDiff } from '../diffHighlighter';
import { DiffHunk, DiffChange } from '../diffParser';

/**
 * Helper to build a DiffHunk from a concise description.
 */
function makeHunk(
  oldStart: number,
  oldLines: number,
  newStart: number,
  newLines: number,
  changes: DiffChange[],
): DiffHunk {
  return { oldStart, oldLines, newStart, newLines, changes };
}

describe('Diff Highlighter - highlightDiff', function () {
  it('should highlight a fully added block with diff-added-block class on new pane', function () {
    // A hunk that adds two lines after line 2 of the old file
    const oldMarkdown = '# Title\n\nExisting paragraph.';
    const newMarkdown = '# Title\n\nNew first line.\n\nNew second line.\n\nExisting paragraph.';

    const hunks: DiffHunk[] = [
      makeHunk(3, 1, 3, 5, [
        { type: 'add', content: 'New first line.', newLineNumber: 3 },
        { type: 'add', content: '', newLineNumber: 4 },
        { type: 'add', content: 'New second line.', newLineNumber: 5 },
        { type: 'add', content: '', newLineNumber: 6 },
        { type: 'normal', content: 'Existing paragraph.', oldLineNumber: 3, newLineNumber: 7 },
      ]),
    ];

    const result = highlightDiff(oldMarkdown, newMarkdown, hunks);

    // New HTML should contain the added block class
    expect(result.newHtml).to.include('diff-added-block');
    // Old HTML should NOT contain added block class
    expect(result.oldHtml).to.not.include('diff-added-block');
  });

  it('should highlight a fully removed block with diff-removed-block class on old pane', function () {
    // A hunk that removes two lines from the old file
    const oldMarkdown = '# Title\n\nRemoved paragraph.\n\nKeep this.';
    const newMarkdown = '# Title\n\nKeep this.';

    const hunks: DiffHunk[] = [
      makeHunk(3, 3, 3, 1, [
        { type: 'del', content: 'Removed paragraph.', oldLineNumber: 3 },
        { type: 'del', content: '', oldLineNumber: 4 },
        { type: 'normal', content: 'Keep this.', oldLineNumber: 5, newLineNumber: 3 },
      ]),
    ];

    const result = highlightDiff(oldMarkdown, newMarkdown, hunks);

    // Old HTML should contain the removed block class
    expect(result.oldHtml).to.include('diff-removed-block');
    // New HTML should NOT contain removed block class
    expect(result.newHtml).to.not.include('diff-removed-block');
  });

  it('should highlight a modified block with word-level diffs', function () {
    // A hunk where a line is changed (del followed by add = modified)
    const oldMarkdown = 'Hello world';
    const newMarkdown = 'Hello universe';

    const hunks: DiffHunk[] = [
      makeHunk(1, 1, 1, 1, [
        { type: 'del', content: 'Hello world', oldLineNumber: 1 },
        { type: 'add', content: 'Hello universe', newLineNumber: 1 },
      ]),
    ];

    const result = highlightDiff(oldMarkdown, newMarkdown, hunks);

    // Modified blocks get wrapped: old side in diff-removed-block, new side in diff-added-block
    expect(result.oldHtml).to.include('diff-removed-block');
    expect(result.newHtml).to.include('diff-added-block');

    // Word-level diffs should be present
    expect(result.oldHtml).to.include('diff-removed-word');
    expect(result.newHtml).to.include('diff-added-word');
  });

  it('should not apply highlight classes to unchanged content', function () {
    const markdown = '# Title\n\nSome paragraph.\n\nAnother paragraph.';

    // No hunks means no changes
    const hunks: DiffHunk[] = [];

    const result = highlightDiff(markdown, markdown, hunks);

    // Neither pane should have any highlight classes
    expect(result.oldHtml).to.not.include('diff-added-block');
    expect(result.oldHtml).to.not.include('diff-removed-block');
    expect(result.oldHtml).to.not.include('diff-added-word');
    expect(result.oldHtml).to.not.include('diff-removed-word');

    expect(result.newHtml).to.not.include('diff-added-block');
    expect(result.newHtml).to.not.include('diff-removed-block');
    expect(result.newHtml).to.not.include('diff-added-word');
    expect(result.newHtml).to.not.include('diff-removed-word');
  });

  it('should highlight all new content for an added file scenario', function () {
    // Added file: old is empty, new has content
    const oldMarkdown = '';
    const newMarkdown = '# New Document\n\nThis is brand new content.';

    const hunks: DiffHunk[] = [
      makeHunk(0, 0, 1, 3, [
        { type: 'add', content: '# New Document', newLineNumber: 1 },
        { type: 'add', content: '', newLineNumber: 2 },
        { type: 'add', content: 'This is brand new content.', newLineNumber: 3 },
      ]),
    ];

    const result = highlightDiff(oldMarkdown, newMarkdown, hunks);

    // Old pane should be empty
    expect(result.oldHtml).to.equal('');
    // New pane should be entirely wrapped in diff-added-block
    expect(result.newHtml).to.include('diff-added-block');
  });

  it('should highlight all old content for a deleted file scenario', function () {
    // Deleted file: old has content, new is empty
    const oldMarkdown = '# Old Document\n\nThis content is being deleted.';
    const newMarkdown = '';

    const hunks: DiffHunk[] = [
      makeHunk(1, 3, 0, 0, [
        { type: 'del', content: '# Old Document', oldLineNumber: 1 },
        { type: 'del', content: '', oldLineNumber: 2 },
        { type: 'del', content: 'This content is being deleted.', oldLineNumber: 3 },
      ]),
    ];

    const result = highlightDiff(oldMarkdown, newMarkdown, hunks);

    // New pane should be empty
    expect(result.newHtml).to.equal('');
    // Old pane should be entirely wrapped in diff-removed-block
    expect(result.oldHtml).to.include('diff-removed-block');
  });
});

describe('Diff Highlighter - computeBlockDiffs', function () {
  it('should classify added lines as type "added"', function () {
    const oldLines = ['line1', 'line2'];
    const newLines = ['line1', 'inserted', 'line2'];

    const hunks: DiffHunk[] = [
      makeHunk(2, 1, 2, 2, [
        { type: 'add', content: 'inserted', newLineNumber: 2 },
        { type: 'normal', content: 'line2', oldLineNumber: 2, newLineNumber: 3 },
      ]),
    ];

    const blocks = computeBlockDiffs(oldLines, newLines, hunks);

    const addedBlock = blocks.find((b) => b.type === 'added');
    expect(addedBlock).to.exist;
    expect(addedBlock!.newLines).to.deep.equal(['inserted']);
    expect(addedBlock!.oldLines).to.deep.equal([]);
  });

  it('should classify removed lines as type "removed"', function () {
    const oldLines = ['line1', 'to-remove', 'line2'];
    const newLines = ['line1', 'line2'];

    const hunks: DiffHunk[] = [
      makeHunk(2, 2, 2, 1, [
        { type: 'del', content: 'to-remove', oldLineNumber: 2 },
        { type: 'normal', content: 'line2', oldLineNumber: 3, newLineNumber: 2 },
      ]),
    ];

    const blocks = computeBlockDiffs(oldLines, newLines, hunks);

    const removedBlock = blocks.find((b) => b.type === 'removed');
    expect(removedBlock).to.exist;
    expect(removedBlock!.oldLines).to.deep.equal(['to-remove']);
    expect(removedBlock!.newLines).to.deep.equal([]);
  });

  it('should classify del followed by add as type "modified"', function () {
    const oldLines = ['old content'];
    const newLines = ['new content'];

    const hunks: DiffHunk[] = [
      makeHunk(1, 1, 1, 1, [
        { type: 'del', content: 'old content', oldLineNumber: 1 },
        { type: 'add', content: 'new content', newLineNumber: 1 },
      ]),
    ];

    const blocks = computeBlockDiffs(oldLines, newLines, hunks);

    const modifiedBlock = blocks.find((b) => b.type === 'modified');
    expect(modifiedBlock).to.exist;
    expect(modifiedBlock!.oldLines).to.deep.equal(['old content']);
    expect(modifiedBlock!.newLines).to.deep.equal(['new content']);
  });

  it('should return unchanged block when there are no hunks', function () {
    const lines = ['line1', 'line2', 'line3'];

    const blocks = computeBlockDiffs(lines, lines, []);

    expect(blocks).to.have.lengthOf(1);
    expect(blocks[0].type).to.equal('unchanged');
    expect(blocks[0].oldLines).to.deep.equal(lines);
    expect(blocks[0].newLines).to.deep.equal(lines);
  });

  it('should return empty array for empty inputs with no hunks', function () {
    const blocks = computeBlockDiffs([], [], []);
    expect(blocks).to.deep.equal([]);
  });
});

describe('Diff Highlighter - computeWordDiff', function () {
  it('should annotate changed words with diff-removed-word and diff-added-word', function () {
    const result = computeWordDiff('Hello world', 'Hello universe');

    // Old text should have "world" wrapped in diff-removed-word
    expect(result.oldAnnotated).to.include('diff-removed-word');
    expect(result.oldAnnotated).to.include('world');

    // New text should have "universe" wrapped in diff-added-word
    expect(result.newAnnotated).to.include('diff-added-word');
    expect(result.newAnnotated).to.include('universe');
  });

  it('should not annotate identical strings', function () {
    const result = computeWordDiff('Same text here', 'Same text here');

    expect(result.oldAnnotated).to.not.include('diff-removed-word');
    expect(result.oldAnnotated).to.not.include('diff-added-word');
    expect(result.newAnnotated).to.not.include('diff-removed-word');
    expect(result.newAnnotated).to.not.include('diff-added-word');

    // Content should still be present (HTML-escaped)
    expect(result.oldAnnotated).to.include('Same text here');
    expect(result.newAnnotated).to.include('Same text here');
  });

  it('should handle completely different strings', function () {
    const result = computeWordDiff('alpha beta', 'gamma delta');

    // Old should have removed-word spans
    expect(result.oldAnnotated).to.include('diff-removed-word');
    // New should have added-word spans
    expect(result.newAnnotated).to.include('diff-added-word');
  });

  it('should escape HTML special characters in output', function () {
    const result = computeWordDiff('<div>old</div>', '<div>new</div>');

    // HTML characters should be escaped
    expect(result.oldAnnotated).to.include('&lt;');
    expect(result.oldAnnotated).to.include('&gt;');
    expect(result.newAnnotated).to.include('&lt;');
    expect(result.newAnnotated).to.include('&gt;');

    // Should not contain raw HTML tags from the input
    expect(result.oldAnnotated).to.not.include('<div>');
    expect(result.newAnnotated).to.not.include('<div>');
  });
});
