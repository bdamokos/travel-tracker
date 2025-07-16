/**
 * Tests for data migration system
 */

import {
  migrateFromV3ToV4,
  migrateToLatestSchema,
  CURRENT_SCHEMA_VERSION,
  UnifiedTripData
} from '../../lib/dataMigration';

describe('Data Migration System', () => {
  describe('migrateFromV3ToV4', () => {
    it('should remove invalid expense links from locations', () => {
      const testData: UnifiedTripData = {
        schemaVersion: 3,
        id: 'test-trip-1',
        title: 'Test Trip',
        description: 'Test Description',
        startDate: '2024-01-01',
        endDate: '2024-01-10',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        travelData: {
          locations: [
            {
              id: 'loc-1',
              name: 'Location 1',
              coordinates: [40.7128, -74.0060],
              date: new Date('2024-01-01'),
              costTrackingLinks: [
                { expenseId: 'expense-1', description: 'Valid expense' },
                { expenseId: 'expense-invalid', description: 'Invalid expense' }
              ]
            }
          ]
        },
        costData: {
          overallBudget: 1000,
          currency: 'USD',
          countryBudgets: [],
          expenses: [
            {
              id: 'expense-1',
              date: new Date('2024-01-01'),
              amount: 100,
              currency: 'USD',
              category: 'Food',
              country: 'USA',
              description: 'Valid expense',
              expenseType: 'actual'
            }
          ]
        }
      };

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const result = migrateFromV3ToV4(testData);

      expect(result.schemaVersion).toBe(4);
      expect(result.travelData?.locations?.[0].costTrackingLinks).toHaveLength(1);
      expect(result.travelData?.locations?.[0].costTrackingLinks?.[0].expenseId).toBe('expense-1');
      expect(consoleSpy).toHaveBeenCalledWith(
        'Trip test-trip-1 v3→v4 migration cleanup:',
        ['Removed invalid expense link expense-invalid from location loc-1']
      );

      consoleSpy.mockRestore();
    });

    it('should remove invalid expense links from accommodations', () => {
      const testData: UnifiedTripData = {
        schemaVersion: 3,
        id: 'test-trip-2',
        title: 'Test Trip 2',
        description: 'Test Description',
        startDate: '2024-01-01',
        endDate: '2024-01-10',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        accommodations: [
          {
            id: 'acc-1',
            name: 'Hotel 1',
            locationId: 'loc-1',
            createdAt: '2024-01-01T00:00:00Z',
            costTrackingLinks: [
              { expenseId: 'expense-1', description: 'Valid expense' },
              { expenseId: 'expense-invalid', description: 'Invalid expense' }
            ]
          }
        ],
        costData: {
          overallBudget: 1000,
          currency: 'USD',
          countryBudgets: [],
          expenses: [
            {
              id: 'expense-1',
              date: new Date('2024-01-01'),
              amount: 200,
              currency: 'USD',
              category: 'Accommodation',
              country: 'USA',
              description: 'Valid expense',
              expenseType: 'actual'
            }
          ]
        }
      };

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const result = migrateFromV3ToV4(testData);

      expect(result.schemaVersion).toBe(4);
      expect(result.accommodations?.[0].costTrackingLinks).toHaveLength(1);
      expect(result.accommodations?.[0].costTrackingLinks?.[0].expenseId).toBe('expense-1');
      expect(consoleSpy).toHaveBeenCalledWith(
        'Trip test-trip-2 v3→v4 migration cleanup:',
        ['Removed invalid expense link expense-invalid from accommodation acc-1']
      );

      consoleSpy.mockRestore();
    });

    it('should remove invalid expense links from routes', () => {
      const testData: UnifiedTripData = {
        schemaVersion: 3,
        id: 'test-trip-3',
        title: 'Test Trip 3',
        description: 'Test Description',
        startDate: '2024-01-01',
        endDate: '2024-01-10',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        travelData: {
          routes: [
            {
              id: 'route-1',
              type: 'train',
              from: 'City A',
              to: 'City B',
              costTrackingLinks: [
                { expenseId: 'expense-1', description: 'Valid expense' },
                { expenseId: 'expense-invalid', description: 'Invalid expense' }
              ]
            }
          ]
        },
        costData: {
          overallBudget: 1000,
          currency: 'USD',
          countryBudgets: [],
          expenses: [
            {
              id: 'expense-1',
              date: new Date('2024-01-01'),
              amount: 50,
              currency: 'USD',
              category: 'Transportation',
              country: 'USA',
              description: 'Valid expense',
              expenseType: 'actual'
            }
          ]
        }
      };

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const result = migrateFromV3ToV4(testData);

      expect(result.schemaVersion).toBe(4);
      expect(result.travelData?.routes?.[0].costTrackingLinks).toHaveLength(1);
      expect(result.travelData?.routes?.[0].costTrackingLinks?.[0].expenseId).toBe('expense-1');
      expect(consoleSpy).toHaveBeenCalledWith(
        'Trip test-trip-3 v3→v4 migration cleanup:',
        ['Removed invalid expense link expense-invalid from route route-1']
      );

      consoleSpy.mockRestore();
    });

    it('should preserve valid expense links', () => {
      const testData: UnifiedTripData = {
        schemaVersion: 3,
        id: 'test-trip-4',
        title: 'Test Trip 4',
        description: 'Test Description',
        startDate: '2024-01-01',
        endDate: '2024-01-10',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        travelData: {
          locations: [
            {
              id: 'loc-1',
              name: 'Location 1',
              coordinates: [40.7128, -74.0060],
              date: new Date('2024-01-01'),
              costTrackingLinks: [
                { expenseId: 'expense-1', description: 'Valid expense' },
                { expenseId: 'expense-2', description: 'Another valid expense' }
              ]
            }
          ]
        },
        costData: {
          overallBudget: 1000,
          currency: 'USD',
          countryBudgets: [],
          expenses: [
            {
              id: 'expense-1',
              date: new Date('2024-01-01'),
              amount: 100,
              currency: 'USD',
              category: 'Food',
              country: 'USA',
              description: 'Valid expense',
              expenseType: 'actual'
            },
            {
              id: 'expense-2',
              date: new Date('2024-01-02'),
              amount: 50,
              currency: 'USD',
              category: 'Food',
              country: 'USA',
              description: 'Another valid expense',
              expenseType: 'actual'
            }
          ]
        }
      };

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const result = migrateFromV3ToV4(testData);

      expect(result.schemaVersion).toBe(4);
      expect(result.travelData?.locations?.[0].costTrackingLinks).toHaveLength(2);
      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle data without cost tracking links', () => {
      const testData: UnifiedTripData = {
        schemaVersion: 3,
        id: 'test-trip-5',
        title: 'Test Trip 5',
        description: 'Test Description',
        startDate: '2024-01-01',
        endDate: '2024-01-10',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        travelData: {
          locations: [
            {
              id: 'loc-1',
              name: 'Location 1',
              coordinates: [40.7128, -74.0060],
              date: new Date('2024-01-01')
            }
          ]
        }
      };

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const result = migrateFromV3ToV4(testData);

      expect(result.schemaVersion).toBe(4);
      expect(result.travelData?.locations?.[0].costTrackingLinks).toEqual([]);
      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should update the updatedAt timestamp', () => {
      const testData: UnifiedTripData = {
        schemaVersion: 3,
        id: 'test-trip-6',
        title: 'Test Trip 6',
        description: 'Test Description',
        startDate: '2024-01-01',
        endDate: '2024-01-10',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      };

      const originalUpdatedAt = testData.updatedAt;
      const result = migrateFromV3ToV4(testData);

      expect(result.updatedAt).not.toBe(originalUpdatedAt);
      expect(new Date(result.updatedAt).getTime()).toBeGreaterThan(new Date(originalUpdatedAt).getTime());
    });
  });

  describe('migrateToLatestSchema', () => {
    it('should include v3 to v4 migration in the chain', () => {
      const testData: UnifiedTripData = {
        schemaVersion: 3,
        id: 'test-trip-7',
        title: 'Test Trip 7',
        description: 'Test Description',
        startDate: '2024-01-01',
        endDate: '2024-01-10',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        travelData: {
          locations: [
            {
              id: 'loc-1',
              name: 'Location 1',
              coordinates: [40.7128, -74.0060],
              date: new Date('2024-01-01'),
              costTrackingLinks: [
                { expenseId: 'expense-invalid', description: 'Invalid expense' }
              ]
            }
          ]
        }
      };

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const result = migrateToLatestSchema(testData);

      expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(result.travelData?.locations?.[0].costTrackingLinks).toHaveLength(0);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Trip test-trip-7 v3→v4 migration cleanup:',
        ['Removed invalid expense link expense-invalid from location loc-1']
      );

      consoleSpy.mockRestore();
    });

    it('should migrate from v1 through v4 correctly', () => {
      // This would be a more complex test that starts with v1 data
      // and ensures it goes through all migrations correctly
      const testData: UnifiedTripData = {
        schemaVersion: 1,
        id: 'test-trip-8',
        title: 'Test Trip 8',
        description: 'Test Description',
        startDate: '2024-01-01',
        endDate: '2024-01-10',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      };

      const result = migrateToLatestSchema(testData);

      expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    });
  });

  describe('CURRENT_SCHEMA_VERSION', () => {
    it('should be set to 4', () => {
      expect(CURRENT_SCHEMA_VERSION).toBe(4);
    });
  });
});