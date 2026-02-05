import { validateAndNormalizeCompositeRoute } from '@/app/lib/compositeRouteValidation';

describe('validateAndNormalizeCompositeRoute', () => {
  it('accepts connected segments when names match and coords drift slightly', () => {
    const result = validateAndNormalizeCompositeRoute({
      from: 'Budapest',
      to: 'Sydney',
      fromCoords: [47.4979, 19.0402],
      toCoords: [-33.8688, 151.2093],
      subRoutes: [
        { from: 'Budapest', to: 'Doha Transfer', fromCoords: [47.4979, 19.0402], toCoords: [25.285447, 51.53104] },
        { from: 'Doha Transfer', to: 'Singapore Transfer', fromCoords: [25.2854474, 51.5310404], toCoords: [1.3521, 103.8198] },
        { from: 'Singapore Transfer', to: 'Sydney', fromCoords: [1.3521004, 103.8198004], toCoords: [-33.8688, 151.2093] }
      ]
    });

    expect(result.ok).toBe(true);
  });

  it('rejects disconnected segments when names do not match', () => {
    const result = validateAndNormalizeCompositeRoute({
      from: 'A',
      to: 'D',
      subRoutes: [
        { from: 'A', to: 'B', toCoords: [1, 1] },
        { from: 'C', to: 'D', fromCoords: [1, 1] }
      ]
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected disconnected segment validation failure');
    }
    expect(result.error).toEqual({ code: 'disconnected_segment', segmentNumber: 2 });
  });

  it('does not fail on route endpoint coordinates when route-level names are unset', () => {
    const result = validateAndNormalizeCompositeRoute({
      from: '',
      to: '',
      fromCoords: [0, 0],
      toCoords: [0, 0],
      subRoutes: [
        { from: 'Known Start', to: 'Known End', fromCoords: [10, 10], toCoords: [20, 20] }
      ]
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected validation to pass without route-level names');
    }
    expect(result.normalizedRoute.from).toBe('Known Start');
    expect(result.normalizedRoute.to).toBe('Known End');
  });
});
