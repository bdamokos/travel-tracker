import { normalizeMapTravelData, toMapRouteSegment } from '@/app/lib/mapRouteTransform';

describe('map route transform privacy defaults', () => {
  const routeWithPrivateNotes = {
    id: 'route-1',
    from: 'Paris',
    to: 'Brussels',
    type: 'train',
    fromCoordinates: [48.8566, 2.3522] as [number, number],
    toCoordinates: [50.8503, 4.3517] as [number, number],
    departureTime: '2026-06-03T08:00:00.000Z',
    privateNotes: 'SECRET PLATFORM 9',
    subRoutes: [
      {
        id: 'segment-1',
        from: 'Paris',
        to: 'Lille',
        type: 'train',
        privateNotes: 'SECRET SUBROUTE PNR',
      },
    ],
  };

  it('does not map private route notes into public map notes by default', () => {
    const result = toMapRouteSegment(routeWithPrivateNotes);
    const serialized = JSON.stringify(result);

    expect(result.notes).toBe('');
    expect(result.subRoutes?.[0]?.notes).toBe('');
    expect(serialized).not.toContain('SECRET PLATFORM 9');
    expect(serialized).not.toContain('SECRET SUBROUTE PNR');
  });

  it('only includes private route notes when admin map transforms opt in', () => {
    const result = normalizeMapTravelData(
      {
        id: 'trip-1',
        title: 'Admin Trip',
        description: '',
        startDate: '2026-06-01',
        endDate: '2026-06-10',
        createdAt: '2026-05-01T00:00:00.000Z',
        locations: [],
        routes: [routeWithPrivateNotes],
      },
      { includePrivateNotes: true }
    );

    expect(result.routes[0].notes).toBe('SECRET PLATFORM 9');
    expect(result.routes[0].subRoutes?.[0]?.notes).toBe('SECRET SUBROUTE PNR');
  });
});
