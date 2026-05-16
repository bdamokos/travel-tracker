'use client';

import { useMemo, useState, type CSSProperties, type JSX } from 'react';
import AccessibleModal from '@/app/admin/components/AccessibleModal';
import type { CostSummary, CostTrackingData, Expense } from '@/app/types';
import {
  buildCostDashboardAnalytics,
  type DashboardCategoryRow,
  type DashboardCountryRow,
} from '@/app/lib/costDashboardAnalytics';
import { isCashAllocation } from '@/app/lib/cashTransactions';
import { filterExpensesByExcludedCountries } from '@/app/lib/countryInclusions';
import { formatCurrency, formatCurrencyWithRefunds } from '@/app/lib/costUtils';
import { formatLocalDateInput, getTodayLocalDay, parseDateAsLocalDay } from '@/app/lib/localDateUtils';

interface CostSummaryDashboardProps {
  costSummary: CostSummary;
  costData: CostTrackingData;
  excludedCountries: string[];
  setExcludedCountries: React.Dispatch<React.SetStateAction<string[]>>;
}

type TrendDirection = 'up' | 'down' | 'flat';
type SortMode = 'net' | 'daily' | 'budget';
type CategoryScope = 'all' | 'selected';
type TripDayExpenseDetail = {
  dateKey: string;
  expenses: Expense[];
  total: number;
};

const CASH_SPENDING_FALLBACK_PATTERN = /^Cash spending \([^)]*\)$/i;

const DASHBOARD_THEME: CSSProperties = {
  ['--cost-board-ink' as string]: 'rgb(15 23 42)',
  ['--cost-board-panel' as string]: 'rgb(255 255 255 / 0.92)',
  ['--cost-board-panel-strong' as string]: 'rgb(248 250 252 / 0.98)',
  ['--cost-board-border' as string]: 'rgb(148 163 184 / 0.2)',
  ['--cost-board-muted' as string]: 'rgb(71 85 105)',
  ['--cost-board-emerald' as string]: 'rgb(5 150 105)',
  ['--cost-board-cobalt' as string]: 'rgb(37 99 235)',
  ['--cost-board-sky' as string]: 'rgb(2 132 199)',
  ['--cost-board-amber' as string]: 'rgb(217 119 6)',
  ['--cost-board-rose' as string]: 'rgb(225 29 72)',
  ['--cost-board-glow' as string]: '0 18px 50px rgb(15 23 42 / 0.09)',
} as CSSProperties;

const surfaceClassName = [
  'rounded-[1.5rem] border border-[color:var(--cost-board-border)]',
  'bg-[color:var(--cost-board-panel)]',
  'shadow-[var(--cost-board-glow)] dark:bg-slate-950/70 dark:border-slate-800',
].join(' ');

const metricToneClasses: Record<string, string> = {
  emerald: 'bg-emerald-50/90 border-emerald-200/80 text-emerald-950 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-100',
  cobalt: 'bg-blue-50/90 border-blue-200/80 text-blue-950 dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-100',
  sky: 'bg-sky-50/90 border-sky-200/80 text-sky-950 dark:bg-sky-950/40 dark:border-sky-900 dark:text-sky-100',
  amber: 'bg-amber-50/90 border-amber-200/80 text-amber-950 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-100',
  slate: 'bg-slate-50/90 border-slate-200/80 text-slate-950 dark:bg-slate-950/40 dark:border-slate-800 dark:text-slate-100',
  rose: 'bg-rose-50/90 border-rose-200/80 text-rose-950 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-100',
};

function MetricCard({
  label,
  value,
  supporting,
  detail,
  tone = 'slate',
}: {
  label: string;
  value: string;
  supporting?: string;
  detail?: string;
  tone?: keyof typeof metricToneClasses;
}): JSX.Element {
  return (
    <div className={`rounded-xl border p-3.5 ${metricToneClasses[tone]}`}>
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] opacity-75">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {supporting ? <p className="mt-1.5 text-sm opacity-80">{supporting}</p> : null}
      {detail ? <p className="mt-2 text-xs opacity-70">{detail}</p> : null}
    </div>
  );
}

function SegmentedControl<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}): JSX.Element {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex flex-wrap gap-2 rounded-full border border-slate-200 bg-white/70 p-1 dark:border-slate-700 dark:bg-slate-900/60"
    >
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold tracking-wide transition ${
            value === option.value
              ? 'bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-950'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function formatWindowLabel(date: Date | null): string {
  if (!date) {
    return 'No active window';
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function trendLabel(trend: TrendDirection, delta: number): string {
  if (trend === 'flat') {
    return 'Steady';
  }

  const rounded = Math.abs(delta).toFixed(1);
  return trend === 'up' ? `Up ${rounded}%` : `Down ${rounded}%`;
}

function formatShare(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function getCountryMetricValue(country: DashboardCountryRow, sortMode: SortMode): number {
  switch (sortMode) {
    case 'daily':
      return country.averagePerDay;
    case 'budget':
      return country.budgetAmount > 0 ? country.budgetDelta : Number.NEGATIVE_INFINITY;
    case 'net':
    default:
      return country.netSpent;
  }
}

function getCountryMetricLabel(country: DashboardCountryRow, sortMode: SortMode, currency: string): string {
  switch (sortMode) {
    case 'daily':
      return `${formatCurrency(country.averagePerDay, currency)} / day`;
    case 'budget':
      return country.budgetAmount > 0 ? formatCurrency(country.budgetDelta, currency) : 'No budget';
    case 'net':
    default:
      return formatCurrency(country.netSpent, currency);
  }
}

function getCountryBarWidth(country: DashboardCountryRow, sortMode: SortMode, maxValue: number): string {
  if (!Number.isFinite(maxValue) || maxValue <= 0) {
    return '0%';
  }

  const metricValue = getCountryMetricValue(country, sortMode);
  if (!Number.isFinite(metricValue)) {
    return '0%';
  }
  const normalized = sortMode === 'budget' ? Math.abs(metricValue) : Math.max(metricValue, 0);
  return `${Math.max(8, (normalized / maxValue) * 100)}%`;
}

export default function CostSummaryDashboard({
  costSummary,
  costData,
  excludedCountries,
  setExcludedCountries,
}: CostSummaryDashboardProps): JSX.Element {
  const today = getTodayLocalDay();
  const [selectedTripSpendingDate, setSelectedTripSpendingDate] = useState<string | null>(null);
  const [countrySortMode, setCountrySortMode] = useState<SortMode>('net');
  const [selectedCountryKey, setSelectedCountryKey] = useState<string | null>(null);
  const [categoryScope, setCategoryScope] = useState<CategoryScope>('all');

  const analytics = useMemo(
    () => buildCostDashboardAnalytics(costSummary, costData, excludedCountries),
    [costSummary, costData, excludedCountries]
  );

  const normalizeDate = (value: Date | string): Date => parseDateAsLocalDay(value) || new Date(NaN);

  const tripStartDate = normalizeDate(costData.tripStartDate);
  const tripEndDate = normalizeDate(costData.tripEndDate);
  const includedActualTripExpenses = useMemo(() => {
    return filterExpensesByExcludedCountries(costData.expenses, excludedCountries).filter(expense => {
      if ((expense.expenseType || 'actual') !== 'actual') {
        return false;
      }

      const expenseDate = normalizeDate(expense.date);
      return expenseDate >= tripStartDate && expenseDate <= tripEndDate;
    });
  }, [costData.expenses, excludedCountries, tripEndDate, tripStartDate]);
  const tripSpendingHistory = useMemo(() => {
    if (
      costSummary.tripStatus === 'before' ||
      !analytics.tripWindow.end ||
      !Number.isFinite(tripStartDate.getTime()) ||
      !Number.isFinite(tripEndDate.getTime())
    ) {
      return [] as { date: string; amount: number }[];
    }

    const windowEnd = analytics.tripWindow.end;
    const historyWindow = 7;
    const earliestDay = (() => {
      const candidate = new Date(windowEnd);
      candidate.setDate(candidate.getDate() - (historyWindow - 1));
      return candidate < tripStartDate ? new Date(tripStartDate) : candidate;
    })();
    const dayTotals = new Map<string, number>();

    includedActualTripExpenses.forEach(expense => {
      const expenseDate = normalizeDate(expense.date);
      if (expenseDate < earliestDay || expenseDate > windowEnd) {
        return;
      }

      const dateKey = formatLocalDateInput(expenseDate);
      dayTotals.set(dateKey, (dayTotals.get(dateKey) || 0) + expense.amount);
    });

    const history: { date: string; amount: number }[] = [];
    const cursor = new Date(earliestDay);

    while (cursor <= windowEnd) {
      const dateKey = formatLocalDateInput(cursor);
      history.push({
        date: dateKey,
        amount: dayTotals.get(dateKey) || 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    return history;
  }, [analytics.tripWindow.end, costSummary.tripStatus, includedActualTripExpenses, tripEndDate, tripStartDate]);
  const tripExpensesByDay = useMemo(() => {
    const grouped = new Map<string, Expense[]>();

    includedActualTripExpenses.forEach(expense => {
      const expenseDate = normalizeDate(expense.date);
      const dateKey = formatLocalDateInput(expenseDate);
      const existing = grouped.get(dateKey);

      if (existing) {
        existing.push(expense);
      } else {
        grouped.set(dateKey, [expense]);
      }
    });

    return grouped;
  }, [includedActualTripExpenses]);

  const selectedTripSpendingDetail = useMemo<TripDayExpenseDetail | null>(() => {
    if (!selectedTripSpendingDate) {
      return null;
    }

    const dayExpenses = [...(tripExpensesByDay.get(selectedTripSpendingDate) || [])]
      .sort((left, right) => Math.abs(right.amount) - Math.abs(left.amount));

    return {
      dateKey: selectedTripSpendingDate,
      expenses: dayExpenses,
      total: dayExpenses.reduce((sum, expense) => sum + expense.amount, 0),
    };
  }, [selectedTripSpendingDate, tripExpensesByDay]);

  const selectedTripSpendingLabel = useMemo(() => {
    if (!selectedTripSpendingDetail) {
      return '';
    }

    const date = parseDateAsLocalDay(selectedTripSpendingDetail.dateKey);
    if (!date) {
      return selectedTripSpendingDetail.dateKey;
    }

    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  }, [selectedTripSpendingDetail]);

  const getAverageForDateRange = (startDate: Date, endDate: Date) => {
    if (
      costSummary.tripStatus === 'before' ||
      !analytics.tripWindow.end ||
      !Number.isFinite(startDate.getTime()) ||
      !Number.isFinite(endDate.getTime()) ||
      endDate < tripStartDate
    ) {
      return { average: 0, total: 0, days: 0 };
    }

    const effectiveStart = startDate < tripStartDate ? tripStartDate : startDate;
    const msPerDay = 1000 * 60 * 60 * 24;
    const days = Math.floor((endDate.getTime() - effectiveStart.getTime()) / msPerDay) + 1;

    if (days <= 0) {
      return { average: 0, total: 0, days: 0 };
    }

    const total = includedActualTripExpenses
      .filter(expense => {
        const expenseDate = normalizeDate(expense.date);
        return expenseDate >= effectiveStart && expenseDate <= endDate;
      })
      .reduce((sum, expense) => sum + expense.amount, 0);

    return { average: total / days, total, days };
  };

  const calculateRangeAverage = (rangeDays: number) => {
    if (!analytics.tripWindow.end) {
      return { average: 0, total: 0, days: 0 };
    }

    const windowEnd = analytics.tripWindow.end;
    const rangeStart = new Date(windowEnd);
    rangeStart.setDate(rangeStart.getDate() - (rangeDays - 1));
    return getAverageForDateRange(rangeStart, windowEnd);
  };

  const calculateTrend = (rangeDays: number, currentAverage: number) => {
    if (!analytics.tripWindow.end) {
      return { trend: 'flat' as const, delta: 0 };
    }

    const activeEnd = analytics.tripWindow.end;
    const previousRangeEnd = new Date(activeEnd);
    previousRangeEnd.setDate(previousRangeEnd.getDate() - rangeDays);
    const previousRangeStart = new Date(previousRangeEnd);
    previousRangeStart.setDate(previousRangeStart.getDate() - (rangeDays - 1));

    const { average: previousAverage } = getAverageForDateRange(previousRangeStart, previousRangeEnd);
    const delta = previousAverage > 0 ? ((currentAverage - previousAverage) / previousAverage) * 100 : 0;
    const trend: TrendDirection = delta > 2 ? 'up' : delta < -2 ? 'down' : 'flat';

    return { trend, delta };
  };

  const weeklyAverage = calculateRangeAverage(7);
  const weeklyTrend = calculateTrend(7, weeklyAverage.average);
  const monthlyAverage = calculateRangeAverage(30);
  const monthlyTrend = calculateTrend(30, monthlyAverage.average);

  const sortedCountryRows = useMemo(() => {
    return [...analytics.countryRows].sort((left, right) => {
      const leftMetric = getCountryMetricValue(left, countrySortMode);
      const rightMetric = getCountryMetricValue(right, countrySortMode);
      const leftFinite = Number.isFinite(leftMetric);
      const rightFinite = Number.isFinite(rightMetric);

      if (leftFinite !== rightFinite) {
        return leftFinite ? -1 : 1;
      }

      if (leftFinite && rightFinite && rightMetric !== leftMetric) {
        return rightMetric - leftMetric;
      }

      return right.netSpent - left.netSpent || left.country.localeCompare(right.country);
    });
  }, [analytics.countryRows, countrySortMode]);

  const resolvedSelectedCountryKey = sortedCountryRows.some(country => country.key === selectedCountryKey)
    ? selectedCountryKey
    : sortedCountryRows[0]?.key ?? null;
  const selectedCountry = sortedCountryRows.find(country => country.key === resolvedSelectedCountryKey) || null;
  const categoryRows = categoryScope === 'selected' && selectedCountry
    ? selectedCountry.categoryRows
    : analytics.allCategoryRows;
  const maxCountryMetricValue = sortedCountryRows.reduce((maxValue, country) => {
    const metricValue = getCountryMetricValue(country, countrySortMode);
    if (!Number.isFinite(metricValue)) {
      return maxValue;
    }
    const comparable = countrySortMode === 'budget' ? Math.abs(metricValue) : Math.max(metricValue, 0);
    return comparable > maxValue ? comparable : maxValue;
  }, 0);
  const maxCategoryAmount = categoryRows.reduce((maxValue, category) => Math.max(maxValue, category.amount), 0);

  const includedSpendingDisplay = formatCurrencyWithRefunds(
    analytics.includedSpending,
    analytics.includedRefunds,
    costData.currency
  );
  const isCompletedTrip = costSummary.tripStatus === 'after';
  const budgetBalanceTone = costSummary.availableForPlanning >= 0 ? 'emerald' : 'rose';
  const budgetBalanceLabel = isCompletedTrip ? 'Final balance' : 'Available to plan';
  const budgetBalanceSupporting = isCompletedTrip ? 'Budget less actual and planned spend.' : 'Budget left for upcoming spend.';
  const historyHeading = isCompletedTrip ? 'Final trip days' : 'Recent trip spending';

  const toggleExcludedCountry = (country: string) => {
    setExcludedCountries(previous => (
      previous.includes(country)
        ? previous.filter(entry => entry !== country)
        : [...previous, country]
    ));
  };

  const categoryScopeLabel = categoryScope === 'selected' && selectedCountry
    ? `${selectedCountry.country} only`
    : 'All included countries';

  return (
    <div style={DASHBOARD_THEME} className="space-y-6 text-[color:var(--cost-board-ink)] dark:text-slate-100">
      <section className={`${surfaceClassName} overflow-hidden`}>
        <div className="border-b border-slate-200/70 bg-slate-50/90 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/70 md:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-2xl font-semibold tracking-tight">
                Cost overview
              </h3>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-white/70 px-4 py-2.5 text-sm text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300">
              <p className="font-semibold text-slate-900 dark:text-slate-100">
                Through {formatWindowLabel(analytics.tripWindow.end)}
              </p>
              <p className="mt-1">
                {analytics.includedDays} day{analytics.includedDays === 1 ? '' : 's'} counted
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-2 xl:grid-cols-3 md:p-6">
          <MetricCard
            label={budgetBalanceLabel}
            value={formatCurrency(costSummary.availableForPlanning, costData.currency)}
            supporting={budgetBalanceSupporting}
            detail={costSummary.reservedBudget > 0
              ? `${formatCurrency(costSummary.reservedBudget, costData.currency)} reserved.`
              : undefined}
            tone={budgetBalanceTone}
          />
          {isCompletedTrip ? (
            <>
              <MetricCard
                label="Actual spend"
                value={includedSpendingDisplay.displayText}
                supporting="Pre-trip and trip-date actuals."
                detail={analytics.includedRefunds > 0
                  ? `${formatCurrency(analytics.includedRefunds, costData.currency)} refunded.`
                  : undefined}
                tone="slate"
              />
              <MetricCard
                label="Trip average"
                value={analytics.includedAveragePerDay === null ? 'N/A' : formatCurrency(analytics.includedAveragePerDay, costData.currency)}
                supporting={analytics.includedDays > 0
                  ? `${analytics.includedDays} day${analytics.includedDays === 1 ? '' : 's'} counted.`
                  : 'No days in view.'}
                detail={excludedCountries.length > 0
                  ? 'Actual spend, exclusions applied.'
                  : 'Actual spend over trip days.'}
                tone="sky"
              />
            </>
          ) : (
            <MetricCard
              label="Daily budget"
              value={formatCurrency(costSummary.suggestedDailyBudget, costData.currency)}
              supporting={`${costSummary.dailyBudgetBasisDays} ${costSummary.tripStatus === 'before' ? 'trip' : 'remaining'} day${costSummary.dailyBudgetBasisDays === 1 ? '' : 's'}.`}
              detail={costSummary.tripStatus === 'before' ? 'Before trip start.' : 'Current commitments included.'}
              tone="cobalt"
            />
          )}
          {!isCompletedTrip ? (
            <>
              <MetricCard
                label="Actual spend"
                value={includedSpendingDisplay.displayText}
                supporting="Pre-trip and trip-date actuals."
                detail={analytics.includedRefunds > 0
                  ? `${formatCurrency(analytics.includedRefunds, costData.currency)} refunded.`
                  : undefined}
                tone="slate"
              />
              <MetricCard
                label="Included daily average"
                value={analytics.includedAveragePerDay === null ? 'N/A' : formatCurrency(analytics.includedAveragePerDay, costData.currency)}
                supporting={analytics.includedDays > 0
                  ? `${analytics.includedDays} day${analytics.includedDays === 1 ? '' : 's'} counted.`
                  : 'No days in view.'}
                detail={excludedCountries.length > 0
                  ? 'Actual spend, exclusions applied.'
                  : 'Actual spend over trip days.'}
                tone="sky"
              />
            </>
          ) : null}
          <MetricCard
            label="Days"
            value={`${analytics.includedDays}`}
            supporting={costSummary.tripStatus === 'before'
              ? 'Trip not started.'
              : `${analytics.tripWindow.dayCount} before exclusions.`}
            detail={excludedCountries.length > 0
              ? `${analytics.tripWindow.dayCount - analytics.includedDays} removed.`
              : undefined}
            tone="amber"
          />
          <MetricCard
            label="Countries in view"
            value={`${analytics.includedCountryCount}`}
            supporting={analytics.categoryCount > 0 ? `${analytics.categoryCount} categor${analytics.categoryCount === 1 ? 'y' : 'ies'}.` : 'No categories yet.'}
            tone="slate"
          />
          {isCompletedTrip ? (
            <MetricCard
              label="Dated during trip"
              value={formatCurrency(costSummary.tripSpent, costData.currency)}
              supporting="Transaction dates inside the trip."
              detail={costSummary.tripRefunds > 0 ? `${formatCurrency(costSummary.tripRefunds, costData.currency)} refunded.` : undefined}
              tone="cobalt"
            />
          ) : null}
        </div>
      </section>

      <section className={`${surfaceClassName} p-5 md:p-6`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h4 className="text-lg font-semibold tracking-tight">Countries</h4>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Toggle analytics scope.
            </p>
          </div>
          {excludedCountries.length > 0 ? (
            <button
              type="button"
              onClick={() => setExcludedCountries([])}
              className="inline-flex items-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Reset filters
            </button>
          ) : null}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {analytics.availableCountryOptions.map(country => {
            const isExcluded = analytics.excludedCountryLabels.includes(country);
            return (
              <button
                key={country}
                type="button"
                onClick={() => toggleExcludedCountry(country)}
                aria-pressed={isExcluded}
                aria-label={`${isExcluded ? 'Include' : 'Exclude'} ${country} from analytics`}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  isExcluded
                    ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200'
                    : 'border-slate-200 bg-slate-100/80 text-slate-700 hover:border-slate-300 hover:bg-slate-200/80 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                {country}
              </button>
            );
          })}
        </div>

        {analytics.excludedCountryLabels.length > 0 ? (
          <div className="mt-4 space-y-1 text-sm text-slate-600 dark:text-slate-300">
            <p>
              Excluding: <span className="font-semibold text-slate-900 dark:text-slate-100">{analytics.excludedCountryLabels.join(', ')}</span>
            </p>
            <p className="text-xs">
              General and Unassigned do not change day counts.
            </p>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
            All countries included.
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[1.6fr_1fr]">
        <section className={`${surfaceClassName} p-5 md:p-6`}>
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h4 className="text-xl font-semibold tracking-tight">{historyHeading}</h4>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Select a day.
            </p>
          </div>

          {tripSpendingHistory.length > 0 ? (
            <div className="mt-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
                {tripSpendingHistory.map(entry => {
                  const [year, month, day] = entry.date.split('-').map(Number);
                  const labelDate = !Number.isNaN(year) && !Number.isNaN(month) && !Number.isNaN(day)
                    ? new Date(year, month - 1, day)
                    : (parseDateAsLocalDay(entry.date) || today);
                  const dayLabel = labelDate.toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  });
                  const isSelected = selectedTripSpendingDate === entry.date;
                  const expenseCount = tripExpensesByDay.get(entry.date)?.length || 0;
                  return (
                    <button
                      key={entry.date}
                      type="button"
                      onClick={() => setSelectedTripSpendingDate(entry.date)}
                      className={`min-w-0 rounded-xl border px-3 py-2.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                        isSelected
                          ? 'border-blue-400 bg-blue-50 shadow-sm dark:border-blue-500 dark:bg-blue-950/40'
                          : 'border-slate-200 bg-slate-50/80 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-900'
                      }`}
                      aria-label={`Show expenses for ${dayLabel}`}
                      aria-pressed={isSelected}
                      title={`Show expenses for ${dayLabel}`}
                    >
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                        {dayLabel}
                      </div>
                      <div className="mt-1 text-base font-semibold leading-tight text-slate-900 dark:text-slate-100">
                        {formatCurrency(entry.amount, costData.currency)}
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {expenseCount} expense{expenseCount === 1 ? '' : 's'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-[1.25rem] border border-dashed border-slate-300 bg-slate-50/80 p-6 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
              No trip-day spending yet.
            </div>
          )}
        </section>

        <section className={`${surfaceClassName} p-5 md:p-6`}>
          <h4 className="text-xl font-semibold tracking-tight">
            {isCompletedTrip ? 'Trip result' : 'Pace'}
          </h4>

          <div className="mt-4 grid grid-cols-1 gap-3">
            {isCompletedTrip ? (
              <>
                <MetricCard
                  label="Average per day"
                  value={formatCurrency(costSummary.averageSpentPerTripDay, costData.currency)}
                  supporting={`${costSummary.totalDays} trip day${costSummary.totalDays === 1 ? '' : 's'}.`}
                  tone="sky"
                />
                <MetricCard
                  label={costSummary.availableForPlanning >= 0 ? 'Under budget' : 'Over budget'}
                  value={formatCurrency(Math.abs(costSummary.availableForPlanning), costData.currency)}
                  supporting="After actual and planned spend."
                  tone={budgetBalanceTone}
                />
                <MetricCard
                  label="Post-trip spend"
                  value={formatCurrency(costSummary.postTripSpent, costData.currency)}
                  supporting={costSummary.postTripRefunds > 0 ? `${formatCurrency(costSummary.postTripRefunds, costData.currency)} refunded.` : 'After trip end.'}
                  tone="slate"
                />
              </>
            ) : (
              <>
                <MetricCard
                  label="7-day average"
                  value={formatCurrency(weeklyAverage.average, costData.currency)}
                  supporting={weeklyAverage.days > 0 ? `${weeklyAverage.days} day${weeklyAverage.days === 1 ? '' : 's'}.` : 'No recent spend.'}
                  detail={trendLabel(weeklyTrend.trend, weeklyTrend.delta)}
                  tone="emerald"
                />
                <MetricCard
                  label="30-day average"
                  value={formatCurrency(monthlyAverage.average, costData.currency)}
                  supporting={monthlyAverage.days > 0 ? `${monthlyAverage.days} day${monthlyAverage.days === 1 ? '' : 's'}.` : 'No monthly spend.'}
                  detail={trendLabel(monthlyTrend.trend, monthlyTrend.delta)}
                  tone="sky"
                />
                <MetricCard
                  label="Current trip pace"
                  value={formatCurrency(costSummary.averageSpentPerTripDay, costData.currency)}
                  supporting={costSummary.tripStatus === 'before'
                    ? 'Starts with the trip.'
                    : `${costSummary.daysCompleted} day${costSummary.daysCompleted === 1 ? '' : 's'} elapsed.`}
                  tone="cobalt"
                />
              </>
            )}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[1.25fr_0.9fr]">
        <section className={`${surfaceClassName} p-5 md:p-6`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
                Country analysis
              </p>
              <h4 className="mt-2 text-xl font-semibold tracking-tight">Country spend</h4>
            </div>
            <SegmentedControl
              ariaLabel="Country ranking sort"
              value={countrySortMode}
              onChange={setCountrySortMode}
              options={[
                { value: 'net', label: 'Net spend' },
                { value: 'daily', label: 'Avg/day' },
                { value: 'budget', label: 'Budget left' },
              ]}
            />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[1.3fr_0.9fr]">
            <div className="space-y-3">
              {sortedCountryRows.length > 0 ? (
                sortedCountryRows.map(country => {
                  const isSelected = selectedCountry?.key === country.key;
                  const isNegativeBudget = country.budgetAmount > 0 && country.budgetDelta < 0;
                  return (
                    <button
                      key={country.key}
                      type="button"
                      onClick={() => {
                        setSelectedCountryKey(country.key);
                        setCategoryScope('selected');
                      }}
                      className={`w-full rounded-[1.15rem] border p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                        isSelected
                          ? 'border-blue-400 bg-blue-50 shadow-sm dark:border-blue-500 dark:bg-blue-950/35'
                          : 'border-slate-200 bg-white/80 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/35 dark:hover:bg-slate-900/60'
                      }`}
                      aria-pressed={isSelected}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-base font-semibold text-slate-950 dark:text-slate-100">{country.country}</span>
                            {!country.isItineraryCountry ? (
                              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                Non-itinerary
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            {country.coverageDays} day{country.coverageDays === 1 ? '' : 's'} • {country.expenseCount} expense{country.expenseCount === 1 ? '' : 's'}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {getCountryMetricLabel(country, countrySortMode, costData.currency)}
                          </div>
                          <div className={`mt-1 text-xs font-medium ${isNegativeBudget ? 'text-rose-600 dark:text-rose-300' : 'text-slate-500 dark:text-slate-400'}`}>
                            {country.budgetAmount > 0 ? `${country.budgetDelta < 0 ? 'Over' : 'Left'} ${formatCurrency(Math.abs(country.budgetDelta), costData.currency)}` : 'No budget'}
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 h-2 rounded-full bg-slate-200 dark:bg-slate-800">
                        <div
                          className={`h-full rounded-full ${
                            countrySortMode === 'budget'
                              ? (isNegativeBudget ? 'bg-rose-500' : 'bg-emerald-500')
                              : 'bg-blue-600 dark:bg-blue-400'
                          }`}
                          style={{ width: getCountryBarWidth(country, countrySortMode, maxCountryMetricValue) }}
                        />
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-500 dark:text-slate-400 sm:grid-cols-3">
                        <div>Net spend: <span className="font-semibold text-slate-800 dark:text-slate-200">{formatCurrency(country.netSpent, costData.currency)}</span></div>
                        <div>Avg/day: <span className="font-semibold text-slate-800 dark:text-slate-200">{formatCurrency(country.averagePerDay, costData.currency)}</span></div>
                        <div>Planned: <span className="font-semibold text-slate-800 dark:text-slate-200">{formatCurrency(country.plannedNet, costData.currency)}</span></div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-[1.2rem] border border-dashed border-slate-300 bg-slate-50/80 p-6 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
                  No country spending is available for the current filters.
                </div>
              )}
            </div>

            <div className="rounded-[1.25rem] border border-slate-200 bg-[color:var(--cost-board-panel-strong)] p-5 dark:border-slate-800 dark:bg-slate-950/60">
              {selectedCountry ? (
                <>
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
                    Country detail
                  </p>
                  <h5 className="mt-2 text-2xl font-semibold tracking-tight">{selectedCountry.country}</h5>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <MetricCard
                      label="Net spend"
                      value={formatCurrency(selectedCountry.netSpent, costData.currency)}
                      supporting={`${selectedCountry.coverageDays} day${selectedCountry.coverageDays === 1 ? '' : 's'}.`}
                      tone="slate"
                    />
                    <MetricCard
                      label="Avg/day"
                      value={formatCurrency(selectedCountry.averagePerDay, costData.currency)}
                      supporting={selectedCountry.isItineraryCountry ? 'Unique days.' : 'No day-count effect.'}
                      tone="sky"
                    />
                  </div>

                  <div className="mt-5 space-y-2 rounded-[1rem] border border-slate-200 bg-white/80 p-4 text-sm dark:border-slate-800 dark:bg-slate-900/55">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Refunds</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(selectedCountry.refunds, costData.currency)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Planned</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(selectedCountry.plannedNet, costData.currency)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Post-trip</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(selectedCountry.postTripNet, costData.currency)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Budget delta</span>
                      <span className={`font-semibold ${selectedCountry.budgetAmount > 0 && selectedCountry.budgetDelta < 0 ? 'text-rose-600 dark:text-rose-300' : 'text-slate-900 dark:text-slate-100'}`}>
                        {selectedCountry.budgetAmount > 0 ? formatCurrency(selectedCountry.budgetDelta, costData.currency) : 'No budget'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 rounded-[1rem] border border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/55">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Coverage</p>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                      {selectedCountry.hasConfiguredPeriods
                        ? `${selectedCountry.periodCount} configured period${selectedCountry.periodCount === 1 ? '' : 's'}, union counted.`
                        : selectedCountry.isItineraryCountry
                          ? 'Falls back to distinct expense dates.'
                          : 'Informational only.'}
                    </p>
                  </div>

                  <div className="mt-5 rounded-[1rem] border border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/55">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Top categories</p>
                      <button
                        type="button"
                        onClick={() => setCategoryScope('selected')}
                        className="text-xs font-semibold text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
                      >
                        Show below
                      </button>
                    </div>
                    {selectedCountry.categoryRows.length > 0 ? (
                      <ul className="mt-3 space-y-2">
                        {selectedCountry.categoryRows.slice(0, 5).map(category => (
                          <li key={category.category} className="flex items-center justify-between text-sm">
                            <span className="text-slate-600 dark:text-slate-300">{category.category}</span>
                            <span className="font-semibold text-slate-900 dark:text-slate-100">
                              {formatCurrency(category.amount, costData.currency)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                        No category data available for this country.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <div className="rounded-[1.2rem] border border-dashed border-slate-300 bg-slate-50/80 p-6 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
                  Select a country for details.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className={`${surfaceClassName} p-5 md:p-6`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
                Category analysis
              </p>
              <h4 className="mt-2 text-xl font-semibold tracking-tight">Category mix</h4>
            </div>
            <SegmentedControl
              ariaLabel="Category analysis scope"
              value={categoryScope}
              onChange={setCategoryScope}
              options={[
                { value: 'all', label: 'All included' },
                { value: 'selected', label: selectedCountry ? selectedCountry.country : 'Selected country' },
              ]}
            />
          </div>

          <div className="mt-4 text-sm text-slate-500 dark:text-slate-400">
            {categoryScopeLabel}
          </div>

          <div className="mt-5 space-y-3">
            {categoryRows.length > 0 ? (
              categoryRows.map((category: DashboardCategoryRow) => (
                <div key={category.category} className="rounded-[1rem] border border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/55">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-slate-950 dark:text-slate-100">{category.category}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                        {category.count} expense{category.count === 1 ? '' : 's'} • {formatShare(category.share)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-slate-950 dark:text-slate-100">
                        {formatCurrency(category.amount, costData.currency)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-slate-200 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-slate-900 dark:bg-slate-100"
                      style={{ width: maxCategoryAmount > 0 ? `${Math.max(10, (category.amount / maxCategoryAmount) * 100)}%` : '0%' }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[1.2rem] border border-dashed border-slate-300 bg-slate-50/80 p-6 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
                {categoryScope === 'selected' && selectedCountry
                  ? `${selectedCountry.country} has no visible category breakdown for the current filters.`
                  : 'No category data for these filters.'}
              </div>
            )}
          </div>
        </section>
      </div>

      <section className={`${surfaceClassName} overflow-hidden`}>
        <div className="border-b border-slate-200/70 px-5 py-4 dark:border-slate-800 md:px-6">
          <h4 className="text-xl font-semibold tracking-tight">Country table</h4>
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50/80 text-left text-xs uppercase tracking-[0.18em] text-slate-500 dark:bg-slate-950/60 dark:text-slate-400">
              <tr>
                <th className="px-6 py-3">Country</th>
                <th className="px-6 py-3">Budget</th>
                <th className="px-6 py-3">Net spent</th>
                <th className="px-6 py-3">Refunds</th>
                <th className="px-6 py-3">Days</th>
                <th className="px-6 py-3">Avg/day</th>
                <th className="px-6 py-3">Remaining</th>
                <th className="px-6 py-3">Planned</th>
              </tr>
            </thead>
            <tbody>
              {sortedCountryRows.map(country => (
                <tr key={country.key} className="border-t border-slate-200/70 dark:border-slate-800">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCountryKey(country.key);
                          setCategoryScope('selected');
                        }}
                        className="font-semibold text-slate-950 underline-offset-4 hover:underline dark:text-slate-100"
                      >
                        {country.country}
                      </button>
                      {!country.isItineraryCountry ? (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          Non-itinerary
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-300">
                    {country.budgetAmount > 0 ? formatCurrency(country.budgetAmount, costData.currency) : 'No budget'}
                  </td>
                  <td className="px-6 py-4 font-semibold text-slate-950 dark:text-slate-100">
                    {formatCurrency(country.netSpent, costData.currency)}
                  </td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-300">
                    {formatCurrency(country.refunds, costData.currency)}
                  </td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-300">
                    {country.coverageDays}
                  </td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-300">
                    {formatCurrency(country.averagePerDay, costData.currency)}
                  </td>
                  <td className={`px-6 py-4 font-semibold ${country.budgetAmount > 0 && country.budgetDelta < 0 ? 'text-rose-600 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
                    {country.budgetAmount > 0 ? formatCurrency(country.budgetDelta, costData.currency) : 'No budget'}
                  </td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-300">
                    {formatCurrency(country.plannedNet, costData.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 p-4 md:hidden">
          {sortedCountryRows.map(country => (
            <div key={country.key} className="rounded-[1rem] border border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/55">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCountryKey(country.key);
                      setCategoryScope('selected');
                    }}
                    className="text-left text-base font-semibold text-slate-950 underline-offset-4 hover:underline dark:text-slate-100"
                  >
                    {country.country}
                  </button>
                  {!country.isItineraryCountry ? (
                    <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      Non-itinerary
                    </div>
                  ) : null}
                </div>
                <div className={`text-sm font-semibold ${country.budgetAmount > 0 && country.budgetDelta < 0 ? 'text-rose-600 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
                  {country.budgetAmount > 0 ? formatCurrency(country.budgetDelta, costData.currency) : 'No budget'}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Net spent</p>
                  <p className="mt-1 font-semibold text-slate-950 dark:text-slate-100">{formatCurrency(country.netSpent, costData.currency)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Refunds</p>
                  <p className="mt-1 font-semibold text-slate-950 dark:text-slate-100">{formatCurrency(country.refunds, costData.currency)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Days</p>
                  <p className="mt-1 font-semibold text-slate-950 dark:text-slate-100">{country.coverageDays}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Avg/day</p>
                  <p className="mt-1 font-semibold text-slate-950 dark:text-slate-100">{formatCurrency(country.averagePerDay, costData.currency)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <AccessibleModal
        isOpen={Boolean(selectedTripSpendingDetail)}
        onClose={() => setSelectedTripSpendingDate(null)}
        title={selectedTripSpendingLabel ? `Expenses for ${selectedTripSpendingLabel}` : 'Daily Expenses'}
        size="md"
      >
        {selectedTripSpendingDetail ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {selectedTripSpendingDetail.expenses.length} expense{selectedTripSpendingDetail.expenses.length === 1 ? '' : 's'} recorded
              </p>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {formatCurrency(selectedTripSpendingDetail.total, costData.currency)}
              </p>
            </div>

            {selectedTripSpendingDetail.expenses.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-300">
                No actual trip expenses were recorded for this day.
              </p>
            ) : (
              <ul className="space-y-2">
                {selectedTripSpendingDetail.expenses.map(expense => {
                  const countryLabel = expense.country?.trim() ? expense.country : 'General';
                  const categoryLabel = expense.category?.trim() ? expense.category : 'Uncategorized';
                  const trimmedDescription = expense.description?.trim() || '';
                  const trimmedNotes = expense.notes?.trim() || '';
                  const travelDescription = expense.travelReference?.description?.trim() || '';
                  const isGenericCashDescription = isCashAllocation(expense) && CASH_SPENDING_FALLBACK_PATTERN.test(trimmedDescription);
                  const displayDescription = (() => {
                    if (!isGenericCashDescription) {
                      return trimmedDescription || 'Untitled expense';
                    }
                    if (trimmedNotes) {
                      return trimmedNotes;
                    }
                    if (travelDescription) {
                      return travelDescription;
                    }
                    if (categoryLabel !== 'Uncategorized') {
                      return `${categoryLabel} (cash spending)`;
                    }
                    return trimmedDescription || 'Cash spending';
                  })();
                  return (
                    <li
                      key={expense.id}
                      className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {displayDescription}
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            {categoryLabel} • {countryLabel}
                          </p>
                          {trimmedNotes && trimmedNotes !== displayDescription ? (
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              {trimmedNotes}
                            </p>
                          ) : null}
                        </div>
                        <p className={`text-sm font-semibold ${expense.amount < 0 ? 'text-green-600 dark:text-green-300' : 'text-red-600 dark:text-red-300'}`}>
                          {formatCurrency(expense.amount, costData.currency)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
      </AccessibleModal>
    </div>
  );
}
