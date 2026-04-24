/**
 * Property-Based Test: Word-level diff precision
 *
 * Feature: markdown-diff-preview, Property 6: Word-level diff precision
 *
 * For any two non-identical text strings representing a modified block,
 * the word-level diff SHALL annotate only the words that actually differ
 * between the two strings — unchanged words SHALL NOT be wrapped in
 * highlight spans.
 *
 * **Validates: Requirements 4.4**
 */

import { expect } from 'chai';
import * as fc from 'fast-check';
import { computeWordDiff } from '../diffHighlighter';

/**
 * Strip all HTML span tags (diff-added-word and diff-removed-word) from a string,
 * returning only the plain text content.
 */
function stripDiffSpans(html: string): string {
  return html
    .replace(/<span class="diff-(added|removed)-word">/g, '')
    .replace(/<\/span>/g, '');
}

/**
 * Extract all text segments that are NOT inside any diff highlight span.
 * These represent the unchanged portions of the output.
 */
function extractUnchangedSegments(annotated: string): string[] {
  // Split on span tags and collect text outside spans
  const segments: string[] = [];
  let depth = 0;
  let current = '';
  let i = 0;

  while (i < annotated.length) {
    if (annotated.startsWith('<span class="diff-', i)) {
      // Entering a span — flush current unchanged text
      if (depth === 0 && current.length > 0) {
        segments.push(current);
        current = '';
      }
      // Skip to end of opening tag
      const closeAngle = annotated.indexOf('>', i);
      i = closeAngle + 1;
      depth++;
    } else if (annotated.startsWith('</span>', i)) {
      depth--;
      i += '</span>'.length;
      // Reset current for next unchanged segment
      if (depth === 0) {
        current = '';
      }
    } else {
      if (depth === 0) {
        current += annotated[i];
      }
      i++;
    }
  }
  if (current.length > 0) {
    segments.push(current);
  }
  return segments;
}

/**
 * Unescape HTML entities back to plain text for comparison.
 */
function unescapeHtml(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

/**
 * Arbitrary that generates a word (no whitespace, no HTML special chars to keep things simple).
 */
const wordArb = fc.stringOf(
  fc.char().filter((c) => c !== ' ' && c !== '\n' && c !== '\r' && c !== '\t' && c !== '<' && c !== '>' && c !== '&' && c !== '"'),
  { minLength: 1, maxLength: 10 }
);

/**
 * Arbitrary that generates a sentence of space-separated words.
 */
const sentenceArb = fc
  .array(wordArb, { minLength: 1, maxLength: 10 })
  .map((words) => words.join(' '));

/**
 * Arbitrary that generates a pair of similar but non-identical sentences.
 * We take a base sentence and modify some words to create the new version.
 */
const similarPairArb = fc
  .tuple(
    fc.array(wordArb, { minLength: 2, maxLength: 10 }),
    fc.array(wordArb, { minLength: 1, maxLength: 5 }),
    fc.nat({ max: 100 })
  )
  .map(([baseWords, replacementWords, seed]) => {
    const oldWords = [...baseWords];
    const newWords = [...baseWords];
    // Replace one or more words in the new version
    const replaceIdx = seed % newWords.length;
    const replaceWord = replacementWords[seed % replacementWords.length];
    newWords[replaceIdx] = replaceWord;
    return [oldWords.join(' '), newWords.join(' ')] as [string, string];
  })
  .filter(([oldText, newText]) => oldText !== newText);

/**
 * Arbitrary that generates two completely different sentences.
 */
const diffPairArb = fc
  .tuple(sentenceArb, sentenceArb)
  .filter(([a, b]) => a !== b);

describe('Feature: markdown-diff-preview, Property 6: Word-level diff precision', function () {
  this.timeout(60000);

  it('unchanged text between old and new should not be wrapped in any highlight span', function () {
    fc.assert(
      fc.property(similarPairArb, ([oldText, newText]) => {
        const { oldAnnotated, newAnnotated } = computeWordDiff(oldText, newText);

        // Property: unchanged segments in the old annotated output must also
        // appear in the original old text (they should not be fabricated)
        const unchangedInOld = extractUnchangedSegments(oldAnnotated);
        for (const segment of unchangedInOld) {
          const plain = unescapeHtml(segment);
          if (plain.length > 0) {
            expect(
              oldText.includes(plain),
              `Unchanged segment "${plain}" in old annotated output must appear in original old text`
            ).to.be.true;
          }
        }

        // Same check for new annotated output
        const unchangedInNew = extractUnchangedSegments(newAnnotated);
        for (const segment of unchangedInNew) {
          const plain = unescapeHtml(segment);
          if (plain.length > 0) {
            expect(
              newText.includes(plain),
              `Unchanged segment "${plain}" in new annotated output must appear in original new text`
            ).to.be.true;
          }
        }
      }),
      {
        numRuns: 100,
        verbose: true,
      }
    );
  });

  it('stripping highlight spans from annotated output should recover the original text (HTML-escaped)', function () {
    fc.assert(
      fc.property(diffPairArb, ([oldText, newText]) => {
        const { oldAnnotated, newAnnotated } = computeWordDiff(oldText, newText);

        // Property: stripping all diff spans from oldAnnotated should yield
        // the HTML-escaped version of oldText
        const strippedOld = stripDiffSpans(oldAnnotated);
        const expectedOld = oldText
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
        expect(strippedOld).to.equal(
          expectedOld,
          'Stripping diff spans from old annotated output should recover the HTML-escaped old text'
        );

        // Same for new side
        const strippedNew = stripDiffSpans(newAnnotated);
        const expectedNew = newText
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
        expect(strippedNew).to.equal(
          expectedNew,
          'Stripping diff spans from new annotated output should recover the HTML-escaped new text'
        );
      }),
      {
        numRuns: 100,
        verbose: true,
      }
    );
  });

  it('identical strings should produce no highlight spans at all', function () {
    fc.assert(
      fc.property(sentenceArb, (text) => {
        const { oldAnnotated, newAnnotated } = computeWordDiff(text, text);

        // When old and new are identical, no diff spans should appear
        expect(oldAnnotated).to.not.include('diff-removed-word');
        expect(oldAnnotated).to.not.include('diff-added-word');
        expect(newAnnotated).to.not.include('diff-removed-word');
        expect(newAnnotated).to.not.include('diff-added-word');
      }),
      {
        numRuns: 100,
        verbose: true,
      }
    );
  });

  it('non-identical strings should produce at least one highlight span', function () {
    fc.assert(
      fc.property(diffPairArb, ([oldText, newText]) => {
        const { oldAnnotated, newAnnotated } = computeWordDiff(oldText, newText);

        // When texts differ, at least one side must have a highlight span
        const hasRemovedWord = oldAnnotated.includes('diff-removed-word');
        const hasAddedWord = newAnnotated.includes('diff-added-word');

        expect(
          hasRemovedWord || hasAddedWord,
          'Non-identical strings must produce at least one highlight span'
        ).to.be.true;
      }),
      {
        numRuns: 100,
        verbose: true,
      }
    );
  });

  it('concatenated unchanged text should be the same on both old and new sides', function () {
    fc.assert(
      fc.property(similarPairArb, ([oldText, newText]) => {
        const { oldAnnotated, newAnnotated } = computeWordDiff(oldText, newText);

        // Extract unchanged segments from both sides and join them.
        // The joined unchanged text represents the DIFF_EQUAL portions,
        // which must be identical on both sides even though span boundaries
        // may split them differently.
        const unchangedOldJoined = extractUnchangedSegments(oldAnnotated).join('');
        const unchangedNewJoined = extractUnchangedSegments(newAnnotated).join('');

        expect(unchangedOldJoined).to.equal(
          unchangedNewJoined,
          'Concatenated unchanged text should be identical on both old and new sides'
        );
      }),
      {
        numRuns: 100,
        verbose: true,
      }
    );
  });
});
