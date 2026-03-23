/** @jest-environment jsdom */

import {
  discardOfflineConflictEntries,
  getOfflineQueueEntries,
  queueCostDelta,
  queueTravelDelta,
  syncOfflineDeltaQueue
} from '@/app/lib/offlineDeltaSync';
import type { CostTrackingData, TravelData } from '@/app/types';

const makeTravelData = (overrides: Partial<TravelData> = {}): TravelData => ({
  id: 'trip-1',
  title: 'Base Trip',
  description: 'Base Description',
  startDate: new Date('2026-01-10'),
  endDate: new Date('2026-01-20'),
  instagramUsername: '',
  locations: [
    {
      id: 'loc-1',
      name: 'Budapest',
      coordinates: [47.4979, 19.0402],
      date: new Date('2026-01-10'),
      notes: ''
    }
  ],
  routes: [
    {
      id: 'route-1',
      from: 'Budapest',
      to: 'Vienna',
      fromCoords: [47.4979, 19.0402],
      toCoords: [48.2082, 16.3738],
      transportType: 'train',
      date: new Date('2026-01-12'),
      notes: ''
    }
  ],
  accommodations: [],
  ...overrides
});

const makeCostData = (overrides: Partial<CostTrackingData> = {}): CostTrackingData => ({
  id: 'cost-trip-1',
  tripId: 'trip-1',
  tripTitle: 'Base Trip',
  tripStartDate: new Date('2026-01-10'),
  tripEndDate: new Date('2026-01-20'),
  overallBudget: 1000,
  reservedBudget: 100,
  currency: 'EUR',
  countryBudgets: [],
  expenses: [],
  customCategories: ['Food'],
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides
});

describe('offlineDeltaSync', () => {
  const makeResponse = <T>(payload: T, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload)
  });

  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
    (global.fetch as unknown as jest.Mock | undefined)?.mockReset?.();
  });

  it('syncs queued travel deltas when server base has not changed', async () => {
    const base = makeTravelData();
    const pending = makeTravelData({ title: 'Updated Trip Title' });

    const queued = queueTravelDelta({
      id: base.id || 'trip-1',
      baseSnapshot: base,
      pendingSnapshot: pending
    });
    expect(queued.queued).toBe(true);

    const fetchMock = jest.fn()
      .mockResolvedValueOnce(makeResponse(base))
      .mockResolvedValueOnce(makeResponse({ success: true }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const summary = await syncOfflineDeltaQueue();

    expect(summary.synced).toBe(1);
    expect(summary.conflicts).toBe(0);
    expect(summary.remainingPending).toBe(0);
    expect(getOfflineQueueEntries()).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain('/api/travel-data?id=');
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'PATCH' });
  });

  it('marks travel entry as conflict and exposes pending delta when server changed', async () => {
    const base = makeTravelData();
    const pending = makeTravelData({ title: 'Offline Title Change' });
    const serverChanged = makeTravelData({ description: 'Server changed while offline' });

    queueTravelDelta({
      id: base.id || 'trip-1',
      baseSnapshot: base,
      pendingSnapshot: pending
    });

    const fetchMock = jest.fn().mockResolvedValueOnce(makeResponse(serverChanged));
    global.fetch = fetchMock as unknown as typeof fetch;

    const onConflict = jest.fn();
    const summary = await syncOfflineDeltaQueue({ onConflict });

    expect(summary.synced).toBe(0);
    expect(summary.conflicts).toBe(1);
    expect(summary.remainingConflicts).toBe(1);
    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(onConflict.mock.calls[0][0]).toMatchObject({
      kind: 'travel',
      pendingDelta: expect.objectContaining({
        title: 'Offline Title Change'
      })
    });

    const entries = getOfflineQueueEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: 'travel',
      status: 'conflict'
    });
  });

  it('does not false-conflict when the server omits editor-default empty travel fields', async () => {
    const base = makeTravelData({
      locations: [
        {
          id: 'loc-1',
          name: 'Budapest',
          coordinates: [47.4979, 19.0402],
          date: new Date('2026-01-10'),
          notes: '',
          instagramPosts: [],
          tikTokPosts: [],
          blogPosts: [],
          isAccommodationPublic: false,
          accommodationIds: [],
          costTrackingLinks: []
        }
      ],
      routes: [
        {
          id: 'route-1',
          from: 'Budapest',
          to: 'Vienna',
          fromCoords: [47.4979, 19.0402],
          toCoords: [48.2082, 16.3738],
          transportType: 'train',
          date: new Date('2026-01-12'),
          notes: '',
          costTrackingLinks: [],
          subRoutes: []
        }
      ]
    });
    const pending = makeTravelData({ ...base, title: 'Updated Trip Title' });
    const serverOmittingDefaults = makeTravelData({
      ...base,
      locations: [
        {
          id: 'loc-1',
          name: 'Budapest',
          coordinates: [47.4979, 19.0402],
          date: new Date('2026-01-10')
        }
      ],
      routes: [
        {
          id: 'route-1',
          from: 'Budapest',
          to: 'Vienna',
          fromCoords: [47.4979, 19.0402],
          toCoords: [48.2082, 16.3738],
          transportType: 'train',
          date: new Date('2026-01-12')
        }
      ]
    });

    queueTravelDelta({
      id: base.id || 'trip-1',
      baseSnapshot: base,
      pendingSnapshot: pending
    });

    const fetchMock = jest.fn()
      .mockResolvedValueOnce(makeResponse(serverOmittingDefaults))
      .mockResolvedValueOnce(makeResponse({ success: true }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const summary = await syncOfflineDeltaQueue();

    expect(summary.synced).toBe(1);
    expect(summary.conflicts).toBe(0);
    expect(getOfflineQueueEntries()).toHaveLength(0);
  });

  it('does not false-conflict when only empty notes are omitted by the server', async () => {
    const base = makeTravelData({
      locations: [
        {
          id: 'loc-1',
          name: 'Budapest',
          coordinates: [47.4979, 19.0402],
          date: new Date('2026-01-10'),
          notes: ''
        }
      ],
      routes: [
        {
          id: 'route-1',
          from: 'Budapest',
          to: 'Vienna',
          fromCoords: [47.4979, 19.0402],
          toCoords: [48.2082, 16.3738],
          transportType: 'train',
          date: new Date('2026-01-12'),
          notes: ''
        }
      ]
    });
    const pending = makeTravelData({ ...base, title: 'Updated Trip Title' });
    const serverOmittingNotes = makeTravelData({
      ...base,
      locations: [
        {
          id: 'loc-1',
          name: 'Budapest',
          coordinates: [47.4979, 19.0402],
          date: new Date('2026-01-10')
        }
      ],
      routes: [
        {
          id: 'route-1',
          from: 'Budapest',
          to: 'Vienna',
          fromCoords: [47.4979, 19.0402],
          toCoords: [48.2082, 16.3738],
          transportType: 'train',
          date: new Date('2026-01-12')
        }
      ]
    });

    queueTravelDelta({
      id: base.id || 'trip-1',
      baseSnapshot: base,
      pendingSnapshot: pending
    });

    const fetchMock = jest.fn()
      .mockResolvedValueOnce(makeResponse(serverOmittingNotes))
      .mockResolvedValueOnce(makeResponse({ success: true }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const summary = await syncOfflineDeltaQueue();

    expect(summary.synced).toBe(1);
    expect(summary.conflicts).toBe(0);
  });

  it('still conflicts when the server changes a real route or location field', async () => {
    const base = makeTravelData();
    const pending = makeTravelData({ title: 'Offline Title Change' });
    const serverChanged = makeTravelData({
      locations: [
        {
          id: 'loc-1',
          name: 'Prague',
          coordinates: [47.4979, 19.0402],
          date: new Date('2026-01-10'),
          notes: ''
        }
      ],
      routes: base.routes
    });

    queueTravelDelta({
      id: base.id || 'trip-1',
      baseSnapshot: base,
      pendingSnapshot: pending
    });

    const fetchMock = jest.fn().mockResolvedValueOnce(makeResponse(serverChanged));
    global.fetch = fetchMock as unknown as typeof fetch;

    const summary = await syncOfflineDeltaQueue();

    expect(summary.synced).toBe(0);
    expect(summary.conflicts).toBe(1);
    expect(getOfflineQueueEntries()[0]).toMatchObject({
      kind: 'travel',
      status: 'conflict'
    });
  });

  it('does not false-conflict when the server returns equivalent travel dates as ISO strings', async () => {
    const base = makeTravelData({
      locations: [
        {
          id: 'loc-1',
          name: 'Budapest',
          coordinates: [47.4979, 19.0402],
          date: new Date('2026-01-10T05:00:00.000Z'),
          notes: '',
          instagramPosts: [],
          tikTokPosts: [],
          blogPosts: [],
          isAccommodationPublic: false,
          accommodationIds: [],
          costTrackingLinks: []
        }
      ],
      routes: [
        {
          id: 'route-1',
          from: 'Budapest',
          to: 'Vienna',
          fromCoords: [47.4979, 19.0402],
          toCoords: [48.2082, 16.3738],
          transportType: 'train',
          date: new Date('2026-01-12T05:00:00.000Z'),
          duration: '2h 30m',
          notes: '',
          costTrackingLinks: [],
          subRoutes: []
        }
      ]
    });
    const pending = makeTravelData({ ...base, title: 'Updated Trip Title' });
    const serverIsoStrings = {
      ...base,
      startDate: '2026-01-10T05:00:00.000Z',
      endDate: '2026-01-20T05:00:00.000Z',
      locations: [
        {
          id: 'loc-1',
          name: 'Budapest',
          coordinates: [47.4979, 19.0402],
          date: '2026-01-10T00:00:00.000Z',
          notes: '',
          instagramPosts: [],
          tikTokPosts: [],
          blogPosts: [],
          isAccommodationPublic: false,
          accommodationIds: [],
          costTrackingLinks: []
        }
      ],
      routes: [
        {
          id: 'route-1',
          from: 'Budapest',
          to: 'Vienna',
          fromCoords: [47.4979, 19.0402],
          toCoords: [48.2082, 16.3738],
          transportType: 'train',
          date: '2026-01-12T00:00:00.000Z',
          duration: '2h 30m',
          notes: '',
          subRoutes: [],
          costTrackingLinks: []
        }
      ]
    };

    queueTravelDelta({
      id: base.id || 'trip-1',
      baseSnapshot: base,
      pendingSnapshot: pending
    });

    const fetchMock = jest.fn()
      .mockResolvedValueOnce(makeResponse(serverIsoStrings))
      .mockResolvedValueOnce(makeResponse({ success: true }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const summary = await syncOfflineDeltaQueue();

    expect(summary.synced).toBe(1);
    expect(summary.conflicts).toBe(0);
    expect(getOfflineQueueEntries()).toHaveLength(0);
  });

  it('syncs a pending cost delta after a related travel title sync updates server trip metadata', async () => {
    const baseTravel = makeTravelData({ title: 'Offline QA Trip' });
    const pendingTravel = makeTravelData({ title: 'Offline QA Trip Updated' });
    const baseCost = makeCostData({
      id: 'cost-trip-1',
      tripId: baseTravel.id || 'trip-1',
      tripTitle: baseTravel.title,
      overallBudget: 1000
    });
    const pendingCost = makeCostData({
      ...baseCost,
      overallBudget: 1200
    });
    const serverCostAfterTravelSync = makeCostData({
      ...baseCost,
      tripTitle: pendingTravel.title,
      overallBudget: 1000
    });

    queueTravelDelta({
      id: baseTravel.id || 'trip-1',
      baseSnapshot: baseTravel,
      pendingSnapshot: pendingTravel
    });
    queueCostDelta({
      id: baseCost.id,
      baseSnapshot: baseCost,
      pendingSnapshot: pendingCost
    });

    const fetchMock = jest.fn()
      .mockResolvedValueOnce(makeResponse(baseTravel))
      .mockResolvedValueOnce(makeResponse({ success: true }))
      .mockResolvedValueOnce(makeResponse(serverCostAfterTravelSync))
      .mockResolvedValueOnce(makeResponse({ success: true }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const summary = await syncOfflineDeltaQueue();

    expect(summary.synced).toBe(2);
    expect(summary.conflicts).toBe(0);
    expect(summary.remainingPending).toBe(0);
    expect(getOfflineQueueEntries()).toHaveLength(0);
  });

  it('syncs queued cost delta when server base has not changed', async () => {
    const base = makeCostData();
    const pending = makeCostData({ overallBudget: 1500 });

    const queued = queueCostDelta({
      id: base.id,
      baseSnapshot: base,
      pendingSnapshot: pending
    });
    expect(queued.queued).toBe(true);

    const fetchMock = jest.fn()
      .mockResolvedValueOnce(makeResponse(base))
      .mockResolvedValueOnce(makeResponse({ success: true }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const summary = await syncOfflineDeltaQueue();

    expect(summary.synced).toBe(1);
    expect(summary.conflicts).toBe(0);
    expect(getOfflineQueueEntries()).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain('/api/cost-tracking?id=');
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'PATCH' });
  });

  it('discards conflicted queue entries when requested', async () => {
    const base = makeTravelData();
    const pending = makeTravelData({ title: 'Offline Title Change' });
    const serverChanged = makeTravelData({ description: 'Server changed while offline' });

    queueTravelDelta({
      id: base.id || 'trip-1',
      baseSnapshot: base,
      pendingSnapshot: pending
    });

    const fetchMock = jest.fn().mockResolvedValueOnce(makeResponse(serverChanged));
    global.fetch = fetchMock as unknown as typeof fetch;

    await syncOfflineDeltaQueue();
    expect(getOfflineQueueEntries()).toHaveLength(1);

    const result = discardOfflineConflictEntries();

    expect(result).toMatchObject({
      removed: 1,
      remainingConflicts: 0
    });
    expect(getOfflineQueueEntries()).toHaveLength(0);
  });
});
