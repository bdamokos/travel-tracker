import { getCurrentTripStatus, LocationTiming, RouteTiming } from '@/app/lib/currentTripStatus';

// Helper: UTC midnight date string for a given YYYY-MM-DD
const utc = (ymd: string) => `${ymd}T00:00:00Z`;

describe('getCurrentTripStatus', () => {
  it('returns travel message when a route has departureTime today', () => {
    const locations: LocationTiming[] = [
      { name: 'Puno', date: utc('2024-02-04'), endDate: utc('2024-02-06') },
    ];
    const routes: RouteTiming[] = [
      { from: 'Puno', to: 'Cusco', departureTime: utc('2024-02-06') },
    ];
    const now = new Date('2024-02-06T10:00:00Z');
    expect(getCurrentTripStatus(locations, routes, now)).toBe(
      'Current location: Travelling today between Puno and Cusco'
    );
  });

  it('returns travel message when two locations overlap today', () => {
    const locations: LocationTiming[] = [
      { name: 'Puno', date: utc('2024-02-04'), endDate: utc('2024-02-06') },
      { name: 'Cusco', date: utc('2024-02-06'), endDate: utc('2024-02-10') },
    ];
    // Route exists but has NO departureTime — the route loop won't match
    const routes: RouteTiming[] = [
      { from: 'Puno', to: 'Cusco' },
    ];
    const now = new Date('2024-02-06T10:00:00Z');
    expect(getCurrentTripStatus(locations, routes, now)).toBe(
      'Current location: Travelling today between Puno and Cusco'
    );
  });

  it('uses route from/to names when route matches overlapping locations', () => {
    const locations: LocationTiming[] = [
      { name: 'puno', date: utc('2024-02-04'), endDate: utc('2024-02-06') },
      { name: 'cusco', date: utc('2024-02-06'), endDate: utc('2024-02-10') },
    ];
    const routes: RouteTiming[] = [
      { from: 'Puno', to: 'Cusco' },
    ];
    const now = new Date('2024-02-06T10:00:00Z');
    // Should use the route's casing, not the location's
    expect(getCurrentTripStatus(locations, routes, now)).toBe(
      'Current location: Travelling today between Puno and Cusco'
    );
  });

  it('returns travel message for single location on last day with route from it', () => {
    const locations: LocationTiming[] = [
      { name: 'Puno', date: utc('2024-02-04'), endDate: utc('2024-02-06') },
      // Cusco starts tomorrow
      { name: 'Cusco', date: utc('2024-02-07'), endDate: utc('2024-02-10') },
    ];
    const routes: RouteTiming[] = [
      { from: 'Puno', to: 'Cusco' },
    ];
    const now = new Date('2024-02-06T10:00:00Z');
    expect(getCurrentTripStatus(locations, routes, now)).toBe(
      'Current location: Travelling today between Puno and Cusco'
    );
  });

  it('returns static location for normal single location (not last day)', () => {
    const locations: LocationTiming[] = [
      { name: 'Lima', date: utc('2024-02-01'), endDate: utc('2024-02-10') },
    ];
    const routes: RouteTiming[] = [];
    const now = new Date('2024-02-05T10:00:00Z');
    expect(getCurrentTripStatus(locations, routes, now)).toBe(
      'Current location: Lima'
    );
  });

  it('returns excursion message for side trip location', () => {
    const locations: LocationTiming[] = [
      { name: 'Sacred Valley', date: utc('2024-02-05'), endDate: utc('2024-02-06'), notes: 'sidetrip from Cusco' },
    ];
    const routes: RouteTiming[] = [];
    const now = new Date('2024-02-05T10:00:00Z');
    expect(getCurrentTripStatus(locations, routes, now)).toBe(
      'Current location: Excursion to Sacred Valley'
    );
  });

  it('returns null when no data matches today', () => {
    const locations: LocationTiming[] = [
      { name: 'Lima', date: utc('2024-01-01'), endDate: utc('2024-01-05') },
    ];
    const routes: RouteTiming[] = [];
    const now = new Date('2024-02-06T10:00:00Z');
    expect(getCurrentTripStatus(locations, routes, now)).toBeNull();
  });

  it('returns static location when on last day but no route from it', () => {
    const locations: LocationTiming[] = [
      { name: 'Puno', date: utc('2024-02-04'), endDate: utc('2024-02-06') },
    ];
    const routes: RouteTiming[] = [];
    const now = new Date('2024-02-06T10:00:00Z');
    expect(getCurrentTripStatus(locations, routes, now)).toBe(
      'Current location: Puno'
    );
  });
});
