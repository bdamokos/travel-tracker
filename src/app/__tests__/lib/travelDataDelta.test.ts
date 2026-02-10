import { describe, it, expect } from '@jest/globals';
import { TravelData, Location, TravelRoute } from '@/app/types';
import {
  applyTravelDataDelta,
  createTravelDataDelta,
  isTravelDataDelta,
  isTravelDataDeltaEmpty,
  TravelDataDelta
} from '@/app/lib/travelDataDelta';

const baseDate = new Date('2025-01-01T00:00:00.000Z');

const buildLocation = (id: string, name: string): Location => ({
  id,
  name,
  coordinates: [47.5, 19.0],
  date: baseDate,
  notes: '',
  instagramPosts: [],
  tikTokPosts: [],
  blogPosts: [],
  accommodationIds: [],
  costTrackingLinks: []
});

const buildRoute = (id: string, from: string, to: string): TravelRoute => ({
  id,
  from,
  to,
  fromCoords: [47.5, 19.0],
  toCoords: [48.1, 17.1],
  transportType: 'train',
  date: baseDate,
  notes: '',
  costTrackingLinks: []
});

const buildTravelData = (): TravelData => ({
  id: 'trip-1',
  title: 'Trip',
  description: 'desc',
  startDate: baseDate,
  endDate: baseDate,
  instagramUsername: 'user',
  locations: [buildLocation('loc-1', 'Budapest')],
  routes: [buildRoute('route-1', 'Budapest', 'Vienna')],
  accommodations: []
});

describe('travelDataDelta', () => {
  it('creates a minimal delta for added locations', () => {
    const previous = buildTravelData();
    const current: TravelData = {
      ...previous,
      locations: [...previous.locations, buildLocation('loc-2', 'Vienna')]
    };

    const delta = createTravelDataDelta(previous, current);

    expect(delta).not.toBeNull();
    expect(delta?.locations?.added).toHaveLength(1);
    expect(delta?.locations?.added?.[0].id).toBe('loc-2');
    expect(delta?.locations?.updated).toBeUndefined();
    expect(delta?.locations?.removedIds).toBeUndefined();
  });

  it('does not imply deletion when delta only adds one location', () => {
    const previous = buildTravelData();

    const delta: TravelDataDelta = {
      locations: {
        added: [buildLocation('loc-2', 'Vienna')]
      }
    };

    const merged = applyTravelDataDelta(previous, delta);

    expect(merged.locations.map((location) => location.id)).toEqual(['loc-1', 'loc-2']);
  });

  it('ignores dirty updates for unknown IDs instead of deleting existing data', () => {
    const previous = buildTravelData();

    const delta: TravelDataDelta = {
      locations: {
        updated: [{ id: 'missing-location', name: 'Should Not Exist' }]
      },
      routes: {
        updated: [{ id: 'missing-route', from: 'X', to: 'Y' }]
      }
    };

    const merged = applyTravelDataDelta(previous, delta);

    expect(merged.locations).toHaveLength(1);
    expect(merged.locations[0].id).toBe('loc-1');
    expect(merged.routes).toHaveLength(1);
    expect(merged.routes[0].id).toBe('route-1');
  });

  it('removes entries only when removedIds is explicitly provided', () => {
    const previous = buildTravelData();

    const delta: TravelDataDelta = {
      locations: {
        removedIds: ['loc-1']
      }
    };

    const merged = applyTravelDataDelta(previous, delta);
    expect(merged.locations).toHaveLength(0);
  });

  it('validates delta payload shape', () => {
    expect(isTravelDataDelta({ locations: { added: [] } })).toBe(true);
    expect(isTravelDataDelta({ locations: [] })).toBe(false);
    expect(isTravelDataDelta({ routes: { removedIds: 'not-array' } })).toBe(false);
  });

  it('detects empty delta payload', () => {
    expect(isTravelDataDeltaEmpty({})).toBe(true);
    expect(isTravelDataDeltaEmpty({ title: 'Changed' })).toBe(false);
  });
});
