import { getMarkerLegendSvgMarkup } from '@/app/lib/mapIconUtils';

describe('getMarkerLegendSvgMarkup', () => {
  it('renders past marker legend SVG with expected tone styling', () => {
    const markup = getMarkerLegendSvgMarkup('past');
    expect(markup).toContain('temporal-symbol-past');
    expect(markup).toContain('var(--travel-marker-color-past)');
  });

  it('renders present marker legend SVG with expected tone styling', () => {
    const markup = getMarkerLegendSvgMarkup('present');
    expect(markup).toContain('temporal-symbol-present');
    expect(markup).toContain('var(--travel-marker-color-present)');
  });

  it('renders future marker legend SVG with expected tone styling', () => {
    const markup = getMarkerLegendSvgMarkup('future');
    expect(markup).toContain('temporal-symbol-future');
    expect(markup).toContain('var(--travel-marker-color-future)');
  });

  it('supports overriding the legend icon size', () => {
    const markup = getMarkerLegendSvgMarkup('present', { width: 10, height: 16 });
    expect(markup).toContain('width="10"');
    expect(markup).toContain('height="16"');
  });
});

