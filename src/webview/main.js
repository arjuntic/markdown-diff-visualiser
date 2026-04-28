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

  // --- Toolbar with comparison mode dropdown and refresh ---
  function createToolbar() {
    var toolbar = document.createElement('div');
    toolbar.className = 'diff-mode-toolbar';

    var group = document.createElement('div');
    group.className = 'dropdown-group';
    var label = document.createElement('label');
    label.className = 'dropdown-label';
    label.textContent = 'Compare:';
    var select = document.createElement('select');
    select.className = 'version-select';
    select.id = 'compareSelect';
    select.innerHTML =
      '<option value="committed-unstaged">Last Committed vs Unstaged</option>' +
      '<option value="committed-staged">Last Committed vs Staged</option>' +
      '<option value="staged-unstaged">Staged vs Unstaged</option>';
    select.value = 'committed-unstaged';
    group.appendChild(label);
    group.appendChild(select);
    toolbar.appendChild(group);

    var refreshBtn = document.createElement('button');
    refreshBtn.className = 'diff-mode-btn refresh-btn';
    refreshBtn.textContent = 'Refresh';
    refreshBtn.setAttribute('aria-label', 'Refresh diff');
    refreshBtn.addEventListener('click', function () {
      sendCompareRequest();
    });
    toolbar.appendChild(refreshBtn);

    select.addEventListener('change', function () {
      sendCompareRequest();
    });

    var header = document.querySelector('.panel-header');
    if (header && header.parentNode) {
      header.parentNode.insertBefore(toolbar, header.nextSibling);
    }
  }

  function sendCompareRequest() {
    var select = document.getElementById('compareSelect');
    if (select) {
      var val = select.value;
      var parts = val.split('-');
      updatePaneLabels(val);
      vscode.postMessage({
        type: 'compareVersions',
        payload: { leftVersion: parts[0], rightVersion: parts[1] },
      });
    }
  }

  var versionNames = {
    committed: 'Last Committed',
    staged: 'Staged',
    unstaged: 'Unstaged',
  };

  function updatePaneLabels(compareValue) {
    var parts = compareValue.split('-');
    var leftLabel = document.getElementById('leftPaneLabel');
    var rightLabel = document.getElementById('rightPaneLabel');
    if (leftLabel) leftLabel.textContent = versionNames[parts[0]] || parts[0];
    if (rightLabel) rightLabel.textContent = versionNames[parts[1]] || parts[1];
  }

  // --- Synchronized scrolling (1:1 pixel sync) ---
  var isSyncing = false;

  function syncScroll(source, target) {
    if (isSyncing) return;
    isSyncing = true;
    target.scrollTop = source.scrollTop;
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

  // --- Alignment spacers ---
  // After rendering, insert spacer divs so that unchanged content
  // appears at the same vertical position on both sides.
  // We find matching pairs of non-diff children and equalize their tops.

  function alignPanes() {
    if (!oldPane || !newPane) return;

    // Remove any previously inserted spacers
    oldPane.querySelectorAll('.alignment-spacer').forEach(function (s) {
      s.remove();
    });
    newPane.querySelectorAll('.alignment-spacer').forEach(function (s) {
      s.remove();
    });

    // Get direct children of each pane (the rendered blocks)
    var oldChildren = Array.from(oldPane.children);
    var newChildren = Array.from(newPane.children);

    // Build arrays of {element, isDiff, textSignature} for matching
    function classify(children) {
      return children.map(function (el) {
        var isDiff =
          el.classList.contains('diff-added-block') || el.classList.contains('diff-removed-block');
        // Use a short text signature for matching unchanged blocks
        var text = isDiff ? null : el.textContent.trim().substring(0, 80);
        return { el: el, isDiff: isDiff, text: text };
      });
    }

    var oldItems = classify(oldChildren);
    var newItems = classify(newChildren);

    // Find matching unchanged blocks using text signatures
    // Walk both lists and when we find a text match, insert a spacer
    // on whichever side is shorter to equalize the offset
    var oi = 0;
    var ni = 0;

    while (oi < oldItems.length && ni < newItems.length) {
      var oldItem = oldItems[oi];
      var newItem = newItems[ni];

      // Both unchanged and text matches — this is an anchor point
      if (!oldItem.isDiff && !newItem.isDiff && oldItem.text && oldItem.text === newItem.text) {
        var oldTop = oldItem.el.offsetTop;
        var newTop = newItem.el.offsetTop;
        var diff = oldTop - newTop;

        if (Math.abs(diff) > 2) {
          var spacer = document.createElement('div');
          spacer.className = 'alignment-spacer';

          if (diff > 0) {
            // New pane is ahead — insert spacer before the new element
            spacer.style.height = diff + 'px';
            newItem.el.parentNode.insertBefore(spacer, newItem.el);
            // Re-classify since DOM changed
            newItems.splice(ni, 0, { el: spacer, isDiff: true, text: null });
            ni++; // skip the spacer we just inserted
          } else {
            // Old pane is ahead — insert spacer before the old element
            spacer.style.height = -diff + 'px';
            oldItem.el.parentNode.insertBefore(spacer, oldItem.el);
            oldItems.splice(oi, 0, { el: spacer, isDiff: true, text: null });
            oi++; // skip the spacer
          }
        }
        oi++;
        ni++;
      } else if (oldItem.isDiff) {
        oi++;
      } else if (newItem.isDiff) {
        ni++;
      } else {
        // Both unchanged but text doesn't match — advance the one with shorter text
        // (heuristic: skip whichever seems like an insertion)
        oi++;
        ni++;
      }
    }

    // Equalize total heights so scroll range is the same
    var oldH = oldPane.scrollHeight;
    var newH = newPane.scrollHeight;
    if (oldH > newH) {
      var pad = document.createElement('div');
      pad.className = 'alignment-spacer';
      pad.style.height = oldH - newH + 'px';
      newPane.appendChild(pad);
    } else if (newH > oldH) {
      var pad2 = document.createElement('div');
      pad2.className = 'alignment-spacer';
      pad2.style.height = newH - oldH + 'px';
      oldPane.appendChild(pad2);
    }
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
    if (!payload) return;

    if (fileNameEl) {
      fileNameEl.textContent = payload.fileName || '';
    }
    if (fileStatusEl) {
      fileStatusEl.textContent = formatStatus(payload.fileStatus);
      fileStatusEl.className = 'file-status status-' + (payload.fileStatus || 'modified');
    }

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

    // Wait for images to load before aligning and building minimap
    waitForImages(function () {
      alignPanes();
      buildScrollbarMinimap(oldPane, 'diff-removed-block', 'removed');
      buildScrollbarMinimap(newPane, 'diff-added-block', 'added');
    });
  }

  function waitForImages(callback) {
    var images = document.querySelectorAll('.diff-pane img');
    var pending = 0;
    var done = false;

    function check() {
      if (done) return;
      pending--;
      if (pending <= 0) {
        done = true;
        callback();
      }
    }

    images.forEach(function (img) {
      if (!img.complete) {
        pending++;
        img.addEventListener('load', check);
        img.addEventListener('error', check);
      }
    });

    // If no pending images, or all already loaded, run immediately
    if (pending === 0) {
      // Still use rAF to let the browser lay out the DOM first
      requestAnimationFrame(function () {
        requestAnimationFrame(callback);
      });
    }

    // Safety timeout — don't wait forever for slow images
    setTimeout(function () {
      if (!done) {
        done = true;
        callback();
      }
    }, 3000);
  }

  function handleAppendContent(payload) {
    if (!payload) return;

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
    if (!payload || !payload.kind) return;
    document.body.classList.remove('vscode-light', 'vscode-dark', 'vscode-high-contrast');
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

  // --- Scrollbar minimap ---
  function buildScrollbarMinimap(pane, diffClass, type) {
    if (!pane) return;

    var existingMap = pane.parentElement.querySelector(
      '.scrollbar-minimap[data-pane="' + pane.id + '"]',
    );
    if (existingMap) existingMap.remove();

    var diffBlocks = pane.querySelectorAll('.' + diffClass);
    if (diffBlocks.length === 0) return;

    var totalHeight = pane.scrollHeight;
    if (totalHeight <= 0) return;

    var minimap = document.createElement('div');
    minimap.className = 'scrollbar-minimap';
    minimap.dataset.pane = pane.id;

    for (var i = 0; i < diffBlocks.length; i++) {
      var block = diffBlocks[i];
      var topPercent = (block.offsetTop / totalHeight) * 100;
      var heightPercent = Math.max((block.offsetHeight / totalHeight) * 100, 0.8);

      var marker = document.createElement('div');
      marker.className = 'minimap-marker minimap-marker-' + type;
      marker.style.top = topPercent + '%';
      marker.style.height = heightPercent + '%';

      (function (targetTop) {
        marker.addEventListener('click', function () {
          pane.scrollTop = targetTop - pane.clientHeight / 2;
        });
      })(block.offsetTop);

      minimap.appendChild(marker);
    }

    pane.parentElement.style.position = 'relative';
    pane.parentElement.appendChild(minimap);
  }

  // --- Initialize ---
  createToolbar();
  vscode.postMessage({ type: 'ready' });
})();
