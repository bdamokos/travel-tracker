/**
 * Backward compatibility tests for ExpenseTravelLookup service
 */

import { createExpenseTravelLookup } from '../../lib/expenseTravelLookup';

describe('ExpenseTravelLookup Backward Compatibility', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    // First ensure global.fetch exists (jsdom doesn't have it by default)
    // Then spy on it so jest.restoreAllMocks() can properly clean up
    global.fetch = jest.fn();
    jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    // Restore original fetch (or undefined if it didn't exist)
    global.fetch = originalFetch;
  });

  describe('createExpenseTravelLookup (deprecated)', () => {
    it('should still work for backward compatibility', async () => {
      const mockTripData = {
        title: 'Test Trip',
        locations: [
          {
            id: 'loc1',
            name: 'Paris',
            coordinates: [48.8566, 2.3522],
            date: new Date('2024-01-01'),
            costTrackingLinks: [
              { expenseId: 'exp1', description: 'Test expense' }
            ],
            createdAt: '2024-01-01T00:00:00Z'
          }
        ],
        accommodations: [],
        routes: []
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        json: () => Promise.resolve(mockTripData)
      });

      const lookup = await createExpenseTravelLookup('test-trip');

      expect(global.fetch).toHaveBeenCalledWith(`${window.location.origin}/api/travel-data?id=test-trip`);
      expect(lookup.getTravelLinkForExpense('exp1')).toEqual({
        type: 'location',
        id: 'loc1',
        name: 'Paris',
        tripTitle: 'Test Trip'
      });
    });

    it('should handle fetch errors gracefully', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      await expect(createExpenseTravelLookup('test-trip')).rejects.toThrow('Network error');
    });
  });
});
