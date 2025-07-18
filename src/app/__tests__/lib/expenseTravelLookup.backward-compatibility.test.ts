/**
 * Backward compatibility tests for ExpenseTravelLookup service
 */

import { createExpenseTravelLookup } from '../../lib/expenseTravelLookup';

// Mock fetch for testing
global.fetch = jest.fn();

describe('ExpenseTravelLookup Backward Compatibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
      
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3000/api/travel-data?id=test-trip');
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

    it('should use window.location.origin in browser environment', async () => {
      // Mock window object
      const originalWindow = global.window;
      global.window = {
        location: {
          origin: 'https://example.com'
        }
      } as any;

      const mockTripData = {
        title: 'Test Trip',
        locations: [],
        accommodations: [],
        routes: []
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        json: () => Promise.resolve(mockTripData)
      });

      await createExpenseTravelLookup('test-trip');
      
      expect(global.fetch).toHaveBeenCalledWith('https://example.com/api/travel-data?id=test-trip');

      // Restore original window
      global.window = originalWindow;
    });
  });
});