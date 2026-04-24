/**
 * Markdown Renderer - Converts markdown strings to HTML using markdown-it with GFM plugins.
 * Resolves relative image paths.
 */

import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import footnote from 'markdown-it-footnote';
import hljs from 'highlight.js/lib/core';
// Register commonly used languages
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import yaml from 'highlight.js/lib/languages/yaml';
import sql from 'highlight.js/lib/languages/sql';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import markdown from 'highlight.js/lib/languages/markdown';
import diff from 'highlight.js/lib/languages/diff';
import java from 'highlight.js/lib/languages/java';
import csharp from 'highlight.js/lib/languages/csharp';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import ruby from 'highlight.js/lib/languages/ruby';
import php from 'highlight.js/lib/languages/php';
import shell from 'highlight.js/lib/languages/shell';
import dockerfile from 'highlight.js/lib/languages/dockerfile';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('json', json);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('css', css);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('md', markdown);
hljs.registerLanguage('diff', diff);
hljs.registerLanguage('java', java);
hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('cs', csharp);
hljs.registerLanguage('go', go);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('rs', rust);
hljs.registerLanguage('ruby', ruby);
hljs.registerLanguage('rb', ruby);
hljs.registerLanguage('php', php);
hljs.registerLanguage('shell', shell);
hljs.registerLanguage('dockerfile', dockerfile);
hljs.registerLanguage('docker', dockerfile);
import * as path from 'path';

export interface MarkdownRenderer {
  render(markdown: string): string;
  renderWithBase(markdown: string, basePath: string): string;
}

export interface RendererOptions {
  gfm?: boolean;
  basePath?: string;
}

/**
 * Resolve relative image paths in markdown to workspace-relative paths.
 * Replaces src attributes like `./img.png` or `img.png` with paths resolved
 * against the provided basePath.
 */
function resolveImagePaths(html: string, basePath: string): string {
  // Match <img ... src="..." ...> tags and resolve relative src values
  return html.replace(
    /(<img\s[^>]*?\bsrc\s*=\s*")((?!https?:\/\/|data:|\/)[^"]*?)(")/gi,
    (_match, prefix: string, src: string, suffix: string) => {
      const resolved = path.posix.join(basePath, src);
      return `${prefix}${resolved}${suffix}`;
    }
  );
}

export function createRenderer(options?: RendererOptions): MarkdownRenderer {
  const gfm = options?.gfm !== false; // default to true

  function highlightCode(str: string, lang: string): string {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return '<pre class="hljs"><code>' +
          hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
          '</code></pre>';
      } catch {
        // fall through to default
      }
    }
    const escaped = str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    return '<pre class="hljs"><code>' + escaped + '</code></pre>';
  }

  const md = new MarkdownIt({
    html: true,
    linkify: gfm,
    typographer: gfm,
    breaks: false,
    highlight: highlightCode,
  });

  // Add GFM plugins
  md.use(taskLists, { enabled: false });
  md.use(footnote);

  return {
    render(markdown: string): string {
      if (!markdown) {
        return '';
      }
      return md.render(markdown);
    },

    renderWithBase(markdown: string, basePath: string): string {
      if (!markdown) {
        return '';
      }
      const html = md.render(markdown);
      return resolveImagePaths(html, basePath);
    },
  };
}
