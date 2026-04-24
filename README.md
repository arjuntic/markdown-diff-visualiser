# Markdown Diff Preview

A VS Code extension that provides a rendered side-by-side preview of markdown file diffs. Instead of reading raw git diffs with `+`/`-` markers, see the old and new versions of a markdown file rendered as HTML with visual highlights on the changed sections.

## Features

- Side-by-side rendered preview of markdown diffs
- Block-level and word-level change highlighting
- Support for unstaged, staged, and commit-based diffs
- GitHub Flavored Markdown support (tables, task lists, strikethrough, fenced code blocks)
- Theme-aware styling (light, dark, high contrast)
- Synchronized scrolling between old and new panes
- Context menu integration for editor and SCM views

## Usage

1. Open a markdown file that has git changes
2. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
3. Run **Markdown Diff Preview: Show Changes**

Or right-click a markdown file in the editor or SCM panel and select **Show Markdown Diff Preview**.

## Requirements

- VS Code 1.85.0 or later
- Git installed and available in PATH

## Development

```bash
npm install
npm run compile
npm test
```
