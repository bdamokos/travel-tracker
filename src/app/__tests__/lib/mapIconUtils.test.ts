import { createCountMarkerIcon, getMarkerLegendSvgMarkup } from '@/app/lib/mapIconUtils';

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



describe('createCountMarkerIcon badge variants', () => {
  const leaflet = {
    divIcon: jest.fn((options: unknown) => options),
  } as unknown as typeof import('leaflet');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders cluster badges with the cluster badge class', () => {
    createCountMarkerIcon(leaflet, 3, 'present', 9, { label: 'Cluster marker', badgeVariant: 'cluster' });

    expect(leaflet.divIcon).toHaveBeenCalledTimes(1);
    const [{ html }] = (leaflet.divIcon as jest.Mock).mock.calls[0] as [{ html: string }];
    expect(html).toContain('travel-marker-count-badge-cluster');
  });

  it('renders visit badges with the visit badge class', () => {
    createCountMarkerIcon(leaflet, 4, 'future', 7, { label: 'Visited four times', badgeVariant: 'visit' });

    expect(leaflet.divIcon).toHaveBeenCalledTimes(1);
    const [{ html }] = (leaflet.divIcon as jest.Mock).mock.calls[0] as [{ html: string }];
    expect(html).toContain('travel-marker-count-badge-visit');
  });
});
