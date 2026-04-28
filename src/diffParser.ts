/**
 * Diff Parser - Parses unified diff text into structured hunks.
 * Reconstructs full old/new file content.
 */

import parseDiffLib from 'parse-diff';

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  changes: DiffChange[];
}

export interface DiffChange {
  type: 'add' | 'del' | 'normal';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffResult {
  oldFilePath: string;
  newFilePath: string;
  hunks: DiffHunk[];
  status: 'modified' | 'added' | 'deleted' | 'renamed';
}

export interface ReconstructedContent {
  oldContent: string;
  newContent: string;
}

/**
 * Detect if a raw diff string contains binary file markers.
 */
function isBinaryDiff(rawDiff: string): boolean {
  return /Binary files .* differ/.test(rawDiff) || /GIT binary patch/.test(rawDiff);
}

/**
 * Strip the leading diff prefix character (+, -, space) from a content line.
 * The parse-diff library includes the prefix in the content field.
 */
function stripPrefix(content: string): string {
  if (content.length > 0 && (content[0] === '+' || content[0] === '-' || content[0] === ' ')) {
    return content.substring(1);
  }
  return content;
}

/**
 * Clean a file path from diff header notation.
 * Removes leading "a/" or "b/" prefixes used in git diff output.
 */
function cleanPath(path: string | undefined): string {
  if (!path) {
    return '';
  }
  if (path === '/dev/null') {
    return '';
  }
  return path.replace(/^[ab]\//, '');
}

/**
 * Determine the status of a file from the parsed diff info.
 */
function determineStatus(
  file: parseDiffLib.File,
  oldPath: string,
  newPath: string,
): 'modified' | 'added' | 'deleted' | 'renamed' {
  if (file.new) {
    return 'added';
  }
  if (file.deleted) {
    return 'deleted';
  }
  if (oldPath && newPath && oldPath !== newPath) {
    return 'renamed';
  }
  return 'modified';
}

/**
 * Convert a parse-diff Change to our DiffChange interface.
 */
function convertChange(change: parseDiffLib.Change): DiffChange {
  const result: DiffChange = {
    type: change.type,
    content: stripPrefix(change.content),
  };

  if (change.type === 'normal') {
    result.oldLineNumber = change.ln1;
    result.newLineNumber = change.ln2;
  } else if (change.type === 'add') {
    result.newLineNumber = change.ln;
  } else if (change.type === 'del') {
    result.oldLineNumber = change.ln;
  }

  return result;
}

/**
 * Parse a unified diff string into structured DiffResult objects.
 *
 * Handles edge cases:
 * - Empty input returns an empty array
 * - Binary file markers are detected and skipped
 * - Renamed files have old/new paths extracted
 * - Malformed diffs return an empty array without throwing
 *
 * @param rawDiff - The raw unified diff text
 * @returns An array of DiffResult objects
 */
export function parseDiff(rawDiff: string): DiffResult[] {
  if (!rawDiff || rawDiff.trim().length === 0) {
    return [];
  }

  // Detect binary file diffs and skip them
  if (isBinaryDiff(rawDiff)) {
    return [];
  }

  try {
    const parsed = parseDiffLib(rawDiff);

    return parsed.map((file) => {
      const oldPath = cleanPath(file.from);
      const newPath = cleanPath(file.to);

      const hunks: DiffHunk[] = file.chunks.map((chunk) => ({
        oldStart: chunk.oldStart,
        oldLines: chunk.oldLines,
        newStart: chunk.newStart,
        newLines: chunk.newLines,
        changes: chunk.changes.map(convertChange),
      }));

      return {
        oldFilePath: oldPath,
        newFilePath: newPath,
        hunks,
        status: determineStatus(file, oldPath, newPath),
      };
    });
  } catch {
    // Malformed diff: return empty array without throwing
    return [];
  }
}

/**
 * Reconstruct the full old and new file content from the current file content
 * and a set of diff hunks.
 *
 * The current content is treated as the "new" version. The old version is
 * reconstructed by reversing the changes described in the hunks.
 *
 * @param currentContent - The current (new) file content
 * @param hunks - The diff hunks describing changes
 * @returns The reconstructed old and new content
 */
export function reconstructContent(
  currentContent: string,
  hunks: DiffHunk[],
): ReconstructedContent {
  if (hunks.length === 0) {
    return { oldContent: currentContent, newContent: currentContent };
  }

  const newLines = currentContent.split('\n');
  const oldLines: string[] = [];

  // Track our position in the new content
  let newLineIndex = 0;

  // Sort hunks by their position in the new file
  const sortedHunks = [...hunks].sort((a, b) => a.newStart - b.newStart);

  for (const hunk of sortedHunks) {
    // newStart is 1-based, convert to 0-based index
    const hunkNewStart = hunk.newStart - 1;

    // Copy unchanged lines before this hunk
    while (newLineIndex < hunkNewStart && newLineIndex < newLines.length) {
      oldLines.push(newLines[newLineIndex]);
      newLineIndex++;
    }

    // Process the hunk changes to extract old lines
    for (const change of hunk.changes) {
      if (change.type === 'normal') {
        oldLines.push(change.content);
        newLineIndex++;
      } else if (change.type === 'del') {
        // Deleted lines exist in old but not in new
        oldLines.push(change.content);
      } else if (change.type === 'add') {
        // Added lines exist in new but not in old — skip in old, advance new
        newLineIndex++;
      }
    }
  }

  // Copy any remaining lines after the last hunk
  while (newLineIndex < newLines.length) {
    oldLines.push(newLines[newLineIndex]);
    newLineIndex++;
  }

  return {
    oldContent: oldLines.join('\n'),
    newContent: currentContent,
  };
}
