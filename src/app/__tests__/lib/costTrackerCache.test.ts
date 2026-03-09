import {
  clearCachedCostTracker,
  getCachedCostTracker,
  normalizeCostTrackerId,
  setCachedCostTracker
} from '@/app/lib/costTrackerCache';
import { CostTrackingData } from '@/app/types';

const buildCostData = (id: string): CostTrackingData => ({
  id,
  tripId: 'trip-1',
  tripTitle: 'Test Trip',
  tripStartDate: '2026-03-01' as unknown as Date,
  tripEndDate: '2026-03-05' as unknown as Date,
  overallBudget: 1000,
  reservedBudget: 100,
  currency: 'EUR',
  countryBudgets: [],
  expenses: [],
  customCategories: ['Food'],
  createdAt: '2026-03-01T00:00:00.000Z'
});

describe('costTrackerCache', () => {
  beforeEach(() => {
    clearCachedCostTracker('cost-trip-1');
    window.sessionStorage.clear();
  });

  it('normalizes repeated cost prefixes', () => {
    expect(normalizeCostTrackerId('cost-cost-trip-1')).toBe('trip-1');
  });

  it('stores and reads cached cost tracker data by normalized id', () => {
    const costData = buildCostData('cost-trip-1');

    setCachedCostTracker(costData);

    expect(getCachedCostTracker('trip-1')).toEqual(costData);
    expect(getCachedCostTracker('cost-trip-1')).toEqual(costData);
  });

  it('restores cached data from sessionStorage after memory cache is cleared', () => {
    const costData = buildCostData('cost-trip-1');

    setCachedCostTracker(costData);
    clearCachedCostTracker('cost-trip-1');
    window.sessionStorage.setItem(
      'travel-tracker-cost-cache:cost-trip-1',
      JSON.stringify(costData)
    );

    expect(getCachedCostTracker('cost-trip-1')).toEqual(costData);
  });
});
