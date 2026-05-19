import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('unifiedDataService.updateCostData reserved budget persistence', () => {
  let testDataDir: string;
  const createdAt = '2025-01-01T00:00:00.000Z';

  const seedCostTrip = async (tripId: string, reservedBudget: number) => {
    const { saveUnifiedTripData } = await import('../../lib/unifiedDataService');
    const { CURRENT_SCHEMA_VERSION } = await import('../../lib/dataMigration');

    await saveUnifiedTripData({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id: tripId,
      title: 'Reserved Budget Trip',
      description: '',
      startDate: '2025-01-01',
      endDate: '2025-01-02',
      createdAt,
      updatedAt: createdAt,
      costData: {
        overallBudget: 1000,
        reservedBudget,
        currency: 'EUR',
        countryBudgets: [],
        expenses: []
      }
    });
  };

  beforeEach(() => {
    testDataDir = mkdtempSync(join(tmpdir(), 'travel-tracker-cost-data-'));
    process.env.TEST_DATA_DIR = testDataDir;
    jest.resetModules();
  });

  afterEach(() => {
    delete process.env.TEST_DATA_DIR;
    jest.resetModules();
    rmSync(testDataDir, { recursive: true, force: true });
  });

  it('persists an explicit reserved budget clear instead of restoring the previous value', async () => {
    const { updateCostData, loadUnifiedTripData } = await import('../../lib/unifiedDataService');

    await seedCostTrip('reservedBudgetClear', 250);

    await updateCostData('reservedBudgetClear', {
      tripTitle: 'Reserved Budget Clear',
      tripStartDate: '2025-01-01',
      tripEndDate: '2025-01-02',
      overallBudget: 1000,
      reservedBudget: null,
      currency: 'EUR',
      countryBudgets: [],
      expenses: []
    });

    const reloaded = await loadUnifiedTripData('reservedBudgetClear');

    expect(reloaded?.costData?.reservedBudget).toBeUndefined();
  });

  it('preserves reserved budget when an update omits the field', async () => {
    const { updateCostData, loadUnifiedTripData } = await import('../../lib/unifiedDataService');

    await seedCostTrip('reservedBudgetOmitted', 250);

    await updateCostData('reservedBudgetOmitted', {
      tripTitle: 'Reserved Budget Omitted',
      tripStartDate: '2025-01-01',
      tripEndDate: '2025-01-02',
      overallBudget: 1000,
      currency: 'EUR',
      countryBudgets: [],
      expenses: []
    });

    const reloaded = await loadUnifiedTripData('reservedBudgetOmitted');

    expect(reloaded?.costData?.reservedBudget).toBe(250);
  });

  it('does not persist NaN for malformed reserved budget values', async () => {
    const { updateCostData, loadUnifiedTripData } = await import('../../lib/unifiedDataService');

    await seedCostTrip('reservedBudgetMalformed', 250);

    await updateCostData('reservedBudgetMalformed', {
      tripTitle: 'Reserved Budget Malformed',
      tripStartDate: '2025-01-01',
      tripEndDate: '2025-01-02',
      overallBudget: 1000,
      reservedBudget: 'not-a-number',
      currency: 'EUR',
      countryBudgets: [],
      expenses: []
    });

    const reloaded = await loadUnifiedTripData('reservedBudgetMalformed');

    expect(reloaded?.costData?.reservedBudget).toBe(0);
  });
});
