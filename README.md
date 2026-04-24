# Markdown Diff Visualiser

**See what actually changed in your markdown files — rendered, not raw.**

Stop squinting at `+`/`-` lines in git diffs. This VS Code extension shows you a beautiful side-by-side rendered preview of markdown changes, with green/red highlights on exactly what was added or removed.

![Markdown Diff Visualiser](https://img.shields.io/badge/vscode-extension-blue) ![License](https://img.shields.io/badge/license-MIT-green) ![Version](https://img.shields.io/badge/version-0.0.1-orange)

## The Problem

You're reviewing a PR. Someone changed `README.md`. VS Code shows you this:

```diff
- The system handles **50,000 events** per second with a p99 latency under 200ms.
+ The system handles **100,000 events** per second with a p99 latency under 150ms. We exceeded our Q1 target by 2x.
```

Cool, but... what does the rendered output actually look like? Did the table break? Is the image still there? Did the formatting survive?

## The Solution

With Markdown Diff Visualiser, you see the **rendered** before and after, side by side:

![Side-by-side rendered diff preview](demo/Screenshot%201.png)

Changed sections are highlighted in red (removed) and green (added), with word-level precision.

![Word-level highlighting and images rendering](demo/Screenshot%202.png)

## Demo

See the extension in action:

![Demo](demo/demo%20gif.gif)

> *Full video walkthrough available at [demo/Demo.mov](demo/Demo.mov)*

## Features

- **Side-by-side rendered preview** — see the actual formatted output, not raw markup
- **Block-level highlighting** — changed paragraphs, headings, list items, and table rows are highlighted
- **Word-level diffs** — within a changed block, individual words that differ are highlighted
- **Scrollbar minimap** — colored markers on the right edge show where changes are (click to jump)
- **Aligned scrolling** — unchanged content stays at the same vertical position on both sides
- **Three comparison modes** — Last Committed vs Unstaged, Last Committed vs Staged, Staged vs Unstaged
- **Full GFM support** — tables, task lists, strikethrough, fenced code blocks, footnotes
- **Images and videos** — external images, GIFs, YouTube thumbnails all render in the preview
- **Theme-aware** — respects your VS Code light/dark/high-contrast theme
- **Right-click support** — works from the editor, explorer sidebar, and command palette

## Installation

### From VSIX (local)

1. Download or build the `.vsix` file
2. In VS Code: `Cmd+Shift+P` → "Extensions: Install from VSIX..."
3. Select the `.vsix` file
4. Reload the window

### From Source

```bash
git clone https://github.com/your-username/markdown-diff-visualiser.git
cd markdown-diff-visualiser
npm install
npm run bundle
npx @vscode/vsce package --allow-missing-repository
# Then install the generated .vsix
```

## Tutorial: Your First Markdown Diff

Let's walk through a fun example. Imagine you're writing the docs for a pizza ordering API.

### Step 1: Create a markdown file

Create `pizza-api.md` in a git repo:

```markdown
# Pizza API

Welcome to the Pizza API docs. Order pizza programmatically!

## Endpoints

### POST /api/order

Place a new pizza order.

| Parameter | Type   | Required | Description          |
|-----------|--------|----------|----------------------|
| size      | string | Yes      | small, medium, large |
| toppings  | array  | No       | List of toppings     |
| crust     | string | No       | thin, regular, thick |

## Pricing

- Small: $8
- Medium: $12
- Large: $16

> **Note:** Delivery is free for orders over $20.
```

### Step 2: Commit it

```bash
git add pizza-api.md
git commit -m "Add pizza API docs"
```

### Step 3: Make some changes

Now edit `pizza-api.md` — the AI agent rewrote your docs:

```markdown
# Pizza API v2

Welcome to the Pizza API docs. Order pizza programmatically!
Now with **real-time order tracking** and **loyalty points**.

## Endpoints

### POST /api/order

Place a new pizza order.

| Parameter | Type   | Required | Description              |
|-----------|--------|----------|--------------------------|
| size      | string | Yes      | small, medium, large, xl |
| toppings  | array  | No       | List of toppings         |
| crust     | string | No       | thin, regular, thick     |
| delivery  | boolean| No       | Enable delivery (new!)   |

### GET /api/order/:id/track

Track your order in real-time. Returns current status.

## Pricing

- Small: $8
- Medium: $12
- Large: $16
- **XL: $22** *(new!)*

> **Note:** Delivery is free for orders over $15 (was $20).

## Loyalty Program

Earn 1 point per dollar spent. Redeem 100 points for a free pizza!
```

### Step 4: See the diff preview

1. Open `pizza-api.md` in VS Code
2. `Cmd+Shift+P` → "Markdown Diff Visualiser: Show Changes"
3. Or right-click the file → "Markdown Diff Visualiser: Show Changes"

Here's what it looks like with real content — tables, code blocks, and images all rendered:

![Diff preview with code blocks and syntax highlighting](demo/Screenshot%203.png)

You'll see:

- **Left pane**: The old version with red highlights on removed content
- **Right pane**: The new version with green highlights on added content
- **Title changed**: "Pizza API" → "Pizza API v2" (word-level highlight on "v2")
- **New table row**: "delivery" parameter highlighted in green
- **New endpoint**: The tracking endpoint section is fully green
- **Price change**: "XL: $22" added in green, "$20" → "$15" highlighted at word level
- **New section**: "Loyalty Program" entirely green

### Step 5: Try different comparison modes

Use the dropdown at the top to switch between:

![Comparison mode dropdown](demo/Screenshot%204.png)

- **Last Committed vs Unstaged** — what you changed but haven't staged yet
- **Last Committed vs Staged** — what you've `git add`ed
- **Staged vs Unstaged** — differences between your staged and working tree versions

### Step 6: Use the minimap

See those colored bars on the right edge of each pane? Those are the minimap markers:

- **Red bars** (left pane) — where content was removed
- **Green bars** (right pane) — where content was added
- **Click any bar** to jump directly to that change

## Usage

### Command Palette

`Cmd+Shift+P` (or `Ctrl+Shift+P`) → "Markdown Diff Visualiser: Show Changes"

### Right-Click Menu

- **In the editor**: Right-click inside any `.md` file
- **In the explorer**: Right-click any `.md` file in the sidebar (works even if the file isn't open)

### Editor Title Bar

When a `.md` file is active, the extension icon appears in the editor title bar.

## Supported Markdown Elements

Everything GitHub Flavored Markdown supports:

- Headings (h1-h6)
- Paragraphs with **bold**, *italic*, ~~strikethrough~~
- Ordered and unordered lists
- Task lists (`- [x] done`, `- [ ] todo`)
- Tables with alignment
- Fenced code blocks with syntax highlighting
- Blockquotes
- Images (external URLs, relative paths)
- Links (inline, reference-style, autolinks)
- Horizontal rules
- Footnotes
- HTML blocks (divs, videos, custom styling)

## How It Works

```
Your .md file → git diff → parse hunks → render markdown → highlight changes → webview panel
```

1. Fetches the file content at two versions (e.g., HEAD and working tree)
2. Computes a unified diff between them
3. Renders both versions as HTML using `markdown-it` (same engine VS Code uses)
4. Highlights changed blocks with CSS classes and computes word-level diffs with `diff-match-patch`
5. Displays in a side-by-side webview with aligned scrolling

## Configuration

No configuration needed. It just works.

## Requirements

- VS Code 1.85.0 or later
- Git installed and in your PATH
- A git repository (the file must be tracked by git)

## Known Limitations

- Very large files (50,000+ lines) may be slow to render — the extension will offer to show only changed sections
- Relative image paths in markdown are resolved against the workspace root, not the file's directory
- The extension compares file content, not rendered output — so CSS-only changes won't show up

## Contributing

Contributions welcome! This is a hobby project.

```bash
# Clone and set up
git clone https://github.com/your-username/markdown-diff-visualiser.git
cd markdown-diff-visualiser
npm install

# Run tests
npm test

# Build
npm run bundle

# Package
npx @vscode/vsce package --allow-missing-repository
```

## License

MIT — do whatever you want with it.

---

Made with caffeine and curiosity.
