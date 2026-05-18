/** @jest-environment node */

import {
  getOptimalThumbnailUrl,
  getStandardThumbnailWidth
} from '@/app/lib/wikipediaUtils';

describe('wikipediaUtils thumbnail sizing', () => {
  it('rounds requested thumbnail widths up to Wikimedia standard sizes', () => {
    expect(getStandardThumbnailWidth(60)).toBe(60);
    expect(getStandardThumbnailWidth(240)).toBe(250);
    expect(getStandardThumbnailWidth(320)).toBe(330);
    expect(getStandardThumbnailWidth(700)).toBe(960);
  });

  it('rewrites direct thumbnail URLs to standard Wikimedia widths', () => {
    const source = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Example.jpg/320px-Example.jpg';

    expect(getOptimalThumbnailUrl(source, 240)).toBe(
      'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Example.jpg/250px-Example.jpg'
    );
  });

  it('leaves non-thumbnail URLs unchanged', () => {
    const source = 'https://upload.wikimedia.org/wikipedia/commons/a/a1/Example.jpg';

    expect(getOptimalThumbnailUrl(source, 240)).toBe(source);
  });
});
