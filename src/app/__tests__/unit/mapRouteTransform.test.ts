import { toMapRouteSegment } from '@/app/lib/mapRouteTransform';

describe('toMapRouteSegment', () => {
  it('prefers modern transportType and coords over legacy fields', () => {
    const mapped = toMapRouteSegment({
      id: 'route-1',
      from: 'A',
      to: 'B',
      type: 'train',
      transportType: 'bus',
      fromCoordinates: [10, 20],
      toCoordinates: [11, 21],
      fromCoords: [30, 40],
      toCoords: [31, 41],
      departureTime: '2025-01-01T10:00:00.000Z',
      subRoutes: [
        {
          id: 'segment-1',
          from: 'A',
          to: 'C',
          type: 'plane',
          transportType: 'metro',
          fromCoordinates: [1, 2],
          toCoordinates: [3, 4],
          fromCoords: [5, 6],
          toCoords: [7, 8],
          departureTime: '2025-01-01T11:00:00.000Z',
          routePoints: [[5, 6], [7, 8]]
        }
      ]
    } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

    expect(mapped.transportType).toBe('bus');
    expect(mapped.fromCoords).toEqual([30, 40]);
    expect(mapped.toCoords).toEqual([31, 41]);
    expect(mapped.subRoutes?.[0].transportType).toBe('metro');
    expect(mapped.subRoutes?.[0].fromCoords).toEqual([5, 6]);
    expect(mapped.subRoutes?.[0].toCoords).toEqual([7, 8]);
  });

  it('falls back to legacy type/coordinates and default transport type', () => {
    const legacyMapped = toMapRouteSegment({
      id: 'route-legacy',
      from: 'Old A',
      to: 'Old B',
      type: 'ferry',
      fromCoordinates: [50, 60],
      toCoordinates: [51, 61],
      departureTime: '2025-02-02T12:00:00.000Z'
    } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

    const defaultMapped = toMapRouteSegment({
      id: 'route-default',
      from: 'X',
      to: 'Y'
    } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

    expect(legacyMapped.transportType).toBe('ferry');
    expect(legacyMapped.fromCoords).toEqual([50, 60]);
    expect(legacyMapped.toCoords).toEqual([51, 61]);
    expect(defaultMapped.transportType).toBe('other');
    expect(defaultMapped.fromCoords).toEqual([0, 0]);
    expect(defaultMapped.toCoords).toEqual([0, 0]);
  });
});
