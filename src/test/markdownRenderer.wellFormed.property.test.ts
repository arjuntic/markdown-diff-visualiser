/**
 * Property-Based Test: Renderer produces well-formed HTML
 *
 * Feature: markdown-diff-preview, Property 4: Renderer produces well-formed HTML
 *
 * For any valid markdown string, the Markdown_Renderer SHALL produce HTML output
 * where every opened tag has a corresponding closing tag (or is a valid self-closing tag),
 * and the output contains no unclosed or mismatched elements.
 *
 * **Validates: Requirements 2.5**
 */

import { expect } from 'chai';
import * as fc from 'fast-check';
import { createRenderer } from '../markdownRenderer';

/**
 * Set of HTML void elements (self-closing tags) that do not require a closing tag.
 * Per the HTML spec, these elements cannot have content.
 */
const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/**
 * Checks that every opened HTML tag has a corresponding closing tag,
 * void/self-closing elements are allowed without a closing tag,
 * and there are no mismatched or unclosed elements.
 *
 * Returns { valid: true } or { valid: false, reason: string }.
 */
function checkWellFormedHtml(html: string): { valid: boolean; reason?: string } {
  // Strip HTML comments
  const stripped = html.replace(/<!--[\s\S]*?-->/g, '');

  // Regex to match opening tags, closing tags, and self-closing tags.
  // Captures: full match, optional slash (closing), tag name, attributes, optional self-close slash
  const tagRegex = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*?)(\/?)>/g;

  const stack: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(stripped)) !== null) {
    const isClosing = match[1] === '/';
    const tagName = match[2].toLowerCase();
    const isSelfClosing = match[4] === '/';

    if (isClosing) {
      // Closing tag
      if (VOID_ELEMENTS.has(tagName)) {
        // Closing a void element is unusual but not invalid; skip it
        continue;
      }
      if (stack.length === 0) {
        return { valid: false, reason: `Closing tag </${tagName}> with no matching open tag` };
      }
      const top = stack[stack.length - 1];
      if (top !== tagName) {
        return { valid: false, reason: `Mismatched tags: expected </${top}>, found </${tagName}>` };
      }
      stack.pop();
    } else if (isSelfClosing || VOID_ELEMENTS.has(tagName)) {
      // Self-closing tag or void element — no stack push needed
      continue;
    } else {
      // Opening tag
      stack.push(tagName);
    }
  }

  if (stack.length > 0) {
    return { valid: false, reason: `Unclosed tags: ${stack.join(', ')}` };
  }

  return { valid: true };
}

/**
 * Arbitrary that generates markdown heading lines.
 */
const headingArb = fc.tuple(
  fc.integer({ min: 1, max: 6 }),
  fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')), {
    minLength: 1,
    maxLength: 30,
  })
).map(([level, text]) => '#'.repeat(level) + ' ' + text);

/**
 * Arbitrary that generates a plain text paragraph.
 */
const paragraphArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!?-'.split('')),
  { minLength: 1, maxLength: 80 }
);

/**
 * Arbitrary that generates inline markdown formatting.
 */
const inlineFormattedArb = fc.oneof(
  paragraphArb.map(t => `**${t}**`),
  paragraphArb.map(t => `*${t}*`),
  paragraphArb.map(t => `~~${t}~~`),
  paragraphArb.map(t => `\`${t}\``),
  paragraphArb.map(t => `[${t}](https://example.com)`),
);

/**
 * Arbitrary that generates an unordered list.
 */
const unorderedListArb = fc.array(paragraphArb, { minLength: 1, maxLength: 5 })
  .map(items => items.map(item => `- ${item}`).join('\n'));

/**
 * Arbitrary that generates an ordered list.
 */
const orderedListArb = fc.array(paragraphArb, { minLength: 1, maxLength: 5 })
  .map(items => items.map((item, i) => `${i + 1}. ${item}`).join('\n'));

/**
 * Arbitrary that generates a fenced code block.
 */
const codeBlockArb = fc.tuple(
  fc.constantFrom('', 'js', 'typescript', 'python', 'bash'),
  paragraphArb
).map(([lang, code]) => `\`\`\`${lang}\n${code}\n\`\`\``);

/**
 * Arbitrary that generates a blockquote.
 */
const blockquoteArb = fc.array(paragraphArb, { minLength: 1, maxLength: 3 })
  .map(lines => lines.map(l => `> ${l}`).join('\n'));

/**
 * Arbitrary that generates a simple markdown table.
 */
const tableArb = fc.tuple(
  fc.array(
    fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), { minLength: 1, maxLength: 10 }),
    { minLength: 2, maxLength: 4 }
  ),
  fc.array(
    fc.array(
      fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789 '.split('')), { minLength: 1, maxLength: 10 }),
      { minLength: 2, maxLength: 4 }
    ),
    { minLength: 1, maxLength: 3 }
  )
).map(([headers, rows]) => {
  const colCount = headers.length;
  const headerRow = '| ' + headers.join(' | ') + ' |';
  const separator = '| ' + headers.map(() => '---').join(' | ') + ' |';
  const dataRows = rows.map(row => {
    // Ensure each row has the right number of columns
    const cells = row.slice(0, colCount);
    while (cells.length < colCount) { cells.push(''); }
    return '| ' + cells.join(' | ') + ' |';
  }).join('\n');
  return `${headerRow}\n${separator}\n${dataRows}`;
});

/**
 * Arbitrary that generates a task list.
 */
const taskListArb = fc.array(
  fc.tuple(fc.boolean(), paragraphArb),
  { minLength: 1, maxLength: 4 }
).map(items => items.map(([checked, text]) =>
  `- [${checked ? 'x' : ' '}] ${text}`
).join('\n'));

/**
 * Arbitrary that generates a horizontal rule.
 */
const hrArb = fc.constantFrom('---', '***', '___');

/**
 * Arbitrary that generates an image reference.
 */
const imageArb = fc.tuple(
  fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz '.split('')), { minLength: 1, maxLength: 15 }),
  fc.constantFrom('image.png', 'photo.jpg', 'https://example.com/img.png')
).map(([alt, src]) => `![${alt}](${src})`);

/**
 * Arbitrary that generates a complete markdown document by combining blocks.
 */
const markdownDocArb = fc.array(
  fc.oneof(
    { weight: 3, arbitrary: headingArb },
    { weight: 5, arbitrary: paragraphArb },
    { weight: 3, arbitrary: inlineFormattedArb },
    { weight: 2, arbitrary: unorderedListArb },
    { weight: 2, arbitrary: orderedListArb },
    { weight: 1, arbitrary: codeBlockArb },
    { weight: 2, arbitrary: blockquoteArb },
    { weight: 1, arbitrary: tableArb },
    { weight: 1, arbitrary: taskListArb },
    { weight: 1, arbitrary: hrArb },
    { weight: 1, arbitrary: imageArb },
  ),
  { minLength: 1, maxLength: 10 }
).map(blocks => blocks.join('\n\n'));

describe('Feature: markdown-diff-preview, Property 4: Renderer produces well-formed HTML', function () {
  this.timeout(60000);

  const renderer = createRenderer();

  it('should produce well-formed HTML for any generated markdown document', function () {
    fc.assert(
      fc.property(
        markdownDocArb,
        (markdown) => {
          const html = renderer.render(markdown);

          const result = checkWellFormedHtml(html);
          expect(result.valid, `HTML is not well-formed: ${result.reason}\nMarkdown:\n${markdown}\nHTML:\n${html}`).to.be.true;
        }
      ),
      {
        numRuns: 100,
        verbose: true,
      }
    );
  });

  it('should produce well-formed HTML for empty input', function () {
    const html = renderer.render('');
    expect(html).to.equal('');
    const result = checkWellFormedHtml(html);
    expect(result.valid).to.be.true;
  });

  it('should produce well-formed HTML for single inline elements', function () {
    fc.assert(
      fc.property(
        inlineFormattedArb,
        (markdown) => {
          const html = renderer.render(markdown);
          const result = checkWellFormedHtml(html);
          expect(result.valid, `HTML is not well-formed: ${result.reason}\nMarkdown:\n${markdown}\nHTML:\n${html}`).to.be.true;
        }
      ),
      {
        numRuns: 100,
        verbose: true,
      }
    );
  });
});
