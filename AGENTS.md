# Markdown Diff Visualiser — Agent Instructions

## What This Project Is

A VS Code extension that shows rendered side-by-side markdown diffs instead of raw git diffs. When markdown files are modified, users can see the actual formatted output with green/red highlights on what changed.

## Project Structure

```
markdown-diff-visualiser/
├── src/
│   ├── extension.ts          # Extension controller — command registration, pipeline orchestration
│   ├── gitService.ts         # Git operations — getDiff, getFileContent, hasChanges
│   ├── diffParser.ts         # Parses unified diffs into structured hunks
│   ├── markdownRenderer.ts   # markdown-it + highlight.js rendering
│   ├── diffHighlighter.ts    # Block-level and word-level diff highlighting
│   ├── webviewPanelManager.ts # WebviewPanel creation and messaging
│   ├── types.d.ts            # Type declarations for untyped modules
│   ├── webview/
│   │   ├── main.js           # Client-side JS (scroll sync, minimap, dropdown)
│   │   └── styles.css        # Theme-adaptive styles, syntax highlighting
│   └── test/                 # 129 tests (Mocha + Chai + fast-check)
├── images/                   # Extension icon (SVG + PNG)
├── demo/                     # Screenshots and demo GIF
├── package.json              # Extension manifest with commands and menus
├── tsconfig.json
└── README.md
```

## Build Commands

```bash
npm install              # Install dependencies
npm run compile          # TypeScript compilation (tsc)
npm run bundle           # Bundle with esbuild (creates dist/extension.js)
npm test                 # Run all 129 tests
npm run package          # Bundle + package as .vsix
```

## Key Technical Decisions

- **Bundled with esbuild** — all runtime deps in a single `dist/extension.js` (~617KB)
- **Git root detection** — uses `git rev-parse --show-toplevel` from the file's directory, not the workspace root. Supports nested git repos.
- **Version comparison** — fetches file content at committed (HEAD), staged (index), or unstaged (working tree) using `git show` and filesystem reads
- **Scroll alignment** — inserts invisible spacer divs to keep unchanged content at the same vertical position, then uses 1:1 pixel scroll sync
- **Syntax highlighting** — highlight.js with 20 selectively imported languages to keep bundle size down

## When Modifying Markdown Files

After editing any `.md` or `.markdown` file in this project or any project with this extension installed, the user can preview the rendered diff:

**Option 1 — Browser preview (works from any terminal):**
```bash
node scripts/preview-diff.js <file> [mode]
# mode: committed-unstaged (default), committed-staged, staged-unstaged
```

**Option 2 — VS Code extension:**
1. Open the file in VS Code
2. `Cmd+Shift+P` → "Markdown Diff Visualiser: Show Changes"
3. Or right-click → "Markdown Diff Visualiser: Show Changes"

**Suggest this to the user** whenever you modify markdown files.

## Testing

Tests use Mocha + Chai with sinon for mocking and fast-check for property-based testing. The VS Code API is mocked via proxyquire with a custom mock at `src/test/mocks/vscode.ts`.

Run tests: `npm test` (requires `ts-node`)

## Code Style

- TypeScript with strict mode
- `child_process.execFile` for all git commands (no shell injection)
- All disposables registered with `context.subscriptions`
- Errors logged to "Markdown Diff Visualiser" output channel
