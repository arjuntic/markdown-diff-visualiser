#!/usr/bin/env node
/**
 * Standalone markdown diff preview — opens a browser tab showing the rendered diff
 * for a given file, using the same pipeline as the VS Code extension.
 *
 * Usage:
 *   node scripts/preview-diff.js [file] [mode]
 *
 * Arguments:
 *   file   Relative path to the markdown file (default: test.md)
 *   mode   Comparison mode: committed-unstaged, committed-staged, staged-unstaged
 *          (default: committed-unstaged)
 *
 * Examples:
 *   node scripts/preview-diff.js README.md
 *   node scripts/preview-diff.js docs/guide.md committed-staged
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');

// Try dist/ first (bundled), fall back to out/ (tsc compiled)
let pipelineRoot;
if (fs.existsSync(path.join(ROOT, 'out', 'diffParser.js'))) {
  pipelineRoot = path.join(ROOT, 'out');
} else {
  console.error('Error: Compiled output not found. Run "npm run compile" first.');
  process.exit(1);
}

const { createGitService } = require(path.join(pipelineRoot, 'gitService'));
const { parseDiff } = require(path.join(pipelineRoot, 'diffParser'));
const { highlightDiff } = require(path.join(pipelineRoot, 'diffHighlighter'));

const targetFile = path.resolve(ROOT, process.argv[2] || 'test.md');
const relativeFile = path.relative(ROOT, targetFile);
const mode = process.argv[3] || 'committed-unstaged';

/**
 * Get file content at a specific version.
 */
function getFileAtVersion(version, relPath, gitRoot) {
  const gitPath = relPath.split(path.sep).join('/');
  if (version === 'unstaged') {
    return fs.readFileSync(path.join(gitRoot, relPath), 'utf8');
  } else if (version === 'staged') {
    try {
      return execFileSync('git', ['show', `:${gitPath}`], { cwd: gitRoot }).toString();
    } catch {
      // Fall back to HEAD if nothing staged
      try {
        return execFileSync('git', ['show', `HEAD:${gitPath}`], { cwd: gitRoot }).toString();
      } catch { return ''; }
    }
  } else {
    // committed (HEAD)
    try {
      return execFileSync('git', ['show', `HEAD:${gitPath}`], { cwd: gitRoot }).toString();
    } catch { return ''; }
  }
}

async function main() {
  const fileName = path.basename(targetFile);
  const parts = mode.split('-');
  const leftVersion = parts[0];  // committed, staged
  const rightVersion = parts[1]; // unstaged, staged

  const versionNames = { committed: 'Last Committed', staged: 'Staged', unstaged: 'Unstaged' };
  const leftLabel = versionNames[leftVersion] || leftVersion;
  const rightLabel = versionNames[rightVersion] || rightVersion;

  console.log(`Comparing ${leftLabel} vs ${rightLabel} for ${fileName}...`);

  const leftContent = getFileAtVersion(leftVersion, relativeFile, ROOT);
  const rightContent = getFileAtVersion(rightVersion, relativeFile, ROOT);

  if (leftContent === rightContent) {
    console.log(`No differences between ${leftLabel} and ${rightLabel} for ${fileName}`);
    process.exit(0);
  }

  // Compute diff using the diff library
  const diffLib = require('diff');
  const rawPatch = diffLib.createTwoFilesPatch(`a/${fileName}`, `b/${fileName}`, leftContent, rightContent);
  const lines = rawPatch.split('\n');
  lines[0] = `diff --git a/${fileName} b/${fileName}`;
  const gitDiff = lines.join('\n');

  const diffResults = parseDiff(gitDiff);
  const hunks = diffResults.length > 0 ? diffResults[0].hunks : [];

  let oldHtml, newHtml;
  try {
    const result = highlightDiff(leftContent, rightContent, hunks);
    oldHtml = result.oldHtml;
    newHtml = result.newHtml;
  } catch (err) {
    console.error('Highlighting error, falling back to raw:', err.message);
    const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    oldHtml = `<pre>${esc(leftContent)}</pre>`;
    newHtml = `<pre>${esc(rightContent)}</pre>`;
  }

  const html = buildPage(fileName, leftLabel, rightLabel, oldHtml, newHtml);
  const outFile = path.join(os.tmpdir(), 'markdown-diff-visualiser.html');
  fs.writeFileSync(outFile, html, 'utf8');

  console.log(`Preview: ${outFile}`);

  // Open in default browser
  try {
    if (process.platform === 'darwin') {
      execFileSync('open', [outFile]);
    } else if (process.platform === 'win32') {
      execFileSync('cmd', ['/c', 'start', outFile]);
    } else {
      execFileSync('xdg-open', [outFile]);
    }
  } catch {
    console.log('Could not open browser automatically. Open the file manually.');
  }
}

function buildPage(fileName, leftLabel, rightLabel, oldHtml, newHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Diff: ${fileName}</title>
  <style>
${getStyles()}
  </style>
</head>
<body>
  <div class="panel-header">
    <span class="file-name">${fileName}</span>
    <span class="mode-label">${leftLabel} vs ${rightLabel}</span>
  </div>
  <div class="pane-labels">
    <div class="pane-label pane-label-old">${leftLabel}</div>
    <div class="pane-label pane-label-new">${rightLabel}</div>
  </div>
  <div class="diff-container">
    <div class="diff-pane-wrapper">
      <div class="diff-pane" id="oldPane">${oldHtml}</div>
      <div class="scrollbar-minimap" id="oldMinimap"></div>
    </div>
    <div class="diff-pane-wrapper">
      <div class="diff-pane" id="newPane">${newHtml}</div>
      <div class="scrollbar-minimap" id="newMinimap"></div>
    </div>
  </div>
  <script>
${getScript()}
  </script>
</body>
</html>`;
}

function getStyles() {
  return `
    *, *::before, *::after { box-sizing: border-box; }

    :root {
      --bg: #ffffff;
      --fg: #24292e;
      --border: #d0d7de;
      --header-bg: #f6f8fa;
      --code-bg: #f6f8fa;
      --diff-added-bg: rgba(35, 134, 54, 0.12);
      --diff-removed-bg: rgba(218, 54, 51, 0.10);
      --diff-added-word-bg: rgba(35, 134, 54, 0.35);
      --diff-removed-word-bg: rgba(218, 54, 51, 0.35);
      --diff-added-border: #2da44e;
      --diff-removed-border: #cf222e;
      --link-color: #0969da;
      --muted: #57606a;
      --minimap-added: #2da44e;
      --minimap-removed: #cf222e;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0d1117;
        --fg: #e6edf3;
        --border: #30363d;
        --header-bg: #161b22;
        --code-bg: #161b22;
        --diff-added-bg: rgba(35, 134, 54, 0.20);
        --diff-removed-bg: rgba(218, 54, 51, 0.18);
        --diff-added-word-bg: rgba(35, 134, 54, 0.45);
        --diff-removed-word-bg: rgba(218, 54, 51, 0.40);
        --diff-added-border: #3fb950;
        --diff-removed-border: #f85149;
        --link-color: #58a6ff;
        --muted: #8b949e;
        --minimap-added: #3fb950;
        --minimap-removed: #f85149;
      }
    }

    body {
      margin: 0; padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      color: var(--fg);
      background: var(--bg);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* Header */
    .panel-header {
      display: flex; align-items: center; gap: 12px;
      padding: 8px 16px;
      background: var(--header-bg);
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }
    .file-name { font-weight: 600; font-size: 14px; }
    .mode-label { color: var(--muted); font-size: 12px; }

    /* Pane labels */
    .pane-labels { display: flex; flex-shrink: 0; }
    .pane-label {
      flex: 1; padding: 5px 16px;
      font-size: 11px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.05em;
      background: var(--header-bg);
      border-bottom: 1px solid var(--border);
      text-align: center;
    }
    .pane-label + .pane-label { border-left: 1px solid var(--border); }
    .pane-label-old { color: var(--diff-removed-border); }
    .pane-label-new { color: var(--diff-added-border); }

    /* Diff container */
    .diff-container { display: flex; flex: 1; overflow: hidden; }
    .diff-pane-wrapper {
      flex: 1; position: relative; overflow: hidden;
      display: flex; flex-direction: column;
    }
    .diff-pane-wrapper + .diff-pane-wrapper { border-left: 1px solid var(--border); }
    .diff-pane {
      flex: 1; overflow-y: auto;
      padding: 16px 20px; padding-right: 36px;
      line-height: 1.6; min-height: 0;
    }

    /* Scrollbar minimap */
    .scrollbar-minimap {
      position: absolute; top: 0; right: 0;
      width: 20px; height: 100%;
      pointer-events: auto; z-index: 10;
    }
    .minimap-marker {
      position: absolute; right: 0; width: 20px;
      min-height: 4px; border-radius: 2px;
      cursor: pointer; opacity: 0.85;
      transition: opacity 0.15s;
    }
    .minimap-marker:hover { opacity: 1; }
    .minimap-marker-removed { background: var(--minimap-removed); }
    .minimap-marker-added { background: var(--minimap-added); }

    /* Alignment spacers */
    .alignment-spacer { display: block; width: 100%; pointer-events: none; }

    /* Diff highlights */
    .diff-added-block {
      background: var(--diff-added-bg);
      border-left: 3px solid var(--diff-added-border);
      padding-left: 10px; margin: 2px 0;
      border-radius: 0 4px 4px 0;
    }
    .diff-removed-block {
      background: var(--diff-removed-bg);
      border-left: 3px solid var(--diff-removed-border);
      padding-left: 10px; margin: 2px 0;
      border-radius: 0 4px 4px 0;
    }
    .diff-added-word { background: var(--diff-added-word-bg); border-radius: 2px; padding: 1px 2px; }
    .diff-removed-word { background: var(--diff-removed-word-bg); border-radius: 2px; padding: 1px 2px; }

    /* Markdown content */
    h1, h2, h3, h4, h5, h6 { margin-top: 1.2em; margin-bottom: 0.4em; font-weight: 600; }
    h1 { font-size: 1.8em; border-bottom: 1px solid var(--border); padding-bottom: 0.3em; }
    h2 { font-size: 1.4em; border-bottom: 1px solid var(--border); padding-bottom: 0.2em; }
    h3 { font-size: 1.2em; }
    p { margin: 0.6em 0; }
    code {
      background: var(--code-bg); border: 1px solid var(--border);
      border-radius: 3px; padding: 0.1em 0.4em;
      font-size: 0.9em; font-family: 'SFMono-Regular', Consolas, 'Courier New', monospace;
    }
    pre.hljs {
      background: var(--code-bg) !important; border: 1px solid var(--border);
      border-radius: 6px; padding: 12px 16px;
      overflow-x: auto; line-height: 1.45;
    }
    pre.hljs code { background: none; border: none; padding: 0; font-size: 0.88em; }
    blockquote { border-left: 4px solid var(--border); margin: 0; padding-left: 16px; color: var(--muted); }
    table { border-collapse: collapse; width: 100%; margin: 0.8em 0; }
    th, td { border: 1px solid var(--border); padding: 6px 12px; text-align: left; }
    th { background: var(--header-bg); font-weight: 600; }
    img { max-width: 100%; height: auto; }
    a { color: var(--link-color); text-decoration: none; }
    a:hover { text-decoration: underline; }
    ul, ol { padding-left: 2em; margin: 0.4em 0; }
    li { margin: 0.2em 0; }
    hr { border: none; border-top: 1px solid var(--border); margin: 1.2em 0; }

    /* Syntax highlighting — light */
    .hljs-keyword, .hljs-selector-tag, .hljs-built_in, .hljs-name { color: #cf222e; }
    .hljs-string, .hljs-attr, .hljs-template-variable { color: #0a3069; }
    .hljs-comment, .hljs-quote { color: #6e7781; font-style: italic; }
    .hljs-number, .hljs-literal { color: #0550ae; }
    .hljs-title, .hljs-section { color: #8250df; }
    .hljs-type, .hljs-class .hljs-title { color: #953800; }
    .hljs-variable, .hljs-params { color: #24292e; }
    .hljs-tag { color: #116329; }
    .hljs-addition { color: #116329; background: rgba(35,134,54,0.15); }
    .hljs-deletion { color: #82071e; background: rgba(218,54,51,0.15); }

    /* Syntax highlighting — dark */
    @media (prefers-color-scheme: dark) {
      .hljs-keyword, .hljs-selector-tag, .hljs-built_in, .hljs-name { color: #ff7b72; }
      .hljs-string, .hljs-attr, .hljs-template-variable { color: #a5d6ff; }
      .hljs-comment, .hljs-quote { color: #8b949e; }
      .hljs-number, .hljs-literal { color: #79c0ff; }
      .hljs-title, .hljs-section { color: #d2a8ff; }
      .hljs-type, .hljs-class .hljs-title { color: #ffa657; }
      .hljs-variable, .hljs-params { color: #e6edf3; }
      .hljs-tag { color: #7ee787; }
      .hljs-addition { color: #aff5b4; background: rgba(35,134,54,0.25); }
      .hljs-deletion { color: #ffdcd7; background: rgba(218,54,51,0.25); }
    }

    /* Scrollbar styling */
    .diff-pane::-webkit-scrollbar { width: 10px; }
    .diff-pane::-webkit-scrollbar-track { background: transparent; }
    .diff-pane::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.3); border-radius: 5px; }
    .diff-pane::-webkit-scrollbar-thumb:hover { background: rgba(128,128,128,0.5); }

    /* Task list */
    .task-list-item { list-style-type: none; margin-left: -1.5em; }
    .task-list-item input[type="checkbox"] { margin-right: 0.5em; }
  `;
}

function getScript() {
  return `
    var oldPane = document.getElementById('oldPane');
    var newPane = document.getElementById('newPane');
    var oldMinimap = document.getElementById('oldMinimap');
    var newMinimap = document.getElementById('newMinimap');

    // --- Content-aligned scrolling ---
    function alignPanes() {
      oldPane.querySelectorAll('.alignment-spacer').forEach(function(s) { s.remove(); });
      newPane.querySelectorAll('.alignment-spacer').forEach(function(s) { s.remove(); });

      var oldChildren = Array.from(oldPane.children);
      var newChildren = Array.from(newPane.children);

      function classify(children) {
        return children.map(function(el) {
          var isDiff = el.classList.contains('diff-added-block') || el.classList.contains('diff-removed-block');
          var text = isDiff ? null : el.textContent.trim().substring(0, 80);
          return { el: el, isDiff: isDiff, text: text };
        });
      }

      var oldItems = classify(oldChildren);
      var newItems = classify(newChildren);
      var oi = 0, ni = 0;

      while (oi < oldItems.length && ni < newItems.length) {
        var oldItem = oldItems[oi];
        var newItem = newItems[ni];

        if (!oldItem.isDiff && !newItem.isDiff && oldItem.text && oldItem.text === newItem.text) {
          var diff = oldItem.el.offsetTop - newItem.el.offsetTop;
          if (Math.abs(diff) > 2) {
            var spacer = document.createElement('div');
            spacer.className = 'alignment-spacer';
            if (diff > 0) {
              spacer.style.height = diff + 'px';
              newItem.el.parentNode.insertBefore(spacer, newItem.el);
              newItems.splice(ni, 0, { el: spacer, isDiff: true, text: null });
              ni++;
            } else {
              spacer.style.height = (-diff) + 'px';
              oldItem.el.parentNode.insertBefore(spacer, oldItem.el);
              oldItems.splice(oi, 0, { el: spacer, isDiff: true, text: null });
              oi++;
            }
          }
          oi++; ni++;
        } else if (oldItem.isDiff) { oi++; }
        else if (newItem.isDiff) { ni++; }
        else { oi++; ni++; }
      }

      // Equalize total heights
      var oldH = oldPane.scrollHeight, newH = newPane.scrollHeight;
      if (oldH > newH) {
        var pad = document.createElement('div');
        pad.className = 'alignment-spacer';
        pad.style.height = (oldH - newH) + 'px';
        newPane.appendChild(pad);
      } else if (newH > oldH) {
        var pad = document.createElement('div');
        pad.className = 'alignment-spacer';
        pad.style.height = (newH - oldH) + 'px';
        oldPane.appendChild(pad);
      }
    }

    // --- 1:1 pixel scroll sync ---
    var isSyncing = false;
    function syncScroll(src, dst) {
      if (isSyncing) return;
      isSyncing = true;
      dst.scrollTop = src.scrollTop;
      requestAnimationFrame(function() { isSyncing = false; });
    }
    oldPane.addEventListener('scroll', function() { syncScroll(oldPane, newPane); });
    newPane.addEventListener('scroll', function() { syncScroll(newPane, oldPane); });

    // --- Scrollbar minimap ---
    function buildMinimap(pane, minimap, diffClass, type) {
      minimap.innerHTML = '';
      var blocks = pane.querySelectorAll('.' + diffClass);
      if (blocks.length === 0) return;
      var totalHeight = pane.scrollHeight;
      if (totalHeight <= 0) return;

      for (var i = 0; i < blocks.length; i++) {
        var block = blocks[i];
        var topPct = (block.offsetTop / totalHeight) * 100;
        var heightPct = Math.max((block.offsetHeight / totalHeight) * 100, 0.8);
        var marker = document.createElement('div');
        marker.className = 'minimap-marker minimap-marker-' + type;
        marker.style.top = topPct + '%';
        marker.style.height = heightPct + '%';
        (function(targetTop) {
          marker.addEventListener('click', function() {
            pane.scrollTop = targetTop - pane.clientHeight / 2;
          });
        })(block.offsetTop);
        minimap.appendChild(marker);
      }
    }

    // --- Wait for images then align ---
    function waitForImages(cb) {
      var imgs = document.querySelectorAll('.diff-pane img');
      var pending = 0, done = false;
      function check() {
        if (done) return;
        pending--;
        if (pending <= 0) { done = true; cb(); }
      }
      imgs.forEach(function(img) {
        if (!img.complete) { pending++; img.onload = check; img.onerror = check; }
      });
      if (pending === 0) { requestAnimationFrame(function() { requestAnimationFrame(cb); }); }
      setTimeout(function() { if (!done) { done = true; cb(); } }, 3000);
    }

    waitForImages(function() {
      alignPanes();
      buildMinimap(oldPane, oldMinimap, 'diff-removed-block', 'removed');
      buildMinimap(newPane, newMinimap, 'diff-added-block', 'added');
    });
  `;
}

main().catch(err => { console.error(err); process.exit(1); });
