import { act, renderHook, waitFor } from '@testing-library/react';
import { useTripEditor } from '@/app/admin/edit/[tripId]/hooks/useTripEditor';
import { getLinkedExpenses } from '@/app/lib/costLinkCleanup';
import { syncOfflineDeltaQueue } from '@/app/lib/offlineDeltaSync';
import type { TravelData } from '@/app/types';

jest.mock('@/app/lib/costLinkCleanup', () => ({
  getLinkedExpenses: jest.fn(),
  cleanupExpenseLinks: jest.fn(),
  reassignExpenseLinks: jest.fn()
}));

jest.mock('@/app/lib/offlineDeltaSync', () => ({
  formatOfflineConflictMessage: jest.fn(() => 'conflict'),
  hasPendingOfflineDeltaForTravelId: jest.fn(() => false),
  queueTravelDelta: jest.fn(() => ({ queued: false, pendingCount: 0 })),
  syncOfflineDeltaQueue: jest.fn(async () => ({
    synced: 0,
    conflicts: 0,
    failed: 0,
    remainingPending: 0,
    remainingConflicts: 0
  }))
}));

const mockGetLinkedExpenses = jest.mocked(getLinkedExpenses);
const mockSyncOfflineDeltaQueue = jest.mocked(syncOfflineDeltaQueue);
const mockFetch = jest.fn();

global.fetch = mockFetch;

const createTravelData = (overrides: Partial<TravelData> = {}): TravelData => ({
  id: 'trip-1',
  title: 'Test Trip',
  description: '',
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-01-02'),
  instagramUsername: '',
  locations: [],
  routes: [],
  accommodations: [],
  ...overrides
});

describe('useTripEditor delete confirmations', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => []
    } as Response);

    mockGetLinkedExpenses.mockResolvedValue([]);
  });

  it('requires confirmation before deleting a location without linked expenses', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
    const { result } = renderHook(() => useTripEditor(null));

    act(() => {
      result.current.setTravelData(prev => ({
        ...prev,
        locations: [
          {
            id: 'location-1',
            name: 'Paris',
            coordinates: [48.8566, 2.3522],
            date: new Date('2025-01-01'),
            notes: '',
            instagramPosts: [],
            tikTokPosts: [],
            blogPosts: [],
            accommodationData: '',
            isAccommodationPublic: false,
            accommodationIds: [],
            costTrackingLinks: []
          }
        ]
      }));
    });

    await act(async () => {
      await result.current.deleteLocation(0);
    });

    expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to delete location "Paris"?');
    expect(result.current.travelData.locations).toHaveLength(1);

    confirmSpy.mockRestore();
  });

  it('requires confirmation before deleting a route without linked expenses', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
    const { result } = renderHook(() => useTripEditor(null));

    act(() => {
      result.current.setTravelData(prev => ({
        ...prev,
        routes: [
          {
            id: 'route-1',
            from: 'Paris',
            to: 'Rome',
            fromCoords: [48.8566, 2.3522],
            toCoords: [41.9028, 12.4964],
            transportType: 'train',
            date: new Date('2025-01-02'),
            notes: '',
            privateNotes: '',
            costTrackingLinks: []
          }
        ]
      }));
    });

    await act(async () => {
      await result.current.deleteRoute(0);
    });

    expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to delete route "Paris → Rome"?');
    expect(result.current.travelData.routes).toHaveLength(1);

    confirmSpy.mockRestore();
  });

  it('clears stale unsaved state after the active offline trip delta syncs successfully', async () => {
    const syncedSnapshot = createTravelData();
    const { result } = renderHook(() => useTripEditor(null));

    act(() => {
      result.current.setMode('edit');
      result.current.setTravelData(syncedSnapshot);
      result.current.setHasUnsavedChanges(true);
    });

    await waitFor(() => {
      expect(mockSyncOfflineDeltaQueue).toHaveBeenCalled();
    });

    const syncOptions = mockSyncOfflineDeltaQueue.mock.calls.at(-1)?.[0];
    expect(syncOptions?.onSynced).toBeDefined();

    act(() => {
      syncOptions?.onSynced?.({
        kind: 'travel',
        id: syncedSnapshot.id!,
        queuedAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        status: 'pending',
        baseSnapshot: createTravelData({ title: 'Base Trip' }),
        pendingSnapshot: syncedSnapshot,
        delta: {}
      });
    });

    expect(result.current.hasUnsavedChanges).toBe(false);

    const fetchCallsBeforeAutosave = mockFetch.mock.calls.length;

    await act(async () => {
      await expect(result.current.autoSaveTravelData()).resolves.toBe(true);
    });

    expect(mockFetch).toHaveBeenCalledTimes(fetchCallsBeforeAutosave);
  });

  it('keeps unsaved state when newer local edits exist after an offline sync succeeds', async () => {
    const syncedSnapshot = createTravelData();
    const newerLocalSnapshot = createTravelData({ title: 'Updated Locally' });
    const { result } = renderHook(() => useTripEditor(null));

    act(() => {
      result.current.setMode('edit');
      result.current.setTravelData(syncedSnapshot);
      result.current.setTravelData(newerLocalSnapshot);
      result.current.setHasUnsavedChanges(true);
    });

    await waitFor(() => {
      expect(mockSyncOfflineDeltaQueue).toHaveBeenCalled();
    });

    const syncOptions = mockSyncOfflineDeltaQueue.mock.calls.at(-1)?.[0];
    expect(syncOptions?.onSynced).toBeDefined();

    act(() => {
      syncOptions?.onSynced?.({
        kind: 'travel',
        id: syncedSnapshot.id!,
        queuedAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        status: 'pending',
        baseSnapshot: createTravelData({ title: 'Base Trip' }),
        pendingSnapshot: syncedSnapshot,
        delta: {}
      });
    });

    expect(result.current.hasUnsavedChanges).toBe(true);
  });
});
