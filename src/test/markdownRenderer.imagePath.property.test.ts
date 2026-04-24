/**
 * Property-Based Test: Relative image path resolution
 *
 * Feature: markdown-diff-preview, Property 3: Relative image path resolution
 *
 * For any markdown string containing relative image paths and any workspace root path,
 * the rendered HTML SHALL contain image `src` attributes with paths resolved relative
 * to the workspace root. Absolute URLs (https://, data:, /) should NOT be modified.
 *
 * **Validates: Requirements 2.3**
 */

import { expect } from 'chai';
import * as fc from 'fast-check';
import * as path from 'path';
import { createRenderer } from '../markdownRenderer';

/**
 * Arbitrary that generates a simple file name segment (no slashes, no special chars).
 */
const fileSegmentArb = fc
  .stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_-'.split('')), {
    minLength: 1,
    maxLength: 12,
  });

/**
 * Arbitrary that generates a file extension for images.
 */
const imageExtArb = fc.constantFrom('.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp');

/**
 * Arbitrary that generates a relative image path like "img.png", "images/photo.jpg",
 * or "./assets/pic.png".
 */
const relativeImagePathArb = fc.tuple(
  fc.constantFrom('', './', '../'),
  fc.array(fileSegmentArb, { minLength: 0, maxLength: 2 }),
  fileSegmentArb,
  imageExtArb
).map(([prefix, dirs, name, ext]) => {
  const segments = [...dirs, name + ext];
  return prefix + segments.join('/');
});

/**
 * Arbitrary that generates alt text for images.
 */
const altTextArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')),
  { minLength: 0, maxLength: 20 }
);

/**
 * Arbitrary that generates a workspace root path (posix-style).
 */
const basePathArb = fc.tuple(
  fc.constantFrom('/workspace', '/home/user/projects', '/var/app'),
  fc.array(fileSegmentArb, { minLength: 0, maxLength: 2 })
).map(([root, dirs]) => {
  if (dirs.length === 0) { return root; }
  return root + '/' + dirs.join('/');
});

/**
 * Arbitrary that generates an absolute URL that should NOT be modified.
 */
const absoluteUrlArb = fc.oneof(
  fc.constant('https://example.com/image.png'),
  fc.constant('http://cdn.test.com/photo.jpg'),
  fc.constant('data:image/png;base64,abc123'),
  fc.constant('/absolute/path/image.png')
);

describe('Feature: markdown-diff-preview, Property 3: Relative image path resolution', function () {
  this.timeout(60000);

  const renderer = createRenderer();

  it('should resolve relative image paths against the base path in rendered HTML', function () {
    fc.assert(
      fc.property(
        relativeImagePathArb,
        altTextArb,
        basePathArb,
        (imagePath, altText, basePath) => {
          const markdown = `![${altText}](${imagePath})`;
          const html = renderer.renderWithBase(markdown, basePath);

          // Compute the expected resolved path
          const expectedResolved = path.posix.join(basePath, imagePath);

          // The rendered HTML should contain an img tag with the resolved src
          expect(html).to.include(`src="${expectedResolved}"`);
        }
      ),
      {
        numRuns: 100,
        verbose: true,
      }
    );
  });

  it('should NOT modify absolute URLs (https://, http://, data:, /)', function () {
    fc.assert(
      fc.property(
        absoluteUrlArb,
        altTextArb,
        basePathArb,
        (absoluteUrl, altText, basePath) => {
          const markdown = `![${altText}](${absoluteUrl})`;
          const html = renderer.renderWithBase(markdown, basePath);

          // Absolute URLs should remain unchanged in the rendered HTML
          expect(html).to.include(`src="${absoluteUrl}"`);
        }
      ),
      {
        numRuns: 100,
        verbose: true,
      }
    );
  });
});
