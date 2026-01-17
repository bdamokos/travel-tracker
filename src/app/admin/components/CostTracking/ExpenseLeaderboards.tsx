'use client';

import { useCallback, useMemo, useState } from 'react';
import { Expense, Location } from '@/app/types';
import { formatCurrency } from '@/app/lib/costUtils';
import { calculateDurationInDays } from '@/app/lib/durationUtils';
import { LocationExpenseTotal } from '@/app/lib/expenseTravelLookup';
import { getExpenseCountryLabel } from '@/app/lib/countryInclusions';

type LeaderboardBreakdownItem = {
  label: string;
  count: number;
  total: number;
};

type LeaderboardEntry = {
  key: string;
  label: string;
  count: number;
  total: number;
  breakdowns: LeaderboardBreakdownItem[];
  days?: number;
  perDayTotal?: number;
};

interface ExpenseLeaderboardsProps {
  expenses: Expense[];
  currency: string;
  minimumMentions?: number;
  locationTotals?: Record<string, LocationExpenseTotal> | null;
  locations?: Location[];
}

interface LeaderboardSectionProps {
  title: string;
  description: string;
  entries: LeaderboardEntry[];
  currency: string;
  minimumMentions: number;
  breakdownTitle?: string;
  emptyBreakdownMessage?: string;
  emptySelectionMessage?: string;
  headerExtras?: React.ReactNode;
  getTotalValue?: (entry: LeaderboardEntry) => number;
  getBreakdownTotal?: (entry: LeaderboardEntry, breakdown: LeaderboardBreakdownItem) => number;
  mostExpensesTitle?: string;
  highestCostTitle?: string;
}

const DEFAULT_MINIMUM_MENTIONS = 3;
const LOCATION_COST_OPTIONS = [
  { key: 'total' as const, label: 'Total' },
  { key: 'perDay' as const, label: 'Per day' }
];
type CategoryBreakdownMode = 'country' | 'payee';

const CATEGORY_BREAKDOWN_OPTIONS: { key: CategoryBreakdownMode; label: string }[] = [
  { key: 'country', label: 'Country' },
  { key: 'payee', label: 'Payee' }
];

/**
 * Normalizes a label string for consistent grouping by trimming whitespace and converting to lowercase.
 */
const normalizeLabel = (value: string): string => value.trim().toLowerCase();

/**
 * Groups expenses into leaderboard entries with nested breakdowns.
 * @param expenses - Array of expenses to group
 * @param getLabel - Function to extract the primary grouping label from an expense
 * @param getBreakdownLabel - Function to extract the breakdown label for sub-grouping
 * @returns Array of leaderboard entries sorted by total amount within breakdowns
 */
const buildGenericLeaderboardEntries = (
  expenses: Expense[],
  getLabel: (expense: Expense) => string | undefined,
  getBreakdownLabel: (expense: Expense) => string
): LeaderboardEntry[] => {
  const groups = new Map<
    string,
    {
      label: string;
      count: number;
      total: number;
      breakdowns: Map<string, LeaderboardBreakdownItem>;
    }
  >();

  expenses.forEach(expense => {
    const rawLabel = getLabel(expense);
    if (!rawLabel) return;
    const trimmed = rawLabel.trim();
    if (!trimmed) return;
    const key = normalizeLabel(trimmed);
    const breakdownLabel = getBreakdownLabel(expense);

    const existing = groups.get(key) ?? {
      label: trimmed,
      count: 0,
      total: 0,
      breakdowns: new Map()
    };

    existing.count += 1;
    existing.total += expense.amount;

    const breakdownEntry = existing.breakdowns.get(breakdownLabel) ?? {
      label: breakdownLabel,
      count: 0,
      total: 0
    };

    breakdownEntry.count += 1;
    breakdownEntry.total += expense.amount;
    existing.breakdowns.set(breakdownLabel, breakdownEntry);

    groups.set(key, existing);
  });

  return Array.from(groups.entries()).map(([key, value]) => ({
    key,
    label: value.label,
    count: value.count,
    total: value.total,
    breakdowns: Array.from(value.breakdowns.values()).sort((a, b) => b.total - a.total)
  }));
};

/**
 * Builds leaderboard entries grouped by a custom label with country-based breakdowns.
 * @param expenses - Array of expenses to group
 * @param getLabel - Function to extract the grouping label (e.g., description or payee)
 * @returns Array of leaderboard entries with country breakdowns
 */
const buildLeaderboardEntries = (
  expenses: Expense[],
  getLabel: (expense: Expense) => string | undefined
): LeaderboardEntry[] =>
  buildGenericLeaderboardEntries(
    expenses,
    getLabel,
    expense => getExpenseCountryLabel(expense)
  );

/**
 * Builds leaderboard entries grouped by expense category with toggleable breakdowns.
 * @param expenses - Array of expenses to group by category
 * @param breakdownType - Whether to break down by 'country' or 'payee'
 * @returns Array of category leaderboard entries with the selected breakdown type
 */
const buildCategoryLeaderboardEntries = (
  expenses: Expense[],
  breakdownType: CategoryBreakdownMode
): LeaderboardEntry[] =>
  buildGenericLeaderboardEntries(
    expenses,
    expense => expense.category,
    expense =>
      breakdownType === 'country'
        ? getExpenseCountryLabel(expense)
        : expense.notes?.trim() || expense.source?.trim() || 'Unknown'
  );

/**
 * Calculates the number of days spent at a location.
 * Uses explicit duration if available, otherwise calculates from date range, defaulting to 1.
 */
const getLocationDays = (location: Location): number => {
  if (location.duration && location.duration > 0) {
    return location.duration;
  }

  if (location.date && location.endDate) {
    return calculateDurationInDays(location.date, location.endDate);
  }

  return 1;
};

/**
 * Builds leaderboard entries for locations with expense totals and category breakdowns.
 * Includes per-day calculations for cost comparison across locations with different durations.
 */
const buildLocationEntries = (
  locationTotals: Record<string, LocationExpenseTotal>,
  locations: Location[]
): LeaderboardEntry[] =>
  locations
    .filter(location => locationTotals[location.id])
    .map(location => {
      const total = locationTotals[location.id];
      const days = getLocationDays(location);
      const perDayTotal = days > 0 ? total.amount / days : total.amount;
      const breakdowns = total.categories
        ? Object.values(total.categories)
            .sort((a, b) => b.amount - a.amount)
            .map(category => ({
              label: category.category,
              count: category.count,
              total: category.amount
            }))
        : [];
      return {
        key: location.id,
        label: location.name || 'Unnamed location',
        count: total.count,
        total: total.amount,
        breakdowns,
        days,
        perDayTotal
      };
    });

/**
 * Sorts leaderboard entries by expense count (descending), then by total value, then alphabetically.
 */
const sortByCount = (
  entries: LeaderboardEntry[],
  getTotalValue: (entry: LeaderboardEntry) => number = entry => entry.total
) =>
  [...entries].sort(
    (a, b) => b.count - a.count || getTotalValue(b) - getTotalValue(a) || a.label.localeCompare(b.label)
  );

/**
 * Sorts leaderboard entries by total value (descending), then by count, then alphabetically.
 */
const sortByTotal = (
  entries: LeaderboardEntry[],
  getTotalValue: (entry: LeaderboardEntry) => number = entry => entry.total
) =>
  [...entries].sort(
    (a, b) => getTotalValue(b) - getTotalValue(a) || b.count - a.count || a.label.localeCompare(b.label)
  );

/**
 * Displays a selectable list of leaderboard entries with expense counts and totals.
 * Used to show "Most Expenses" and "Highest Cost" rankings within a leaderboard section.
 */
const LeaderboardList = ({
  title,
  entries,
  currency,
  selectedKey,
  onSelect,
  getTotalValue = entry => entry.total
}: {
  title: string;
  entries: LeaderboardEntry[];
  currency: string;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  getTotalValue?: (entry: LeaderboardEntry) => number;
}) => (
  <div className="space-y-3 rounded-md border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
    <div className="flex items-center justify-between">
      <h6 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</h6>
      <span className="text-xs text-gray-500 dark:text-gray-400">{entries.length} items</span>
    </div>
    <div className="space-y-2">
      {entries.map(entry => (
        <button
          key={entry.key}
          type="button"
          onClick={() => onSelect(entry.key)}
          className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition ${
            selectedKey === entry.key
              ? 'border-blue-500 bg-blue-50 text-blue-900 dark:border-blue-400 dark:bg-blue-900/30 dark:text-blue-100'
              : 'border-gray-200 bg-white text-gray-700 hover:border-blue-200 hover:bg-blue-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-blue-500/40 dark:hover:bg-blue-900/20'
          }`}
        >
          <div>
            <div className="font-medium">{entry.label}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{entry.count} expenses</div>
          </div>
          <div className="text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
            {formatCurrency(getTotalValue(entry), currency)}
          </div>
        </button>
      ))}
      {entries.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">No repeated items meet the minimum yet.</p>
      )}
    </div>
  </div>
);

/**
 * A complete leaderboard section with dual-sorted lists and a breakdown detail panel.
 * Displays entries sorted by both count and total value, with an interactive breakdown view.
 */
const LeaderboardSection = ({
  title,
  description,
  entries,
  currency,
  minimumMentions,
  breakdownTitle = 'Country Breakdown',
  emptyBreakdownMessage = 'No country breakdown available.',
  emptySelectionMessage = 'Select an entry to see the country split.',
  headerExtras,
  getTotalValue = entry => entry.total,
  getBreakdownTotal = (_entry, breakdown) => breakdown.total,
  mostExpensesTitle = 'Most Expenses',
  highestCostTitle = 'Highest Cost'
}: LeaderboardSectionProps) => {
  const filteredEntries = useMemo(
    () => entries.filter(entry => entry.count >= minimumMentions),
    [entries, minimumMentions]
  );

  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const selectedEntry = filteredEntries.find(entry => entry.key === selectedKey) ?? filteredEntries[0];

  const countSorted = useMemo(() => sortByCount(filteredEntries, getTotalValue), [filteredEntries, getTotalValue]);
  const totalSorted = useMemo(() => sortByTotal(filteredEntries, getTotalValue), [filteredEntries, getTotalValue]);

  return (
    <section className="space-y-4">
      <div>
        <h5 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h5>
        <p className="text-sm text-gray-600 dark:text-gray-300">{description}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Showing entries with at least {minimumMentions} expenses.
        </p>
        {headerExtras && <div className="mt-3">{headerExtras}</div>}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <LeaderboardList
              title={mostExpensesTitle}
              entries={countSorted}
              currency={currency}
              selectedKey={selectedEntry?.key ?? null}
              onSelect={setSelectedKey}
              getTotalValue={getTotalValue}
            />
            <LeaderboardList
              title={highestCostTitle}
              entries={totalSorted}
              currency={currency}
              selectedKey={selectedEntry?.key ?? null}
              onSelect={setSelectedKey}
              getTotalValue={getTotalValue}
            />
          </div>
        </div>
        <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h6 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{breakdownTitle}</h6>
          {selectedEntry ? (
            <div className="mt-3 space-y-2 text-sm">
              <div className="font-medium text-gray-900 dark:text-gray-100">{selectedEntry.label}</div>
              {selectedEntry.breakdowns.length > 0 ? (
                selectedEntry.breakdowns.map(breakdown => (
                  <div key={breakdown.label} className="flex items-center justify-between text-gray-700 dark:text-gray-200">
                    <div>
                      {breakdown.label}
                      <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                        {breakdown.count} expense{breakdown.count === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="font-semibold">
                      {formatCurrency(getBreakdownTotal(selectedEntry, breakdown), currency)}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">{emptyBreakdownMessage}</p>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {emptySelectionMessage}
            </p>
          )}
        </div>
      </div>
    </section>
  );
};

/**
 * Displays expense analytics through multiple leaderboard views.
 * Includes sections for repeated descriptions, payees, category analysis, and location-based spending.
 * Category analysis supports toggling between country and payee breakdowns.
 */
export default function ExpenseLeaderboards({
  expenses,
  currency,
  minimumMentions = DEFAULT_MINIMUM_MENTIONS,
  locationTotals,
  locations
}: ExpenseLeaderboardsProps) {
  const [locationCostMode, setLocationCostMode] = useState<'total' | 'perDay'>('total');
  const [categoryBreakdownMode, setCategoryBreakdownMode] = useState<CategoryBreakdownMode>('country');

  const descriptionEntries = useMemo(
    () => buildLeaderboardEntries(expenses, expense => expense.description),
    [expenses]
  );
  const payeeEntries = useMemo(
    () => buildLeaderboardEntries(expenses, expense => expense.notes || expense.source),
    [expenses]
  );
  const categoryEntries = useMemo(
    () => buildCategoryLeaderboardEntries(expenses, categoryBreakdownMode),
    [expenses, categoryBreakdownMode]
  );
  const locationEntries = useMemo(() => {
    if (!locationTotals || !locations) {
      return [];
    }

    return buildLocationEntries(locationTotals, locations);
  }, [locationTotals, locations]);

  const locationTotalValue = useCallback(
    (entry: LeaderboardEntry) =>
      locationCostMode === 'perDay' ? entry.perDayTotal ?? entry.total : entry.total,
    [locationCostMode]
  );

  const locationBreakdownTotal = useCallback(
    (entry: LeaderboardEntry, breakdown: LeaderboardBreakdownItem) => {
      if (locationCostMode === 'perDay' && entry.days && entry.days > 0) {
        return breakdown.total / entry.days;
      }
      return breakdown.total;
    },
    [locationCostMode]
  );

  const locationHighestCostTitle = locationCostMode === 'perDay' ? 'Highest Cost/Day' : 'Highest Cost';

  const locationHeaderExtras = (
    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600 dark:text-gray-300">
      <span className="font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Cost view</span>
      <div
        role="group"
        aria-label="Cost view mode"
        className="inline-flex rounded-full border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-800"
      >
        {LOCATION_COST_OPTIONS.map(option => (
          <button
            key={option.key}
            type="button"
            onClick={() => setLocationCostMode(option.key)}
            aria-pressed={locationCostMode === option.key}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              locationCostMode === option.key
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );

  const categoryHeaderExtras = (
    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600 dark:text-gray-300">
      <span className="font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Breakdown by</span>
      <div
        role="group"
        aria-label="Category breakdown mode"
        className="inline-flex rounded-full border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-800"
      >
        {CATEGORY_BREAKDOWN_OPTIONS.map(option => (
          <button
            key={option.key}
            type="button"
            onClick={() => setCategoryBreakdownMode(option.key)}
            aria-pressed={categoryBreakdownMode === option.key}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              categoryBreakdownMode === option.key
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      <LeaderboardSection
        title="Repeated Descriptions"
        description="Track recurring expense descriptions to spot frequent purchases."
        entries={descriptionEntries}
        currency={currency}
        minimumMentions={minimumMentions}
      />
      <LeaderboardSection
        title="Repeated Payees (Notes)"
        description="See which payees show up most often based on the notes field."
        entries={payeeEntries}
        currency={currency}
        minimumMentions={minimumMentions}
      />
      <LeaderboardSection
        title="Category Spending Analysis"
        description="Discover where your budget actually goes by exploring spending patterns within each category."
        entries={categoryEntries}
        currency={currency}
        minimumMentions={minimumMentions}
        breakdownTitle={categoryBreakdownMode === 'country' ? 'Country Breakdown' : 'Payee Breakdown'}
        emptyBreakdownMessage={
          categoryBreakdownMode === 'country'
            ? 'No country breakdown available for this category.'
            : 'No payee breakdown available for this category.'
        }
        emptySelectionMessage={
          categoryBreakdownMode === 'country'
            ? 'Select a category to see spending by country.'
            : 'Select a category to see which payees drive spending.'
        }
        headerExtras={categoryHeaderExtras}
      />
      {locationEntries.length > 0 && (
        <LeaderboardSection
          title="Top Locations by Spend"
          description="Compare linked expenses by location to spot the biggest spenders or switch to per-day rates."
          entries={locationEntries}
          currency={currency}
          minimumMentions={1}
          breakdownTitle="Category Breakdown"
          emptyBreakdownMessage="No category breakdown available."
          emptySelectionMessage="Select an entry to see the category split."
          headerExtras={locationHeaderExtras}
          getTotalValue={locationTotalValue}
          getBreakdownTotal={locationBreakdownTotal}
          highestCostTitle={locationHighestCostTitle}
        />
      )}
    </div>
  );
}
