import { getLeafMapRouteSegments, resolveMapRouteSegmentPoints } from '@/app/lib/mapRouteDisplay';
import type { MapRouteSegment } from '@/app/types';

describe('mapRouteDisplay', () => {
  it('returns the route itself when no subRoutes exist', () => {
    const route: MapRouteSegment = {
      id: 'r1',
      from: 'A',
      to: 'B',
      fromCoords: [1, 2],
      toCoords: [3, 4],
      transportType: 'train',
      date: '2024-01-01T00:00:00.000Z',
    };

    expect(getLeafMapRouteSegments(route)).toEqual([route]);
  });

  it('returns leaf segments when subRoutes exist (excluding the parent)', () => {
    const route: MapRouteSegment = {
      id: 'parent',
      from: 'A',
      to: 'C',
      fromCoords: [1, 2],
      toCoords: [5, 6],
      transportType: 'multimodal',
      date: '2024-01-01T00:00:00.000Z',
      subRoutes: [
        {
          id: 'seg-1',
          from: 'A',
          to: 'B',
          fromCoords: [1, 2],
          toCoords: [3, 4],
          transportType: 'plane',
          date: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'seg-2',
          from: 'B',
          to: 'C',
          fromCoords: [3, 4],
          toCoords: [5, 6],
          transportType: 'bus',
          date: '2024-01-01T00:00:00.000Z',
        },
      ],
    };

    expect(getLeafMapRouteSegments(route).map(seg => seg.id)).toEqual(['seg-1', 'seg-2']);
  });

  it('flattens nested subRoutes', () => {
    const route: MapRouteSegment = {
      id: 'parent',
      from: 'A',
      to: 'D',
      fromCoords: [1, 2],
      toCoords: [7, 8],
      transportType: 'multimodal',
      date: '2024-01-01T00:00:00.000Z',
      subRoutes: [
        {
          id: 'seg-1',
          from: 'A',
          to: 'B',
          fromCoords: [1, 2],
          toCoords: [3, 4],
          transportType: 'train',
          date: '2024-01-01T00:00:00.000Z',
          subRoutes: [
            {
              id: 'seg-1a',
              from: 'A',
              to: 'A2',
              fromCoords: [1, 2],
              toCoords: [2, 3],
              transportType: 'walk',
              date: '2024-01-01T00:00:00.000Z',
            },
            {
              id: 'seg-1b',
              from: 'A2',
              to: 'B',
              fromCoords: [2, 3],
              toCoords: [3, 4],
              transportType: 'metro',
              date: '2024-01-01T00:00:00.000Z',
            },
          ],
        },
        {
          id: 'seg-2',
          from: 'B',
          to: 'D',
          fromCoords: [3, 4],
          toCoords: [7, 8],
          transportType: 'plane',
          date: '2024-01-01T00:00:00.000Z',
        },
      ],
    };

    expect(getLeafMapRouteSegments(route).map(seg => seg.id)).toEqual(['seg-1a', 'seg-1b', 'seg-2']);
  });

  it('resolves route points from stored routePoints when present', () => {
    const segment: MapRouteSegment = {
      id: 'seg',
      from: 'A',
      to: 'B',
      fromCoords: [1, 2],
      toCoords: [3, 4],
      transportType: 'train',
      date: '2024-01-01T00:00:00.000Z',
      routePoints: [[10, 20], [11, 21]],
    };

    expect(resolveMapRouteSegmentPoints(segment)).toEqual([[10, 20], [11, 21]]);
  });

  it('falls back to endpoints when no routePoints exist', () => {
    const segment: MapRouteSegment = {
      id: 'seg',
      from: 'A',
      to: 'B',
      fromCoords: [1, 2],
      toCoords: [3, 4],
      transportType: 'train',
      date: '2024-01-01T00:00:00.000Z',
    };

    expect(resolveMapRouteSegmentPoints(segment)).toEqual([[1, 2], [3, 4]]);
  });
});
