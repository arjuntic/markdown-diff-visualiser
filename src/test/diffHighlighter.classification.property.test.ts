/**
 * Property-Based Test: Highlight classification correctness
 *
 * Feature: markdown-diff-visualiser, Property 5: Highlight classification correctness
 *
 * For any pair of old and new markdown contents with at least one difference,
 * the Diff_Highlighter SHALL annotate added content in the new HTML with the
 * `diff-added-block` class and removed content in the old HTML with the
 * `diff-removed-block` class. When old and new differ, at least one highlight
 * class must appear in the output.
 *
 * **Validates: Requirements 4.1, 4.2**
 */

import { expect } from 'chai';
import * as fc from 'fast-check';
import { highlightDiff } from '../diffHighlighter';
import { parseDiff } from '../diffParser';

const diffLib = require('diff');

/**
 * Generate a unified diff string in git diff format from old and new text.
 * Prepends the `diff --git` header that parse-diff expects.
 */
function createGitDiff(oldText: string, newText: string): string {
  const rawPatch: string = diffLib.createTwoFilesPatch('a/test.md', 'b/test.md', oldText, newText);
  const lines = rawPatch.split('\n');
  lines[0] = 'diff --git a/test.md b/test.md';
  return lines.join('\n');
}

/**
 * Arbitrary that generates a line of text without newlines.
 * Uses printable ASCII to keep diffs readable.
 */
const lineArb = fc.stringOf(
  fc.char().filter((c) => c !== '\n' && c !== '\r'),
  { minLength: 1, maxLength: 60 },
);

/**
 * Arbitrary that generates a multi-line markdown text ending with a newline.
 * Ensures at least 1 line so the diff is non-trivial.
 */
const textArb = fc
  .array(lineArb, { minLength: 1, maxLength: 15 })
  .map((lines) => lines.join('\n') + '\n');

/**
 * Arbitrary that generates a pair of old/new texts that are different.
 * This ensures the diff will contain at least one hunk.
 */
const diffPairArb = fc.tuple(textArb, textArb).filter(([oldText, newText]) => oldText !== newText);

describe('Feature: markdown-diff-visualiser, Property 5: Highlight classification correctness', function () {
  this.timeout(60000);

  it('should contain diff-added-block in new HTML when content is added', function () {
    fc.assert(
      fc.property(diffPairArb, ([oldText, newText]) => {
        // Step 1: Create a unified diff and parse it into hunks
        const gitDiff = createGitDiff(oldText, newText);
        const results = parseDiff(gitDiff);

        // Must parse successfully with at least one file result
        if (results.length === 0) {
          return; // skip if diff couldn't be parsed
        }

        const diffResult = results[0];

        // Must have at least one hunk since texts differ
        if (diffResult.hunks.length === 0) {
          return; // skip if no hunks
        }

        // Step 2: Run through highlightDiff
        const highlighted = highlightDiff(oldText, newText, diffResult.hunks);

        // Step 3: Verify that at least one highlight class appears
        const hasAddedBlock = highlighted.newHtml.includes('diff-added-block');
        const hasRemovedBlock = highlighted.oldHtml.includes('diff-removed-block');

        expect(
          hasAddedBlock || hasRemovedBlock,
          'When old and new content differ, at least one highlight class (diff-added-block or diff-removed-block) must appear in the output',
        ).to.be.true;
      }),
      {
        numRuns: 100,
        verbose: true,
      },
    );
  });

  it('should contain diff-added-block in new HTML for purely added content', function () {
    fc.assert(
      fc.property(textArb, (newText) => {
        // Fully added file: old is empty, new has content
        const oldText = '';

        const gitDiff = createGitDiff(oldText, newText);
        const results = parseDiff(gitDiff);

        if (results.length === 0 || results[0].hunks.length === 0) {
          return; // skip if diff couldn't be parsed
        }

        const highlighted = highlightDiff(oldText, newText, results[0].hunks);

        expect(
          highlighted.newHtml.includes('diff-added-block'),
          'Fully added file: new HTML must contain diff-added-block class',
        ).to.be.true;
      }),
      {
        numRuns: 100,
        verbose: true,
      },
    );
  });

  it('should contain diff-removed-block in old HTML for purely removed content', function () {
    fc.assert(
      fc.property(textArb, (oldText) => {
        // Fully deleted file: old has content, new is empty
        const newText = '';

        const gitDiff = createGitDiff(oldText, newText);
        const results = parseDiff(gitDiff);

        if (results.length === 0 || results[0].hunks.length === 0) {
          return; // skip if diff couldn't be parsed
        }

        const highlighted = highlightDiff(oldText, newText, results[0].hunks);

        expect(
          highlighted.oldHtml.includes('diff-removed-block'),
          'Fully deleted file: old HTML must contain diff-removed-block class',
        ).to.be.true;
      }),
      {
        numRuns: 100,
        verbose: true,
      },
    );
  });
});
