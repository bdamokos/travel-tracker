import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('backup restore + retention', () => {
  let testDataDir: string;

  beforeEach(() => {
    testDataDir = mkdtempSync(join(tmpdir(), 'travel-tracker-data-'));
    mkdirSync(join(testDataDir, 'backups'), { recursive: true });
    process.env.TEST_DATA_DIR = testDataDir;
    jest.resetModules();
  });

  afterEach(() => {
    delete process.env.TEST_DATA_DIR;
    jest.resetModules();
    rmSync(testDataDir, { recursive: true, force: true });
  });

  it('creates a trip-deletion backup and can restore the trip', async () => {
    const { saveUnifiedTripData, loadUnifiedTripData, deleteTripWithBackup, restoreTripFromBackup } = await import('../../lib/unifiedDataService');
    const { CURRENT_SCHEMA_VERSION } = await import('../../lib/dataMigration');
    const { backupService } = await import('../../lib/backupService');

    const tripId = 'backupTrip1';

    await saveUnifiedTripData({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id: tripId,
      title: 'Backup Trip 1',
      description: '',
      startDate: new Date('2024-01-01T00:00:00.000Z').toISOString(),
      endDate: new Date('2024-01-02T00:00:00.000Z').toISOString(),
      createdAt: new Date('2024-01-01T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2024-01-01T00:00:00.000Z').toISOString(),
      travelData: { locations: [], routes: [] },
      costData: {
        overallBudget: 100,
        currency: 'EUR',
        countryBudgets: [],
        expenses: []
      }
    });

    await deleteTripWithBackup(tripId);
    const afterDelete = await loadUnifiedTripData(tripId);
    expect(afterDelete).toBeNull();

    backupService.clearCache();
    const backups = await backupService.listBackups({ type: 'trip' });
    expect(backups.length).toBeGreaterThan(0);
    const backup = backups.find(b => b.originalId === tripId);
    expect(backup).toBeDefined();
    if (!backup) return;

    const restored = await restoreTripFromBackup(backup.id);
    expect(restored.id).toBe(tripId);
    expect(restored.title).toBe('Backup Trip 1');
  });

  it('creates a cost-deletion backup, clears cost data/links, and can restore cost tracking', async () => {
    const { saveUnifiedTripData, loadUnifiedTripData, deleteCostTrackingWithBackup, restoreCostTrackingFromBackup } = await import('../../lib/unifiedDataService');
    const { CURRENT_SCHEMA_VERSION } = await import('../../lib/dataMigration');
    const { backupService } = await import('../../lib/backupService');

    const tripId = 'backupTrip2';

    await saveUnifiedTripData({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id: tripId,
      title: 'Backup Trip 2',
      description: '',
      startDate: new Date('2024-02-01T00:00:00.000Z').toISOString(),
      endDate: new Date('2024-02-02T00:00:00.000Z').toISOString(),
      createdAt: new Date('2024-02-01T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2024-02-01T00:00:00.000Z').toISOString(),
      travelData: {
        locations: [
          {
            id: 'loc-1',
            name: 'Loc 1',
            coordinates: [0, 0],
            date: new Date('2024-02-01T00:00:00.000Z'),
            costTrackingLinks: [{ expenseId: 'exp-1', description: 'Lunch' }]
          }
        ],
        routes: []
      },
      accommodations: [
        {
          id: 'acc-1',
          name: 'Hotel',
          locationId: 'loc-1',
          createdAt: new Date('2024-02-01T00:00:00.000Z').toISOString(),
          costTrackingLinks: [{ expenseId: 'exp-2' }]
        }
      ],
      costData: {
        overallBudget: 100,
        currency: 'EUR',
        countryBudgets: [],
        expenses: [
          {
            id: 'exp-1',
            date: new Date('2024-02-01T00:00:00.000Z').toISOString(),
            amount: 10,
            currency: 'EUR',
            category: 'Food',
            country: 'X',
            description: 'Lunch',
            expenseType: 'actual'
          },
          {
            id: 'exp-2',
            date: new Date('2024-02-01T00:00:00.000Z').toISOString(),
            amount: 50,
            currency: 'EUR',
            category: 'Accommodation',
            country: 'X',
            description: 'Hotel',
            expenseType: 'actual'
          }
        ]
      }
    });

    await deleteCostTrackingWithBackup(tripId);
    const afterDelete = await loadUnifiedTripData(tripId);
    expect(afterDelete?.costData).toBeUndefined();
    expect(afterDelete?.travelData?.locations?.[0].costTrackingLinks).toEqual([]);
    expect(afterDelete?.accommodations?.[0].costTrackingLinks).toEqual([]);

    backupService.clearCache();
    const backups = await backupService.listBackups({ type: 'cost' });
    const backup = backups.find(b => b.originalId === tripId);
    expect(backup).toBeDefined();
    if (!backup) return;

    await restoreCostTrackingFromBackup(backup.id);
    const restored = await loadUnifiedTripData(tripId);
    expect(restored?.costData?.expenses?.length).toBe(2);
    expect(restored?.travelData?.locations?.[0].costTrackingLinks?.some(l => l.expenseId === 'exp-1')).toBe(true);
    expect(restored?.accommodations?.[0].costTrackingLinks?.some(l => l.expenseId === 'exp-2')).toBe(true);
  });

  it('scrubs accommodation costTrackingLinks even when travelData is missing', async () => {
    const { saveUnifiedTripData, loadUnifiedTripData, deleteCostTrackingWithBackup } = await import('../../lib/unifiedDataService');
    const { CURRENT_SCHEMA_VERSION } = await import('../../lib/dataMigration');

    const tripId = 'backupTripNoTravelData';

    await saveUnifiedTripData({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id: tripId,
      title: 'Cost-only trip',
      description: '',
      startDate: new Date('2024-03-01T00:00:00.000Z').toISOString(),
      endDate: new Date('2024-03-02T00:00:00.000Z').toISOString(),
      createdAt: new Date('2024-03-01T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2024-03-01T00:00:00.000Z').toISOString(),
      accommodations: [
        {
          id: 'acc-1',
          name: 'Hotel',
          locationId: 'loc-1',
          createdAt: new Date('2024-03-01T00:00:00.000Z').toISOString(),
          costTrackingLinks: [{ expenseId: 'exp-1' }]
        }
      ],
      costData: {
        overallBudget: 100,
        currency: 'EUR',
        countryBudgets: [],
        expenses: [
          {
            id: 'exp-1',
            date: new Date('2024-03-01T00:00:00.000Z').toISOString(),
            amount: 10,
            currency: 'EUR',
            category: 'Accommodation',
            country: 'X',
            description: 'Hotel',
            expenseType: 'actual'
          }
        ]
      }
    });

    await deleteCostTrackingWithBackup(tripId);
    const after = await loadUnifiedTripData(tripId);
    expect(after?.costData).toBeUndefined();
    expect(after?.accommodations?.[0].costTrackingLinks).toEqual([]);
  });

  it('garbage-collects backups older than retention window', async () => {
    const { backupService } = await import('../../lib/backupService');

    const oldFilePath = join(testDataDir, 'backups', 'deleted-trip-old.json');
    writeFileSync(oldFilePath, JSON.stringify({ id: 'oldTrip', title: 'Old Trip', schemaVersion: 1 }, null, 2));

    await backupService.addBackupMetadata('oldTrip', 'trip', 'Old Trip', oldFilePath, 'test');

    // Force the backup to look old by editing metadata directly
    const metadataPath = join(testDataDir, 'backup-metadata.json');
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8')) as { backups: Array<{ id: string; deletedAt: string }> };
    metadata.backups = metadata.backups.map((b) =>
      b.id ? { ...b, deletedAt: new Date('2000-01-01T00:00:00.000Z').toISOString() } : b
    );
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    backupService.clearCache();

    const result = await backupService.garbageCollect({ retentionDays: 1, keepLatest: 0, dryRun: false });
    expect(result.deleted.length).toBe(1);
    expect(existsSync(oldFilePath)).toBe(false);

    backupService.clearCache();
    const remaining = await backupService.listBackups();
    expect(remaining.length).toBe(0);
  });
});
