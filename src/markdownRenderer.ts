/**
 * Markdown Renderer - Converts markdown strings to HTML using markdown-it with GFM plugins.
 * Resolves relative image paths.
 */

import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import footnote from 'markdown-it-footnote';
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

  const md = new MarkdownIt({
    html: true,
    linkify: gfm,
    typographer: gfm,
    breaks: false,
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
