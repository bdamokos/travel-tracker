import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('unifiedDataService.updateTravelData accommodation merge', () => {
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

  it('does not drop accommodations when a travel-data PUT sends a stale accommodations array', async () => {
    const { saveUnifiedTripData, loadUnifiedTripData, updateTravelData } = await import('../../lib/unifiedDataService');
    const { CURRENT_SCHEMA_VERSION } = await import('../../lib/dataMigration');

    const tripId = 'tripAccommodationMerge';

    const accommodationA = {
      id: 'acc-a',
      name: 'Hotel A',
      locationId: 'loc-1',
      accommodationData: '',
      isAccommodationPublic: false,
      createdAt: new Date('2024-01-01T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2024-01-01T00:00:00.000Z').toISOString(),
      costTrackingLinks: []
    };

    const location = {
      id: 'loc-1',
      name: 'City 1',
      coordinates: [0, 0] as [number, number],
      date: new Date('2024-01-01T00:00:00.000Z'),
      notes: '',
      accommodationIds: [],
      costTrackingLinks: []
    };

    await saveUnifiedTripData({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id: tripId,
      title: 'Test Trip',
      description: '',
      startDate: new Date('2024-01-01T00:00:00.000Z').toISOString(),
      endDate: new Date('2024-01-02T00:00:00.000Z').toISOString(),
      createdAt: new Date('2024-01-01T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2024-01-01T00:00:00.000Z').toISOString(),
      travelData: { locations: [location], routes: [] },
      accommodations: [accommodationA],
      costData: {
        overallBudget: 0,
        currency: 'USD',
        countryBudgets: [],
        expenses: []
      }
    });

    // Simulate a separate write path creating a new accommodation and linking it to the location.
    const current = await loadUnifiedTripData(tripId);
    expect(current).not.toBeNull();
    if (!current) return;

    const accommodationB = {
      id: 'acc-b',
      name: 'Hotel B',
      locationId: 'loc-1',
      accommodationData: 'Some details',
      isAccommodationPublic: false,
      createdAt: new Date('2024-01-01T12:00:00.000Z').toISOString(),
      updatedAt: new Date('2024-01-01T12:00:00.000Z').toISOString(),
      costTrackingLinks: []
    };

    current.accommodations = [...(current.accommodations || []), accommodationB];
    current.travelData = current.travelData || {};
    current.travelData.locations = (current.travelData.locations || []).map(loc =>
      loc.id === 'loc-1' ? { ...loc, accommodationIds: ['acc-b'] } : loc
    );
    await saveUnifiedTripData(current);

    // Now simulate autosave sending a stale accommodations array (missing acc-b) while
    // the location already references acc-b.
    await updateTravelData(tripId, {
      id: tripId,
      title: 'Test Trip (autosave)',
      locations: current.travelData.locations,
      routes: current.travelData.routes || [],
      accommodations: [accommodationA]
    });

    const reloaded = await loadUnifiedTripData(tripId);
    expect(reloaded).not.toBeNull();
    if (!reloaded) return;

    expect(reloaded.travelData?.locations?.[0].accommodationIds).toEqual(['acc-b']);
    expect(reloaded.accommodations?.some(acc => acc.id === 'acc-b')).toBe(true);
  });

  it('does not overwrite newer accommodation edits from a stale travel-data autosave payload', async () => {
    const { saveUnifiedTripData, loadUnifiedTripData, updateTravelData } = await import('../../lib/unifiedDataService');
    const { CURRENT_SCHEMA_VERSION } = await import('../../lib/dataMigration');

    const tripId = 'tripAccommodationStaleOverwrite';

    const location = {
      id: 'loc-1',
      name: 'City 1',
      coordinates: [0, 0] as [number, number],
      date: new Date('2024-01-01T00:00:00.000Z'),
      notes: '',
      accommodationIds: ['acc-1'],
      costTrackingLinks: []
    };

    const originalAccommodation = {
      id: 'acc-1',
      name: 'Old Name',
      locationId: 'loc-1',
      accommodationData: 'old',
      isAccommodationPublic: false,
      createdAt: new Date('2024-01-01T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2024-01-01T00:00:00.000Z').toISOString(),
      costTrackingLinks: []
    };

    await saveUnifiedTripData({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id: tripId,
      title: 'Test Trip',
      description: '',
      startDate: new Date('2024-01-01T00:00:00.000Z').toISOString(),
      endDate: new Date('2024-01-02T00:00:00.000Z').toISOString(),
      createdAt: new Date('2024-01-01T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2024-01-01T00:00:00.000Z').toISOString(),
      travelData: { locations: [location], routes: [] },
      accommodations: [originalAccommodation],
      costData: {
        overallBudget: 0,
        currency: 'USD',
        countryBudgets: [],
        expenses: []
      }
    });

    // Simulate a real accommodation edit being saved (newer source of truth).
    const current = await loadUnifiedTripData(tripId);
    expect(current).not.toBeNull();
    if (!current) return;

    current.accommodations = (current.accommodations || []).map(acc =>
      acc.id === 'acc-1'
        ? { ...acc, name: 'New Name', accommodationData: 'new', updatedAt: new Date('2024-01-03T00:00:00.000Z').toISOString() }
        : acc
    );
    await saveUnifiedTripData(current);

    // Now a stale autosave payload arrives with the old accommodation contents.
    await updateTravelData(tripId, {
      id: tripId,
      title: 'Test Trip (autosave)',
      locations: current.travelData?.locations || [],
      routes: current.travelData?.routes || [],
      accommodations: [originalAccommodation]
    });

    const reloaded = await loadUnifiedTripData(tripId);
    expect(reloaded).not.toBeNull();
    if (!reloaded) return;

    const acc = reloaded.accommodations?.find(a => a.id === 'acc-1');
    expect(acc?.name).toBe('New Name');
    expect(acc?.accommodationData).toBe('new');
  });
});
