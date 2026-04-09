import {
  buildCostDashboardAnalytics,
  collectUniqueDayKeysForPeriods,
  getUniquePeriodDayCount,
} from '@/app/lib/costDashboardAnalytics';
import { calculateCostSummary, calculateCountryBreakdowns } from '@/app/lib/costUtils';
import type { CostTrackingData, Expense } from '@/app/types';

function buildExpense(overrides: Partial<Expense>): Expense {
  return {
    id: 'expense-default',
    date: new Date('2026-01-01T00:00:00.000Z'),
    amount: 100,
    currency: 'USD',
    category: 'Food & Dining',
    country: 'Argentina',
    description: 'Expense',
    expenseType: 'actual',
    ...overrides,
  };
}

function buildBaseCostData(): CostTrackingData {
  return {
    id: 'cost-analytics',
    tripId: 'trip-analytics',
    tripTitle: 'Southbound',
    tripStartDate: new Date('2026-01-01T00:00:00.000Z'),
    tripEndDate: new Date('2026-01-30T00:00:00.000Z'),
    overallBudget: 6000,
    currency: 'USD',
    countryBudgets: [
      {
        id: 'budget-antarctica',
        country: 'Antarctica',
        amount: 2000,
        currency: 'USD',
        periods: [
          {
            id: 'antarctica-period',
            startDate: new Date('2026-01-01T00:00:00.000Z'),
            endDate: new Date('2026-01-12T00:00:00.000Z'),
          },
        ],
      },
      {
        id: 'budget-argentina',
        country: 'Argentina',
        amount: 2500,
        currency: 'USD',
        periods: [
          {
            id: 'argentina-period',
            startDate: new Date('2026-01-13T00:00:00.000Z'),
            endDate: new Date('2026-01-22T00:00:00.000Z'),
          },
        ],
      },
      {
        id: 'budget-chile',
        country: 'Chile',
        amount: 1500,
        currency: 'USD',
        periods: [
          {
            id: 'chile-period',
            startDate: new Date('2026-01-20T00:00:00.000Z'),
            endDate: new Date('2026-01-30T00:00:00.000Z'),
          },
        ],
      },
    ],
    expenses: [
      buildExpense({
        id: 'antarctica-expense',
        country: 'Antarctica',
        category: 'Activities & Tours',
        amount: 1200,
        date: new Date('2026-01-05T00:00:00.000Z'),
      }),
      buildExpense({
        id: 'argentina-expense',
        country: 'Argentina',
        category: 'Accommodation',
        amount: 700,
        date: new Date('2026-01-14T00:00:00.000Z'),
      }),
      buildExpense({
        id: 'chile-expense',
        country: 'Chile',
        category: 'Transportation',
        amount: 400,
        date: new Date('2026-01-24T00:00:00.000Z'),
      }),
      buildExpense({
        id: 'general-expense',
        country: 'General',
        isGeneralExpense: true,
        category: 'Insurance',
        amount: 100,
        date: new Date('2026-01-03T00:00:00.000Z'),
      }),
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('costDashboardAnalytics', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps baseline included days aligned with daysCompleted during a trip', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-18T12:00:00.000Z'));

    const costData = buildBaseCostData();
    const costSummary = calculateCostSummary(costData);
    const analytics = buildCostDashboardAnalytics(costSummary, costData, []);

    expect(costSummary.tripStatus).toBe('during');
    expect(analytics.includedDays).toBe(costSummary.daysCompleted);
  });

  it('keeps baseline included days aligned with totalDays after a trip', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-10T12:00:00.000Z'));

    const costData = buildBaseCostData();
    const costSummary = calculateCostSummary(costData);
    const analytics = buildCostDashboardAnalytics(costSummary, costData, []);

    expect(costSummary.tripStatus).toBe('after');
    expect(analytics.includedDays).toBe(costSummary.totalDays);
  });

  it('removes exactly the Antarctica itinerary days from the denominator', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-10T12:00:00.000Z'));

    const costData = buildBaseCostData();
    const costSummary = calculateCostSummary(costData);
    const analytics = buildCostDashboardAnalytics(costSummary, costData, ['Antarctica']);

    expect(costSummary.totalDays).toBe(30);
    expect(analytics.includedDays).toBe(18);
  });

  it('unions overlapping periods inside a single country only once', () => {
    const uniqueDays = getUniquePeriodDayCount([
      {
        id: 'period-1',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-01-05T00:00:00.000Z'),
      },
      {
        id: 'period-2',
        startDate: new Date('2026-01-04T00:00:00.000Z'),
        endDate: new Date('2026-01-08T00:00:00.000Z'),
      },
    ]);

    expect(uniqueDays).toBe(8);
  });

  it('subtracts overlapping excluded countries by union rather than summed days', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-10T12:00:00.000Z'));

    const costData = buildBaseCostData();
    costData.countryBudgets = [
      {
        id: 'budget-a',
        country: 'Antarctica',
        amount: 2000,
        currency: 'USD',
        periods: [
          {
            id: 'period-a',
            startDate: new Date('2026-01-01T00:00:00.000Z'),
            endDate: new Date('2026-01-12T00:00:00.000Z'),
          },
        ],
      },
      {
        id: 'budget-b',
        country: 'Argentina',
        amount: 2000,
        currency: 'USD',
        periods: [
          {
            id: 'period-b',
            startDate: new Date('2026-01-10T00:00:00.000Z'),
            endDate: new Date('2026-01-20T00:00:00.000Z'),
          },
        ],
      },
    ];

    const costSummary = calculateCostSummary(costData);
    const analytics = buildCostDashboardAnalytics(costSummary, costData, ['Antarctica', 'Argentina']);

    expect(analytics.includedDays).toBe(10);
  });

  it('lets general exclusions change totals without shrinking itinerary days', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-10T12:00:00.000Z'));

    const costData = buildBaseCostData();
    const costSummary = calculateCostSummary(costData);
    const baseline = buildCostDashboardAnalytics(costSummary, costData, []);
    const excluded = buildCostDashboardAnalytics(costSummary, costData, ['General']);

    expect(excluded.includedDays).toBe(baseline.includedDays);
    expect(excluded.includedSpending).toBeLessThan(baseline.includedSpending);
  });

  it('falls back to distinct actual expense dates when a country has no configured periods', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-10T12:00:00.000Z'));

    const costData = buildBaseCostData();
    costData.countryBudgets = [];
    costData.expenses = [
      buildExpense({
        id: 'peru-1',
        country: 'Peru',
        amount: 100,
        date: new Date('2026-01-01T00:00:00.000Z'),
      }),
      buildExpense({
        id: 'peru-2',
        country: 'Peru',
        amount: 200,
        date: new Date('2026-01-04T00:00:00.000Z'),
      }),
    ];

    const costSummary = calculateCostSummary(costData);
    const analytics = buildCostDashboardAnalytics(costSummary, costData, ['Peru']);

    expect(analytics.includedDays).toBe(28);
  });

  it('keeps zero-spend budgeted itinerary countries available in the exclusion controls', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-18T12:00:00.000Z'));

    const costData = buildBaseCostData();
    costData.countryBudgets.push({
      id: 'budget-peru',
      country: 'Peru',
      amount: 900,
      currency: 'USD',
      periods: [
        {
          id: 'peru-period',
          startDate: new Date('2026-01-23T00:00:00.000Z'),
          endDate: new Date('2026-01-26T00:00:00.000Z'),
        },
      ],
    });

    const costSummary = calculateCostSummary(costData);
    const analytics = buildCostDashboardAnalytics(costSummary, costData, []);

    expect(analytics.availableCountryOptions).toContain('Peru');
  });

  it('uses trip-window net spend rather than prep costs for daily averages', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-10T12:00:00.000Z'));

    const costData = buildBaseCostData();
    costData.expenses.push(
      buildExpense({
        id: 'argentina-pretrip-deposit',
        country: 'Argentina',
        category: 'Accommodation',
        amount: 300,
        date: new Date('2025-12-28T00:00:00.000Z'),
      })
    );

    const costSummary = calculateCostSummary(costData);
    const analytics = buildCostDashboardAnalytics(costSummary, costData, []);
    const argentina = analytics.countryRows.find(country => country.country === 'Argentina');

    expect(argentina?.netSpent).toBe(1000);
    expect(argentina?.tripNetSpent).toBe(700);
    expect(argentina?.averagePerDay).toBe(70);
    expect(analytics.includedAveragePerDay).toBeCloseTo((1200 + 700 + 400 + 100) / 30, 5);
  });

  it('clamps fallback expense-day counting to the trip window', () => {
    const costData = buildBaseCostData();
    costData.countryBudgets = [];
    costData.expenses = [
      buildExpense({
        id: 'peru-pre',
        country: 'Peru',
        amount: 40,
        date: new Date('2025-12-31T00:00:00.000Z'),
      }),
      buildExpense({
        id: 'peru-trip-1',
        country: 'Peru',
        amount: 100,
        date: new Date('2026-01-01T00:00:00.000Z'),
      }),
      buildExpense({
        id: 'peru-trip-2',
        country: 'Peru',
        amount: 200,
        date: new Date('2026-01-04T00:00:00.000Z'),
      }),
      buildExpense({
        id: 'peru-post',
        country: 'Peru',
        amount: 60,
        date: new Date('2026-02-01T00:00:00.000Z'),
      }),
    ];

    const breakdown = calculateCountryBreakdowns(costData).find(country => country.country === 'Peru');

    expect(breakdown?.days).toBe(2);
  });

  it('does not subtract future period days while the trip is still in progress', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-15T12:00:00.000Z'));

    const costData = buildBaseCostData();
    const costSummary = calculateCostSummary(costData);
    const analytics = buildCostDashboardAnalytics(costSummary, costData, ['Chile']);

    expect(costSummary.daysCompleted).toBe(15);
    expect(analytics.includedDays).toBe(15);
  });

  it('updates country breakdown days to use unique-union period semantics', () => {
    const costData = buildBaseCostData();
    costData.countryBudgets = [
      {
        id: 'budget-overlap',
        country: 'Argentina',
        amount: 2000,
        currency: 'USD',
        periods: [
          {
            id: 'period-1',
            startDate: new Date('2026-01-01T00:00:00.000Z'),
            endDate: new Date('2026-01-05T00:00:00.000Z'),
          },
          {
            id: 'period-2',
            startDate: new Date('2026-01-04T00:00:00.000Z'),
            endDate: new Date('2026-01-08T00:00:00.000Z'),
          },
        ],
      },
    ];
    costData.expenses = [
      buildExpense({
        id: 'argentina-expense',
        country: 'Argentina',
        date: new Date('2026-01-03T00:00:00.000Z'),
      }),
    ];

    const breakdown = calculateCountryBreakdowns(costData).find(country => country.country === 'Argentina');

    expect(breakdown?.days).toBe(8);
  });

  it('clips collected period day keys to the active window', () => {
    const dayKeys = collectUniqueDayKeysForPeriods(
      [
        {
          id: 'period-clip',
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          endDate: new Date('2026-01-10T00:00:00.000Z'),
        },
      ],
      {
        start: new Date('2026-01-03T00:00:00.000Z'),
        end: new Date('2026-01-05T00:00:00.000Z'),
      }
    );

    expect(dayKeys).toEqual(['2026-01-03', '2026-01-04', '2026-01-05']);
  });
});
