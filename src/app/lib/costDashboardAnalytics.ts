import type { CategoryBreakdown, CostSummary, CostTrackingData, CountryBreakdown, CountryPeriod } from '@/app/types';
import {
  GENERAL_COUNTRY_LABEL,
  UNASSIGNED_COUNTRY_LABEL,
  deriveExcludedCountries,
} from '@/app/lib/countryInclusions';
import { formatLocalDateInput, getTodayLocalDay, parseDateAsLocalDay } from '@/app/lib/localDateUtils';

// Kept local to avoid creating a circular dependency on costUtils for one label constant.
const REFUNDS_CATEGORY_NAME = 'Refunds';

export type DashboardTripWindow = {
  start: Date | null;
  end: Date | null;
  startKey: string | null;
  endKey: string | null;
  dayKeys: string[];
  dayCount: number;
};

export type DashboardCategoryRow = {
  category: string;
  amount: number;
  count: number;
  share: number;
};

export type DashboardCountryRow = {
  country: string;
  key: string;
  coverageDays: number;
  coverageDayKeys: string[];
  tripNetSpent: number;
  netSpent: number;
  refunds: number;
  budgetAmount: number;
  averagePerDay: number;
  plannedNet: number;
  postTripNet: number;
  budgetDelta: number;
  expenseCount: number;
  categoryRows: DashboardCategoryRow[];
  isItineraryCountry: boolean;
  hasConfiguredPeriods: boolean;
  periodCount: number;
};

export type DashboardAnalytics = {
  tripWindow: DashboardTripWindow;
  includedSpending: number;
  includedRefunds: number;
  includedDays: number;
  includedAveragePerDay: number | null;
  includedCountryCount: number;
  categoryCount: number;
  availableCountryOptions: string[];
  excludedCountryLabels: string[];
  countryRows: DashboardCountryRow[];
  allCategoryRows: DashboardCategoryRow[];
};

type DayKeyBoundary = {
  start?: Date | null;
  end?: Date | null;
};

function normalizeDate(value: Date | string): Date | null {
  return parseDateAsLocalDay(value);
}

function getLaterDate(left: Date, right: Date): Date {
  return left > right ? left : right;
}

function getEarlierDate(left: Date, right: Date): Date {
  return left < right ? left : right;
}

export function enumerateLocalDayKeysBetween(startInput: Date | string, endInput: Date | string): string[] {
  const start = normalizeDate(startInput);
  const end = normalizeDate(endInput);
  if (!start || !end || end < start) {
    return [];
  }

  const keys: string[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    keys.push(formatLocalDateInput(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return keys;
}

export function collectUniqueDayKeysForPeriods(
  periods: CountryPeriod[] | undefined,
  boundary: DayKeyBoundary = {}
): string[] {
  if (!periods || periods.length === 0) {
    return [];
  }

  const dayKeys = new Set<string>();

  periods.forEach(period => {
    const periodStart = normalizeDate(period.startDate);
    const periodEnd = normalizeDate(period.endDate);
    if (!periodStart || !periodEnd) {
      return;
    }

    const effectiveStart = boundary.start ? getLaterDate(periodStart, boundary.start) : periodStart;
    const effectiveEnd = boundary.end ? getEarlierDate(periodEnd, boundary.end) : periodEnd;

    if (effectiveEnd < effectiveStart) {
      return;
    }

    enumerateLocalDayKeysBetween(effectiveStart, effectiveEnd).forEach(dayKey => {
      dayKeys.add(dayKey);
    });
  });

  return Array.from(dayKeys).sort();
}

export function getUniquePeriodDayCount(periods: CountryPeriod[] | undefined): number {
  return collectUniqueDayKeysForPeriods(periods).length;
}

export function getCanonicalTripWindow(
  costSummary: CostSummary,
  costData: CostTrackingData,
  today: Date = getTodayLocalDay()
): DashboardTripWindow {
  const tripStart = normalizeDate(costData.tripStartDate);
  const tripEnd = normalizeDate(costData.tripEndDate);

  if (!tripStart || !tripEnd || costSummary.tripStatus === 'before') {
    return {
      start: null,
      end: null,
      startKey: null,
      endKey: null,
      dayKeys: [],
      dayCount: 0,
    };
  }

  const normalizedToday = normalizeDate(today);
  const effectiveEnd = costSummary.tripStatus === 'during' && normalizedToday
    ? getEarlierDate(normalizedToday, tripEnd)
    : tripEnd;

  if (effectiveEnd < tripStart) {
    return {
      start: null,
      end: null,
      startKey: null,
      endKey: null,
      dayKeys: [],
      dayCount: 0,
    };
  }

  const dayKeys = enumerateLocalDayKeysBetween(tripStart, effectiveEnd);

  return {
    start: tripStart,
    end: effectiveEnd,
    startKey: formatLocalDateInput(tripStart),
    endKey: formatLocalDateInput(effectiveEnd),
    dayKeys,
    dayCount: dayKeys.length,
  };
}

function createCategoryRows(categoryBreakdown: CategoryBreakdown[]): DashboardCategoryRow[] {
  const visibleCategories = categoryBreakdown
    .filter(category => category.category !== REFUNDS_CATEGORY_NAME && category.amount > 0);
  const total = visibleCategories.reduce((sum, category) => sum + category.amount, 0);

  return visibleCategories
    .map(category => ({
      category: category.category,
      amount: category.amount,
      count: category.count,
      share: total > 0 ? category.amount / total : 0,
    }))
    .sort((left, right) => right.amount - left.amount || left.category.localeCompare(right.category));
}

function getCountryCoverageDayKeys(
  countryBreakdown: CountryBreakdown,
  costData: CostTrackingData,
  tripWindow: DashboardTripWindow
): string[] {
  if (
    tripWindow.dayCount === 0 ||
    countryBreakdown.country === GENERAL_COUNTRY_LABEL ||
    countryBreakdown.country === UNASSIGNED_COUNTRY_LABEL
  ) {
    return [];
  }

  const countryBudget = costData.countryBudgets.find(budget => budget.country === countryBreakdown.country);
  if (countryBudget?.periods?.length) {
    return collectUniqueDayKeysForPeriods(countryBudget.periods, {
      start: tripWindow.start,
      end: tripWindow.end,
    });
  }

  const dayKeys = new Set<string>();
  countryBreakdown.expenses.forEach(expense => {
    if ((expense.expenseType || 'actual') !== 'actual') {
      return;
    }

    const expenseDate = normalizeDate(expense.date);
    if (!expenseDate || !tripWindow.start || !tripWindow.end) {
      return;
    }

    if (expenseDate < tripWindow.start || expenseDate > tripWindow.end) {
      return;
    }

    dayKeys.add(formatLocalDateInput(expenseDate));
  });

  return Array.from(dayKeys).sort();
}

function combineCategoryRows(countryRows: DashboardCountryRow[]): DashboardCategoryRow[] {
  const categoryMap = new Map<string, { amount: number; count: number }>();

  countryRows.forEach(country => {
    country.categoryRows.forEach(category => {
      const existing = categoryMap.get(category.category) || { amount: 0, count: 0 };
      existing.amount += category.amount;
      existing.count += category.count;
      categoryMap.set(category.category, existing);
    });
  });

  const total = Array.from(categoryMap.values()).reduce((sum, category) => sum + category.amount, 0);

  return Array.from(categoryMap.entries())
    .map(([category, value]) => ({
      category,
      amount: value.amount,
      count: value.count,
      share: total > 0 ? value.amount / total : 0,
    }))
    .sort((left, right) => right.amount - left.amount || left.category.localeCompare(right.category));
}

function hasCountryDashboardPresence(country: CountryBreakdown, costData: CostTrackingData): boolean {
  if (
    country.spentAmount > 0 ||
    country.refundAmount > 0 ||
    country.plannedSpending > 0 ||
    country.plannedRefunds > 0 ||
    country.budgetAmount > 0
  ) {
    return true;
  }

  const countryBudget = costData.countryBudgets.find(budget => budget.country === country.country);
  return Boolean(countryBudget?.periods?.length);
}

export function buildCostDashboardAnalytics(
  costSummary: CostSummary,
  costData: CostTrackingData,
  excludedCountries: string[]
): DashboardAnalytics {
  const tripWindow = getCanonicalTripWindow(costSummary, costData);
  const derivedExcludedCountries = deriveExcludedCountries(excludedCountries);
  const excludedCountryLabels = Array.from(derivedExcludedCountries).sort((left, right) => left.localeCompare(right));

  const countryRows = costSummary.countryBreakdown
    .filter(country => !derivedExcludedCountries.has(country.country))
    .map(country => {
      const coverageDayKeys = getCountryCoverageDayKeys(country, costData, tripWindow);
      return {
        country: country.country,
        key: country.country,
        coverageDays: coverageDayKeys.length,
        coverageDayKeys,
        tripNetSpent: country.tripSpent,
        netSpent: country.spentAmount - country.refundAmount,
        refunds: country.refundAmount,
        budgetAmount: country.budgetAmount,
        averagePerDay: coverageDayKeys.length > 0 ? country.tripSpent / coverageDayKeys.length : 0,
        plannedNet: country.plannedSpending - country.plannedRefunds,
        postTripNet: country.postTripSpent - country.postTripRefunds,
        budgetDelta: country.availableForPlanning,
        expenseCount: country.expenses.length,
        categoryRows: createCategoryRows(country.categoryBreakdown),
        isItineraryCountry: country.country !== GENERAL_COUNTRY_LABEL && country.country !== UNASSIGNED_COUNTRY_LABEL,
        hasConfiguredPeriods: Boolean(costData.countryBudgets.find(budget => budget.country === country.country)?.periods?.length),
        periodCount: costData.countryBudgets.find(budget => budget.country === country.country)?.periods?.length || 0,
      };
    });

  const excludedDayKeys = new Set<string>();
  costSummary.countryBreakdown
    .filter(country => derivedExcludedCountries.has(country.country))
    .forEach(country => {
      getCountryCoverageDayKeys(country, costData, tripWindow).forEach(dayKey => {
        excludedDayKeys.add(dayKey);
      });
    });

  const includedDays = Math.max(0, tripWindow.dayCount - excludedDayKeys.size);
  const includedSpending = countryRows.reduce((sum, country) => sum + country.netSpent, 0);
  const includedRefunds = countryRows.reduce((sum, country) => sum + country.refunds, 0);
  const includedTripNetSpending = countryRows.reduce((sum, country) => sum + country.tripNetSpent, 0);
  const includedAveragePerDay = includedDays > 0 ? includedTripNetSpending / includedDays : null;
  const availableCountryOptions = costSummary.countryBreakdown
    .filter(country => hasCountryDashboardPresence(country, costData))
    .map(country => country.country)
    .sort((left, right) => left.localeCompare(right));
  const allCategoryRows = combineCategoryRows(countryRows);

  return {
    tripWindow,
    includedSpending,
    includedRefunds,
    includedDays,
    includedAveragePerDay,
    includedCountryCount: countryRows.length,
    categoryCount: allCategoryRows.length,
    availableCountryOptions,
    excludedCountryLabels,
    countryRows,
    allCategoryRows,
  };
}
