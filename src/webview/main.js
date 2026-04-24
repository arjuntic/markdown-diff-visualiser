// Webview client-side JavaScript
// Handles incoming messages, scroll sync, and rendering

(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  // DOM element references
  const oldPane = document.getElementById('oldPane');
  const newPane = document.getElementById('newPane');
  const fileNameEl = document.getElementById('fileName');
  const fileStatusEl = document.getElementById('fileStatus');

  // Track current diff mode
  let currentMode = 'unstaged';

  // --- Diff mode toolbar ---
  function createToolbar() {
    const toolbar = document.createElement('div');
    toolbar.className = 'diff-mode-toolbar';

    const modes = [
      { value: 'unstaged', label: 'Unstaged' },
      { value: 'staged', label: 'Staged' },
      { value: 'commit', label: 'Commit' },
    ];

    modes.forEach(function (mode) {
      const btn = document.createElement('button');
      btn.className = 'diff-mode-btn' + (mode.value === currentMode ? ' active' : '');
      btn.textContent = mode.label;
      btn.dataset.mode = mode.value;
      btn.setAttribute('aria-pressed', mode.value === currentMode ? 'true' : 'false');
      btn.addEventListener('click', function () {
        switchMode(mode.value);
      });
      toolbar.appendChild(btn);
    });

    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'diff-mode-btn refresh-btn';
    refreshBtn.textContent = '↻ Refresh';
    refreshBtn.setAttribute('aria-label', 'Refresh diff');
    refreshBtn.addEventListener('click', function () {
      vscode.postMessage({ type: 'refresh' });
    });
    toolbar.appendChild(refreshBtn);

    // Insert toolbar after the panel header
    const header = document.querySelector('.panel-header');
    if (header && header.parentNode) {
      header.parentNode.insertBefore(toolbar, header.nextSibling);
    }
  }

  function switchMode(mode) {
    if (mode === 'commit') {
      // Ask the extension host to prompt for a commit SHA
      vscode.postMessage({ type: 'requestCommitSha' });
      return;
    }
    currentMode = mode;
    // Update active button state
    var buttons = document.querySelectorAll('.diff-mode-btn:not(.refresh-btn)');
    buttons.forEach(function (btn) {
      var isActive = btn.dataset.mode === mode;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
    // Send switchMode message to extension host
    vscode.postMessage({ type: 'switchMode', payload: { mode: mode } });
  }

  // --- Synchronized scrolling ---
  let isSyncing = false;

  function syncScroll(source, target) {
    if (isSyncing) {
      return;
    }
    isSyncing = true;

    // Calculate scroll proportion
    var maxScrollTop = source.scrollHeight - source.clientHeight;
    if (maxScrollTop > 0) {
      var proportion = source.scrollTop / maxScrollTop;
      var targetMaxScrollTop = target.scrollHeight - target.clientHeight;
      target.scrollTop = proportion * targetMaxScrollTop;
    }

    // Use requestAnimationFrame to avoid scroll event loops
    requestAnimationFrame(function () {
      isSyncing = false;
    });
  }

  if (oldPane && newPane) {
    oldPane.addEventListener('scroll', function () {
      syncScroll(oldPane, newPane);
    });
    newPane.addEventListener('scroll', function () {
      syncScroll(newPane, oldPane);
    });
  }

  // --- Handle messages from the extension ---
  window.addEventListener('message', function (event) {
    var message = event.data;
    switch (message.type) {
      case 'update':
        handleUpdate(message.payload);
        break;
      case 'appendContent':
        handleAppendContent(message.payload);
        break;
      case 'themeChanged':
        handleThemeChanged(message.payload);
        break;
    }
  });

  function handleUpdate(payload) {
    if (!payload) {
      return;
    }

    // Update header
    if (fileNameEl) {
      fileNameEl.textContent = payload.fileName || '';
    }
    if (fileStatusEl) {
      fileStatusEl.textContent = formatStatus(payload.fileStatus);
      fileStatusEl.className = 'file-status status-' + (payload.fileStatus || 'modified');
    }

    // Update diff mode if provided
    if (payload.diffMode) {
      currentMode = payload.diffMode;
      var buttons = document.querySelectorAll('.diff-mode-btn:not(.refresh-btn)');
      buttons.forEach(function (btn) {
        var isActive = btn.dataset.mode === currentMode;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
    }

    // Render pane content
    if (oldPane) {
      if (payload.oldHtml) {
        oldPane.innerHTML = payload.oldHtml;
        oldPane.classList.remove('empty-pane');
      } else {
        oldPane.innerHTML = '<div class="empty-pane-message">No previous version</div>';
        oldPane.classList.add('empty-pane');
      }
    }

    if (newPane) {
      if (payload.newHtml) {
        newPane.innerHTML = payload.newHtml;
        newPane.classList.remove('empty-pane');
      } else {
        newPane.innerHTML = '<div class="empty-pane-message">File deleted</div>';
        newPane.classList.add('empty-pane');
      }
    }
  }

  /**
   * Handle appendContent messages by appending HTML to existing pane content.
   * Used for incremental rendering of large diffs.
   */
  function handleAppendContent(payload) {
    if (!payload) {
      return;
    }

    if (oldPane && payload.oldHtml) {
      oldPane.insertAdjacentHTML('beforeend', payload.oldHtml);
      oldPane.classList.remove('empty-pane');
    }

    if (newPane && payload.newHtml) {
      newPane.insertAdjacentHTML('beforeend', payload.newHtml);
      newPane.classList.remove('empty-pane');
    }
  }

  function formatStatus(status) {
    switch (status) {
      case 'added':
        return 'Added';
      case 'deleted':
        return 'Deleted';
      case 'renamed':
        return 'Renamed';
      case 'modified':
        return 'Modified';
      default:
        return status || '';
    }
  }

  function handleThemeChanged(payload) {
    if (!payload || !payload.kind) {
      return;
    }
    // Remove existing theme classes
    document.body.classList.remove('vscode-light', 'vscode-dark', 'vscode-high-contrast');
    // Apply new theme class
    switch (payload.kind) {
      case 'light':
        document.body.classList.add('vscode-light');
        break;
      case 'dark':
        document.body.classList.add('vscode-dark');
        break;
      case 'highContrast':
        document.body.classList.add('vscode-high-contrast');
        break;
    }
  }

  // --- Initialize ---
  createToolbar();

  // Notify the extension that the webview is ready
  vscode.postMessage({ type: 'ready' });
})();
