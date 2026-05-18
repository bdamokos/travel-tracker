import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('unifiedDataService.listAllTrips privacy summaries', () => {
  let testDataDir: string;

  beforeEach(() => {
    testDataDir = mkdtempSync(join(tmpdir(), 'travel-tracker-list-privacy-'));
    process.env.TEST_DATA_DIR = testDataDir;
    jest.resetModules();
  });

  afterEach(() => {
    delete process.env.TEST_DATA_DIR;
    jest.resetModules();
    rmSync(testDataDir, { recursive: true, force: true });
  });

  it('calculates public accommodation counts during the trip scan', async () => {
    const { saveUnifiedTripData, listAllTrips } = await import('../../lib/unifiedDataService');
    const { CURRENT_SCHEMA_VERSION } = await import('../../lib/dataMigration');

    await saveUnifiedTripData({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id: 'tripListPrivacy',
      title: 'Listed Trip',
      description: '',
      startDate: '2026-06-01',
      endDate: '2026-06-10',
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-02T00:00:00.000Z',
      travelData: {
        locations: [],
        routes: [],
      },
      accommodations: [
        {
          id: 'private-acc',
          name: 'Private Hotel',
          locationId: 'loc-1',
          accommodationData: 'booking code',
          isAccommodationPublic: false,
          createdAt: '2026-05-01T00:00:00.000Z',
        },
        {
          id: 'public-acc',
          name: 'Public Campsite',
          locationId: 'loc-2',
          isAccommodationPublic: true,
          createdAt: '2026-05-01T00:00:00.000Z',
        },
      ],
    });

    const [summary] = await listAllTrips();

    expect(summary).toEqual(expect.objectContaining({
      id: 'tripListPrivacy',
      accommodationCount: 2,
      publicAccommodationCount: 1,
    }));
    expect(JSON.stringify(summary)).not.toContain('Private Hotel');
    expect(JSON.stringify(summary)).not.toContain('booking code');
  });
});
