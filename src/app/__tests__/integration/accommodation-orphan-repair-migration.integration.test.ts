import { describe, it, expect } from '@jest/globals';
import { migrateToLatestSchema, UnifiedTripData, CURRENT_SCHEMA_VERSION } from '../../lib/dataMigration';

describe('Accommodation orphan repair migration (v6→v7)', () => {
  it('creates placeholder accommodations for missing location accommodationIds and re-attaches expense links', () => {
    const v6Data: UnifiedTripData = {
      schemaVersion: 6,
      id: 'trip-orphan-acc-test',
      title: 'Test Trip',
      description: '',
      startDate: '2024-01-01T00:00:00.000Z',
      endDate: '2024-01-02T00:00:00.000Z',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      travelData: {
        locations: [
          {
            id: 'loc-1',
            name: 'Santiago de Chile',
            coordinates: [-33.4, -70.6],
            date: new Date('2024-01-01T00:00:00.000Z'),
            notes: '',
            accommodationIds: ['missing-acc-1'],
            costTrackingLinks: []
          }
        ],
        routes: []
      },
      accommodations: [],
      costData: {
        overallBudget: 0,
        currency: 'USD',
        countryBudgets: [],
        expenses: [
          {
            id: 'expense-1',
            date: new Date('2024-01-01T00:00:00.000Z'),
            amount: 123,
            currency: 'USD',
            category: 'Accommodation',
            country: 'Chile',
            description: 'Hotel booking',
            expenseType: 'actual',
            travelReference: {
              type: 'accommodation',
              description: 'Hotel booking',
              accommodationId: 'missing-acc-1'
            }
          }
        ]
      }
    };

    const migrated = migrateToLatestSchema(v6Data);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

    const repaired = migrated.accommodations?.find(acc => acc.id === 'missing-acc-1');
    expect(repaired).toBeDefined();
    expect(repaired?.locationId).toBe('loc-1');
    expect(repaired?.costTrackingLinks?.some(link => link.expenseId === 'expense-1')).toBe(true);
  });
});

