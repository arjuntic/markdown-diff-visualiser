---
description: >
  Visualise rendered markdown diffs after modifying .md or .markdown files.
  Use when you've edited, created, or reviewed markdown files and want to see
  what changed in rendered form rather than raw git diff. Automatically triggers
  the Markdown Diff Visualiser VS Code extension to show a side-by-side
  rendered preview with highlighted additions (green) and removals (red).
  Relevant for: markdown changes, documentation updates, README edits,
  changelog modifications, spec file changes, PR review of .md files.
---

# Markdown Diff Review

When markdown files have been modified, use this skill to help the user visualise the changes in rendered form.

## When to Use

- After editing any `.md` or `.markdown` file
- When reviewing documentation changes
- When an AI agent has modified markdown files (READMEs, changelogs, specs)
- When the user asks to "see what changed" or "preview the diff" for markdown
- During PR reviews involving markdown files

## How to Trigger

The fastest way is to run the standalone browser preview from the terminal:

```bash
# From the project root — opens the diff in your default browser
node scripts/preview-diff.js <file>

# Examples:
node scripts/preview-diff.js README.md
node scripts/preview-diff.js docs/guide.md committed-staged
```

This works from any terminal (Claude Code, Codex, regular shell) and opens a full-featured rendered diff in the browser with:
- Side-by-side rendered preview with green/red highlights
- Content-aligned scrolling
- Scrollbar minimap with clickable markers
- Syntax-highlighted code blocks
- Dark mode support (follows system preference)

Alternatively, if the user has VS Code open:
1. Open the modified `.md` file in VS Code
2. Press `Cmd+Shift+P` (or `Ctrl+Shift+P`)
3. Type "Markdown Diff Visualiser: Show Changes"
4. Or right-click the file → "Markdown Diff Visualiser: Show Changes"

## What It Shows

- **Left pane**: Previous version (from last commit) with red highlights on removed content
- **Right pane**: Current version with green highlights on added content
- **Word-level diffs**: Individual changed words are highlighted within modified blocks
- **Scrollbar minimap**: Colored markers on the right edge showing where changes are
- **Syntax highlighting**: Code blocks are syntax-highlighted for 20+ languages
- **Images and media**: External images, GIFs, and video thumbnails render inline

## Comparison Modes

The extension supports three comparison modes via a dropdown:
- **Last Committed vs Unstaged** (default) — working tree changes
- **Last Committed vs Staged** — staged changes
- **Staged vs Unstaged** — difference between staged and working tree

## After Modifying Markdown

When you've just modified a markdown file, suggest to the user:

> I've updated `{filename}`. You can preview the rendered diff by running
> "Markdown Diff Visualiser: Show Changes" from the command palette,
> or right-clicking the file in the explorer.

## Requirements

- The Markdown Diff Visualiser VS Code extension must be installed
- The file must be in a git repository
- Git must be installed and in PATH
