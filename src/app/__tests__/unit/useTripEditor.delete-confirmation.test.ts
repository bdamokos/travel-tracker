import { act, renderHook } from '@testing-library/react';
import { useTripEditor } from '@/app/admin/edit/[tripId]/hooks/useTripEditor';
import { getLinkedExpenses } from '@/app/lib/costLinkCleanup';

jest.mock('@/app/lib/costLinkCleanup', () => ({
  getLinkedExpenses: jest.fn(),
  cleanupExpenseLinks: jest.fn(),
  reassignExpenseLinks: jest.fn()
}));

const mockGetLinkedExpenses = jest.mocked(getLinkedExpenses);
const mockFetch = jest.fn();

global.fetch = mockFetch;

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
});
