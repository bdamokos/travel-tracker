import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('unifiedDataService.saveUnifiedTripData concurrent writes', () => {
  let testDataDir: string;

  beforeEach(() => {
    testDataDir = mkdtempSync(join(tmpdir(), 'travel-tracker-data-'));
    process.env.TEST_DATA_DIR = testDataDir;
    jest.resetModules();
  });

  afterEach(() => {
    delete process.env.TEST_DATA_DIR;
    jest.resetModules();
    rmSync(testDataDir, { recursive: true, force: true });
  });

  it('keeps the trip file parseable and free of NUL bytes when saves overlap', async () => {
    const { saveUnifiedTripData } = await import('../../lib/unifiedDataService');
    const { getUnifiedTripFilePath } = await import('../../lib/dataFilePaths');
    const { CURRENT_SCHEMA_VERSION } = await import('../../lib/dataMigration');

    const tripId = 'tripConcurrentSave';
    const baseTrip = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id: tripId,
      title: 'Concurrent Save Test',
      description: '',
      startDate: '2024-01-01',
      endDate: '2024-01-02',
      createdAt: new Date('2024-01-01T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2024-01-01T00:00:00.000Z').toISOString(),
      travelData: { locations: [], routes: [] },
      accommodations: []
    };

    for (let i = 0; i < 20; i += 1) {
      const largeTrip = {
        ...baseTrip,
        updatedAt: new Date(2024, 0, 1, 0, 0, i).toISOString(),
        costData: {
          overallBudget: 2000 + i,
          currency: 'EUR',
          countryBudgets: [],
          expenses: Array.from({ length: 1500 }, (_, idx) => ({
            id: `exp-large-${i}-${idx}`,
            amount: idx + 1,
            date: '2024-01-01',
            category: 'transport',
            description: `large-${idx}-${'x'.repeat(50)}`
          }))
        }
      };

      const smallTrip = {
        ...baseTrip,
        updatedAt: new Date(2024, 0, 1, 0, 1, i).toISOString(),
        costData: {
          overallBudget: 500 + i,
          currency: 'EUR',
          countryBudgets: [],
          expenses: [
            {
              id: `exp-small-${i}`,
              amount: i + 1,
              date: '2024-01-01',
              category: 'food',
              description: 'small'
            }
          ]
        }
      };

      await Promise.all([
        saveUnifiedTripData(largeTrip),
        saveUnifiedTripData(smallTrip)
      ]);

      const filePath = getUnifiedTripFilePath(tripId);
      const buffer = readFileSync(filePath);
      expect(buffer.includes(0)).toBe(false);
      expect(() => JSON.parse(buffer.toString('utf8'))).not.toThrow();
    }
  });
});
