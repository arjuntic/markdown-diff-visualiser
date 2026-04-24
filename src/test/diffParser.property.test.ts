/**
 * Property-Based Test: Diff parse and reconstruct round-trip
 *
 * Feature: markdown-diff-visualiser, Property 1: Diff parse and reconstruct round-trip
 *
 * For any pair of old and new markdown file contents, producing a unified diff,
 * parsing that diff into hunks, and reconstructing the old and new content from
 * those hunks SHALL produce text identical to the original old and new file contents.
 *
 * **Validates: Requirements 1.1, 1.2, 1.5, 1.6**
 */

import { expect } from 'chai';
import * as fc from 'fast-check';
import { parseDiff, reconstructContent } from '../diffParser';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const diffLib = require('diff');

/**
 * Generate a unified diff string in git diff format from old and new text.
 * Prepends the `diff --git` header that parse-diff expects.
 */
function createGitDiff(oldText: string, newText: string): string {
  const rawPatch: string = diffLib.createTwoFilesPatch(
    'a/test.md',
    'b/test.md',
    oldText,
    newText
  );
  // Replace the `===...` separator line with a `diff --git` header
  // so that parse-diff recognizes the format.
  const lines = rawPatch.split('\n');
  // The first line is "===" separator; replace it with git header
  lines[0] = 'diff --git a/test.md b/test.md';
  return lines.join('\n');
}

/**
 * Arbitrary that generates a line of text without newlines.
 * Uses printable ASCII characters to keep diffs readable.
 */
const lineArb = fc.stringOf(
  fc.char().filter((c) => c !== '\n' && c !== '\r'),
  { minLength: 0, maxLength: 80 }
);

/**
 * Arbitrary that generates a multi-line text string ending with a newline.
 * Ensures at least 1 line so the diff is non-trivial.
 * Always ends with '\n' to avoid "No newline at end of file" markers
 * which parse-diff treats as content lines.
 */
const textArb = fc
  .array(lineArb, { minLength: 1, maxLength: 20 })
  .map((lines) => lines.join('\n') + '\n');

/**
 * Arbitrary that generates a pair of old/new texts that are different.
 * This ensures the diff will contain at least one hunk.
 */
const diffPairArb = fc
  .tuple(textArb, textArb)
  .filter(([oldText, newText]) => oldText !== newText);

describe('Feature: markdown-diff-visualiser, Property 1: Diff parse and reconstruct round-trip', function () {
  this.timeout(60000);

  it('should reconstruct original old and new content from parsed diff hunks', function () {
    fc.assert(
      fc.property(diffPairArb, ([oldText, newText]) => {
        // Step 1: Produce a unified diff
        const gitDiff = createGitDiff(oldText, newText);

        // Step 2: Parse the diff
        const results = parseDiff(gitDiff);

        // The diff should parse into exactly one file result
        expect(results).to.have.lengthOf(1, 'Expected exactly one DiffResult from single-file diff');

        const diffResult = results[0];

        // Should have at least one hunk since old !== new
        expect(diffResult.hunks.length).to.be.greaterThan(0, 'Expected at least one hunk for differing texts');

        // Step 3: Reconstruct content using the new text and parsed hunks
        const reconstructed = reconstructContent(newText, diffResult.hunks);

        // Step 4: Verify round-trip
        expect(reconstructed.newContent).to.equal(
          newText,
          'Reconstructed new content must match original new text'
        );
        expect(reconstructed.oldContent).to.equal(
          oldText,
          'Reconstructed old content must match original old text'
        );
      }),
      {
        numRuns: 100,
        verbose: true,
      }
    );
  });
});
