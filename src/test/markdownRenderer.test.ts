/**
 * Unit Tests for Markdown Renderer
 *
 * Tests the createRenderer function and the MarkdownRenderer interface.
 * Covers standard markdown elements, GFM features, empty input, and
 * relative image path resolution via renderWithBase.
 *
 * Requirements covered: 2.1, 2.2, 2.3, 2.4
 */

import { expect } from 'chai';
import { createRenderer } from '../markdownRenderer';

describe('Markdown Renderer', function () {
  const renderer = createRenderer();

  // --- Requirement 2.1: Standard markdown to HTML ---

  describe('Standard Markdown Elements', function () {
    it('should render h1 through h6 headings', function () {
      expect(renderer.render('# H1')).to.contain('<h1>H1</h1>');
      expect(renderer.render('## H2')).to.contain('<h2>H2</h2>');
      expect(renderer.render('### H3')).to.contain('<h3>H3</h3>');
      expect(renderer.render('#### H4')).to.contain('<h4>H4</h4>');
      expect(renderer.render('##### H5')).to.contain('<h5>H5</h5>');
      expect(renderer.render('###### H6')).to.contain('<h6>H6</h6>');
    });

    it('should render paragraphs', function () {
      const html = renderer.render('This is a paragraph.');
      expect(html).to.contain('<p>This is a paragraph.</p>');
    });

    it('should render unordered lists', function () {
      const md = '- Item A\n- Item B\n- Item C';
      const html = renderer.render(md);
      expect(html).to.contain('<ul>');
      expect(html).to.contain('<li>Item A</li>');
      expect(html).to.contain('<li>Item B</li>');
      expect(html).to.contain('<li>Item C</li>');
      expect(html).to.contain('</ul>');
    });

    it('should render ordered lists', function () {
      const md = '1. First\n2. Second\n3. Third';
      const html = renderer.render(md);
      expect(html).to.contain('<ol>');
      expect(html).to.contain('<li>First</li>');
      expect(html).to.contain('<li>Second</li>');
      expect(html).to.contain('<li>Third</li>');
      expect(html).to.contain('</ol>');
    });

    it('should render links', function () {
      const html = renderer.render('[Example](https://example.com)');
      expect(html).to.contain('<a href="https://example.com">Example</a>');
    });

    it('should render images', function () {
      const html = renderer.render('![Alt text](https://example.com/img.png)');
      expect(html).to.contain('<img');
      expect(html).to.contain('src="https://example.com/img.png"');
      expect(html).to.contain('alt="Alt text"');
    });
  });

  // --- Requirement 2.2: GFM elements ---

  describe('GitHub Flavored Markdown Elements', function () {
    it('should render tables', function () {
      const md = [
        '| Header 1 | Header 2 |',
        '| -------- | -------- |',
        '| Cell 1   | Cell 2   |',
      ].join('\n');
      const html = renderer.render(md);
      expect(html).to.contain('<table>');
      expect(html).to.contain('<th>Header 1</th>');
      expect(html).to.contain('<th>Header 2</th>');
      expect(html).to.contain('<td>Cell 1</td>');
      expect(html).to.contain('<td>Cell 2</td>');
      expect(html).to.contain('</table>');
    });

    it('should render task lists with checkboxes', function () {
      const md = '- [ ] Unchecked\n- [x] Checked';
      const html = renderer.render(md);
      expect(html).to.contain('<input');
      expect(html).to.contain('type="checkbox"');
      // The checked item should have the checked attribute
      expect(html).to.match(/checked/i);
    });

    it('should render strikethrough text', function () {
      const html = renderer.render('~~deleted text~~');
      expect(html).to.contain('<s>deleted text</s>');
    });

    it('should render fenced code blocks', function () {
      const md = '```javascript\nconst x = 1;\n```';
      const html = renderer.render(md);
      expect(html).to.contain('<pre class="hljs">');
      expect(html).to.contain('<code');
      // highlight.js wraps keywords/numbers in spans, so check for the parts
      expect(html).to.contain('const');
      expect(html).to.contain('x = ');
      expect(html).to.contain('1');
    });
  });

  // --- Requirement 2.4: Empty input ---

  describe('Empty Input', function () {
    it('should return empty string for empty input', function () {
      expect(renderer.render('')).to.equal('');
    });

    it('should return empty string for undefined-like falsy input', function () {
      // The implementation checks !markdown, so null/undefined would also return ''
      expect(renderer.render(null as unknown as string)).to.equal('');
      expect(renderer.render(undefined as unknown as string)).to.equal('');
    });
  });

  // --- Requirement 2.3: Relative image path resolution ---

  describe('renderWithBase - Relative Image Path Resolution', function () {
    it('should resolve relative image paths against the base path', function () {
      const md = '![logo](./images/logo.png)';
      const html = renderer.renderWithBase(md, '/workspace/project');
      expect(html).to.contain('src="/workspace/project/images/logo.png"');
    });

    it('should resolve bare relative image paths (no ./ prefix)', function () {
      const md = '![icon](assets/icon.svg)';
      const html = renderer.renderWithBase(md, '/workspace/project');
      expect(html).to.contain('src="/workspace/project/assets/icon.svg"');
    });

    it('should not modify absolute http image URLs', function () {
      const md = '![photo](https://example.com/photo.jpg)';
      const html = renderer.renderWithBase(md, '/workspace/project');
      expect(html).to.contain('src="https://example.com/photo.jpg"');
    });

    it('should not modify data URI images', function () {
      const md = '![pixel](data:image/png;base64,abc123)';
      const html = renderer.renderWithBase(md, '/workspace/project');
      expect(html).to.contain('src="data:image/png;base64,abc123"');
    });

    it('should return empty string for empty input with renderWithBase', function () {
      expect(renderer.renderWithBase('', '/workspace')).to.equal('');
    });

    it('should handle multiple images in the same document', function () {
      const md = '![a](img/a.png)\n\n![b](img/b.png)';
      const html = renderer.renderWithBase(md, '/root');
      expect(html).to.contain('src="/root/img/a.png"');
      expect(html).to.contain('src="/root/img/b.png"');
    });
  });
});
