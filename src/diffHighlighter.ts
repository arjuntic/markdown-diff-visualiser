/**
 * Diff Highlighter - Compares old/new markdown, computes block-level and word-level diffs,
 * and produces annotated HTML.
 */

import { DiffHunk } from './diffParser';
import { createRenderer } from './markdownRenderer';
import DiffMatchPatch from 'diff-match-patch';

export interface HighlightedDiff {
  oldHtml: string;
  newHtml: string;
}

export interface BlockDiff {
  type: 'added' | 'removed' | 'modified' | 'unchanged';
  oldLines: string[];
  newLines: string[];
}

/**
 * Escape HTML special characters to prevent injection when wrapping text in spans.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Compute block-level diffs from old/new lines and diff hunks.
 *
 * Walks through the hunks and classifies contiguous groups of lines as:
 * - 'unchanged': lines not touched by any hunk
 * - 'added': lines that only appear in the new version
 * - 'removed': lines that only appear in the old version
 * - 'modified': lines where old content was replaced by new content (del followed by add)
 */
export function computeBlockDiffs(
  oldLines: string[],
  newLines: string[],
  hunks: DiffHunk[],
): BlockDiff[] {
  if (hunks.length === 0) {
    // No changes — everything is unchanged
    const allLines = oldLines.length > 0 ? oldLines : newLines;
    if (allLines.length === 0) {
      return [];
    }
    return [
      {
        type: 'unchanged',
        oldLines: [...oldLines],
        newLines: [...newLines],
      },
    ];
  }

  const blocks: BlockDiff[] = [];
  let oldIdx = 0;
  let newIdx = 0;

  // Sort hunks by position
  const sortedHunks = [...hunks].sort((a, b) => a.oldStart - b.oldStart);

  for (const hunk of sortedHunks) {
    const hunkOldStart = hunk.oldStart - 1; // convert to 0-based
    const hunkNewStart = hunk.newStart - 1;

    // Add unchanged lines before this hunk
    if (oldIdx < hunkOldStart || newIdx < hunkNewStart) {
      const unchangedOld: string[] = [];
      const unchangedNew: string[] = [];
      while (oldIdx < hunkOldStart && oldIdx < oldLines.length) {
        unchangedOld.push(oldLines[oldIdx]);
        oldIdx++;
      }
      while (newIdx < hunkNewStart && newIdx < newLines.length) {
        unchangedNew.push(newLines[newIdx]);
        newIdx++;
      }
      if (unchangedOld.length > 0 || unchangedNew.length > 0) {
        blocks.push({
          type: 'unchanged',
          oldLines: unchangedOld,
          newLines: unchangedNew,
        });
      }
    }

    // Process changes within the hunk
    // Group consecutive del/add/normal changes
    const changes = hunk.changes;
    let i = 0;
    while (i < changes.length) {
      const change = changes[i];

      if (change.type === 'normal') {
        // Collect consecutive normal lines
        const normalOld: string[] = [];
        const normalNew: string[] = [];
        while (i < changes.length && changes[i].type === 'normal') {
          normalOld.push(changes[i].content);
          normalNew.push(changes[i].content);
          oldIdx++;
          newIdx++;
          i++;
        }
        blocks.push({
          type: 'unchanged',
          oldLines: normalOld,
          newLines: normalNew,
        });
      } else if (change.type === 'del') {
        // Collect consecutive del lines, then check for following add lines (modified)
        const delLines: string[] = [];
        while (i < changes.length && changes[i].type === 'del') {
          delLines.push(changes[i].content);
          oldIdx++;
          i++;
        }
        // Check if followed by add lines — that makes it a 'modified' block
        const addLines: string[] = [];
        while (i < changes.length && changes[i].type === 'add') {
          addLines.push(changes[i].content);
          newIdx++;
          i++;
        }
        if (addLines.length > 0) {
          blocks.push({
            type: 'modified',
            oldLines: delLines,
            newLines: addLines,
          });
        } else {
          blocks.push({
            type: 'removed',
            oldLines: delLines,
            newLines: [],
          });
        }
      } else if (change.type === 'add') {
        // Pure add lines (not preceded by del)
        const addLines: string[] = [];
        while (i < changes.length && changes[i].type === 'add') {
          addLines.push(changes[i].content);
          newIdx++;
          i++;
        }
        blocks.push({
          type: 'added',
          oldLines: [],
          newLines: addLines,
        });
      } else {
        i++;
      }
    }
  }

  // Add any remaining unchanged lines after the last hunk
  const remainingOld: string[] = [];
  const remainingNew: string[] = [];
  while (oldIdx < oldLines.length) {
    remainingOld.push(oldLines[oldIdx]);
    oldIdx++;
  }
  while (newIdx < newLines.length) {
    remainingNew.push(newLines[newIdx]);
    newIdx++;
  }
  if (remainingOld.length > 0 || remainingNew.length > 0) {
    blocks.push({
      type: 'unchanged',
      oldLines: remainingOld,
      newLines: remainingNew,
    });
  }

  return blocks;
}

/**
 * Compute word-level diffs between two text strings using diff-match-patch.
 *
 * Returns annotated versions of both texts where changed words are wrapped
 * in `<span class="diff-removed-word">` and `<span class="diff-added-word">` tags.
 * Unchanged text is HTML-escaped but not wrapped.
 */
export function computeWordDiff(
  oldText: string,
  newText: string,
): { oldAnnotated: string; newAnnotated: string } {
  if (oldText === newText) {
    return {
      oldAnnotated: escapeHtml(oldText),
      newAnnotated: escapeHtml(newText),
    };
  }

  const dmp = new DiffMatchPatch();
  const diffs = dmp.diff_main(oldText, newText);
  dmp.diff_cleanupSemantic(diffs);

  let oldAnnotated = '';
  let newAnnotated = '';

  for (const [op, text] of diffs) {
    const escaped = escapeHtml(text);
    if (op === DiffMatchPatch.DIFF_EQUAL) {
      oldAnnotated += escaped;
      newAnnotated += escaped;
    } else if (op === DiffMatchPatch.DIFF_DELETE) {
      oldAnnotated += `<span class="diff-removed-word">${escaped}</span>`;
    } else if (op === DiffMatchPatch.DIFF_INSERT) {
      newAnnotated += `<span class="diff-added-word">${escaped}</span>`;
    }
  }

  return { oldAnnotated, newAnnotated };
}

/**
 * Wrap an HTML string in a div with the given CSS class.
 */
function wrapBlock(html: string, className: string): string {
  return `<div class="${className}">${html}</div>`;
}

/**
 * Highlight differences between old and new markdown content.
 *
 * Renders both markdown versions to HTML, computes block-level diffs from the hunks,
 * then annotates changed blocks with CSS classes and applies word-level highlighting
 * within modified blocks.
 *
 * Edge cases:
 * - Fully added file (empty old, non-empty new): all new content gets diff-added-block
 * - Fully deleted file (non-empty old, empty new): all old content gets diff-removed-block
 * - No changes (empty hunks): no highlight classes applied
 */
export function highlightDiff(
  oldMarkdown: string,
  newMarkdown: string,
  hunks: DiffHunk[],
): HighlightedDiff {
  const renderer = createRenderer();

  // Edge case: no changes
  if (hunks.length === 0) {
    return {
      oldHtml: renderer.render(oldMarkdown),
      newHtml: renderer.render(newMarkdown),
    };
  }

  const oldLines = oldMarkdown.length > 0 ? oldMarkdown.split('\n') : [];
  const newLines = newMarkdown.length > 0 ? newMarkdown.split('\n') : [];

  // Edge case: fully added file (old is empty)
  if (oldLines.length === 0 && newLines.length > 0) {
    const newHtml = renderer.render(newMarkdown);
    return {
      oldHtml: '',
      newHtml: wrapBlock(newHtml, 'diff-added-block'),
    };
  }

  // Edge case: fully deleted file (new is empty)
  if (oldLines.length > 0 && newLines.length === 0) {
    const oldHtml = renderer.render(oldMarkdown);
    return {
      oldHtml: wrapBlock(oldHtml, 'diff-removed-block'),
      newHtml: '',
    };
  }

  // Compute block-level diffs
  const blocks = computeBlockDiffs(oldLines, newLines, hunks);

  const oldHtmlParts: string[] = [];
  const newHtmlParts: string[] = [];

  for (const block of blocks) {
    const oldBlockMd = block.oldLines.join('\n');
    const newBlockMd = block.newLines.join('\n');

    switch (block.type) {
      case 'unchanged': {
        const oldRendered = renderer.render(oldBlockMd);
        const newRendered = renderer.render(newBlockMd);
        oldHtmlParts.push(oldRendered);
        newHtmlParts.push(newRendered);
        break;
      }
      case 'added': {
        const newRendered = renderer.render(newBlockMd);
        newHtmlParts.push(wrapBlock(newRendered, 'diff-added-block'));
        break;
      }
      case 'removed': {
        const oldRendered = renderer.render(oldBlockMd);
        oldHtmlParts.push(wrapBlock(oldRendered, 'diff-removed-block'));
        break;
      }
      case 'modified': {
        // For modified blocks, apply word-level diffs
        // Render the markdown first, then apply word-level annotations
        // Since word diff operates on raw text, we render the markdown and also
        // provide word-level annotated versions
        const oldRendered = renderer.render(oldBlockMd);
        const newRendered = renderer.render(newBlockMd);

        // Apply word-level diff to the rendered HTML by replacing the rendered
        // content with annotated versions within the block wrapper
        // For modified blocks, we wrap the rendered HTML with the block class
        // and include word-level annotations as a secondary layer
        oldHtmlParts.push(
          wrapBlock(
            applyWordDiffToHtml(oldRendered, oldBlockMd, newBlockMd, 'old'),
            'diff-removed-block',
          ),
        );
        newHtmlParts.push(
          wrapBlock(
            applyWordDiffToHtml(newRendered, oldBlockMd, newBlockMd, 'new'),
            'diff-added-block',
          ),
        );
        break;
      }
    }
  }

  return {
    oldHtml: oldHtmlParts.join(''),
    newHtml: newHtmlParts.join(''),
  };
}

/**
 * Apply word-level diff annotations to rendered HTML.
 *
 * This takes the rendered HTML and the raw markdown texts, computes word-level
 * diffs on the raw text, then attempts to apply those annotations to the HTML.
 *
 * For simplicity and reliability, we use a strategy of computing the word diff
 * on the plain text content and then injecting the word-level spans into the
 * rendered HTML by replacing text nodes.
 */
function applyWordDiffToHtml(
  renderedHtml: string,
  oldText: string,
  newText: string,
  side: 'old' | 'new',
): string {
  const dmp = new DiffMatchPatch();
  const diffs = dmp.diff_main(oldText, newText);
  dmp.diff_cleanupSemantic(diffs);

  // Build annotated plain text
  let annotatedText = '';
  for (const [op, text] of diffs) {
    const escaped = escapeHtml(text);
    if (op === DiffMatchPatch.DIFF_EQUAL) {
      annotatedText += escaped;
    } else if (op === DiffMatchPatch.DIFF_DELETE && side === 'old') {
      annotatedText += `<span class="diff-removed-word">${escaped}</span>`;
    } else if (op === DiffMatchPatch.DIFF_INSERT && side === 'new') {
      annotatedText += `<span class="diff-added-word">${escaped}</span>`;
    }
    // Skip DIFF_INSERT for old side and DIFF_DELETE for new side
  }

  // Replace text content in the HTML with annotated text
  return replaceTextInHtml(renderedHtml, annotatedText);
}

/**
 * Strip HTML tags from a string, returning only the text content.
 */
function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

/**
 * Replace text nodes in HTML with annotated text.
 *
 * This walks through the HTML, preserving tags, and replaces the text content
 * with the corresponding portions of the annotated text.
 */
function replaceTextInHtml(html: string, annotatedText: string): string {
  // Tokenize the HTML into tags and text segments
  const tokens = tokenizeHtml(html);
  let annotatedIdx = 0;
  let result = '';

  // Build a plain-text version of annotatedText (without the span tags) for matching
  const annotatedPlain = stripHtmlTags(annotatedText);

  for (const token of tokens) {
    if (token.type === 'tag') {
      result += token.value;
    } else {
      // Text node — find the corresponding annotated portion
      const textLen = token.value.length;
      const plainSegment = annotatedPlain.substring(annotatedIdx, annotatedIdx + textLen);

      if (plainSegment === token.value) {
        // Find the annotated version of this segment
        result += extractAnnotatedSegment(annotatedText, annotatedIdx, textLen);
      } else {
        // Fallback: use original text
        result += token.value;
      }
      annotatedIdx += textLen;
    }
  }

  return result;
}

/**
 * Extract a segment from annotated text that corresponds to a given range
 * of plain text characters.
 */
function extractAnnotatedSegment(annotatedText: string, startIdx: number, length: number): string {
  let plainCount = 0;
  let i = 0;

  // Find the start position in annotated text
  while (i < annotatedText.length && plainCount < startIdx) {
    if (annotatedText[i] === '<') {
      // Skip tag
      while (i < annotatedText.length && annotatedText[i] !== '>') {
        i++;
      }
      i++; // skip '>'
    } else {
      plainCount++;
      i++;
    }
  }
  const startPos = i;

  // Find the end position
  let consumed = 0;
  while (i < annotatedText.length && consumed < length) {
    if (annotatedText[i] === '<') {
      while (i < annotatedText.length && annotatedText[i] !== '>') {
        i++;
      }
      i++; // skip '>'
    } else {
      consumed++;
      i++;
    }
  }

  return annotatedText.substring(startPos, i);
}

interface HtmlToken {
  type: 'tag' | 'text';
  value: string;
}

/**
 * Tokenize HTML into a sequence of tag and text tokens.
 */
function tokenizeHtml(html: string): HtmlToken[] {
  const tokens: HtmlToken[] = [];
  let i = 0;

  while (i < html.length) {
    if (html[i] === '<') {
      // Find end of tag
      let j = i + 1;
      while (j < html.length && html[j] !== '>') {
        j++;
      }
      j++; // include '>'
      tokens.push({ type: 'tag', value: html.substring(i, j) });
      i = j;
    } else {
      // Text node
      let j = i;
      while (j < html.length && html[j] !== '<') {
        j++;
      }
      tokens.push({ type: 'text', value: html.substring(i, j) });
      i = j;
    }
  }

  return tokens;
}
