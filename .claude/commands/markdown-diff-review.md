Preview the rendered markdown diff for a file in the browser.

Run the following command to open the diff preview server:

```bash
cd $PROJECT_ROOT && npm run compile && node scripts/preview-diff.js $ARGUMENTS
```

If no file is specified, it defaults to test.md. You can pass a file path and optionally a comparison mode:

- `committed-unstaged` (default) — Last Committed vs Unstaged
- `committed-staged` — Last Committed vs Staged  
- `staged-unstaged` — Staged vs Unstaged

Examples:
- `/markdown-diff-review README.md`
- `/markdown-diff-review docs/guide.md committed-staged`
