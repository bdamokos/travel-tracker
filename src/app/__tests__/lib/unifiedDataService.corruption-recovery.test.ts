import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('unifiedDataService.loadUnifiedTripData corruption recovery', () => {
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

  it('recovers valid JSON prefix, rewrites the trip file, and stores a corrupted backup', async () => {
    const { CURRENT_SCHEMA_VERSION } = await import('../../lib/dataMigration');
    const { getUnifiedTripFilePath } = await import('../../lib/dataFilePaths');
    const { loadUnifiedTripData } = await import('../../lib/unifiedDataService');

    const tripId = 'tripCorruptRecover';
    const filePath = getUnifiedTripFilePath(tripId);

    const validTrip = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id: tripId,
      title: 'Corruption Recovery',
      description: '',
      startDate: '2024-01-01',
      endDate: '2024-01-02',
      createdAt: new Date('2024-01-01T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2024-01-01T00:00:00.000Z').toISOString(),
      travelData: { locations: [], routes: [] },
      accommodations: [],
      costData: {
        overallBudget: 1000,
        currency: 'EUR',
        countryBudgets: [],
        expenses: []
      }
    };

    const validJson = JSON.stringify(validTrip, null, 2);
    const corrupted = Buffer.concat([
      Buffer.from(validJson, 'utf8'),
      Buffer.from('\u0000\u0000\u0000\u0000', 'utf8'),
      Buffer.from('{"stale":"tail"}', 'utf8')
    ]);
    writeFileSync(filePath, corrupted);

    const loaded = await loadUnifiedTripData(tripId);
    expect(loaded).not.toBeNull();
    if (!loaded) return;

    expect(loaded.id).toBe(tripId);
    expect(loaded.title).toBe('Corruption Recovery');

    const repairedBuffer = readFileSync(filePath);
    expect(repairedBuffer.includes(0)).toBe(false);
    expect(() => JSON.parse(repairedBuffer.toString('utf8'))).not.toThrow();

    const backupsDir = join(testDataDir, 'backups');
    const backupFiles = readdirSync(backupsDir);
    expect(backupFiles.some((file) => file.startsWith('corrupted-trip-tripCorruptRecover-'))).toBe(true);
  });
});
