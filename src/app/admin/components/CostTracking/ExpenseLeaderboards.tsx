'use client';

import { useMemo, useState } from 'react';
import { Expense } from '../../../types';
import { formatCurrency } from '../../../lib/costUtils';

type LeaderboardEntry = {
  key: string;
  label: string;
  count: number;
  total: number;
  countries: Array<{ country: string; count: number; total: number }>;
};

interface ExpenseLeaderboardsProps {
  expenses: Expense[];
  currency: string;
  minimumMentions?: number;
}

interface LeaderboardSectionProps {
  title: string;
  description: string;
  entries: LeaderboardEntry[];
  currency: string;
  minimumMentions: number;
}

const DEFAULT_MINIMUM_MENTIONS = 3;

const normalizeLabel = (value: string): string => value.trim().toLowerCase();

const buildLeaderboardEntries = (
  expenses: Expense[],
  getLabel: (expense: Expense) => string | undefined
): LeaderboardEntry[] => {
  const groups = new Map<
    string,
    {
      label: string;
      count: number;
      total: number;
      countries: Map<string, { country: string; count: number; total: number }>;
    }
  >();

  expenses.forEach(expense => {
    const rawLabel = getLabel(expense);
    if (!rawLabel) return;
    const trimmed = rawLabel.trim();
    if (!trimmed) return;
    const key = normalizeLabel(trimmed);
    const country = expense.country?.trim() || 'General';

    const existing = groups.get(key) ?? {
      label: trimmed,
      count: 0,
      total: 0,
      countries: new Map()
    };

    existing.count += 1;
    existing.total += expense.amount;

    const countryEntry = existing.countries.get(country) ?? {
      country,
      count: 0,
      total: 0
    };

    countryEntry.count += 1;
    countryEntry.total += expense.amount;
    existing.countries.set(country, countryEntry);

    groups.set(key, existing);
  });

  return Array.from(groups.entries()).map(([key, value]) => ({
    key,
    label: value.label,
    count: value.count,
    total: value.total,
    countries: Array.from(value.countries.values()).sort((a, b) => b.total - a.total)
  }));
};

const sortByCount = (entries: LeaderboardEntry[]) =>
  [...entries].sort((a, b) => b.count - a.count || b.total - a.total || a.label.localeCompare(b.label));

const sortByTotal = (entries: LeaderboardEntry[]) =>
  [...entries].sort((a, b) => b.total - a.total || b.count - a.count || a.label.localeCompare(b.label));

const LeaderboardList = ({
  title,
  entries,
  currency,
  selectedKey,
  onSelect
}: {
  title: string;
  entries: LeaderboardEntry[];
  currency: string;
  selectedKey: string | null;
  onSelect: (key: string) => void;
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
            <div className="text-xs text-gray-500 dark:text-gray-400">{entry.count} mentions</div>
          </div>
          <div className="text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
            {formatCurrency(entry.total, currency)}
          </div>
        </button>
      ))}
      {entries.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">No repeated items meet the minimum yet.</p>
      )}
    </div>
  </div>
);

const LeaderboardSection = ({
  title,
  description,
  entries,
  currency,
  minimumMentions
}: LeaderboardSectionProps) => {
  const [selectedKey, setSelectedKey] = useState<string | null>(entries[0]?.key ?? null);

  const filteredEntries = useMemo(
    () => entries.filter(entry => entry.count >= minimumMentions),
    [entries, minimumMentions]
  );

  const selectedEntry = filteredEntries.find(entry => entry.key === selectedKey) ?? filteredEntries[0];

  const countSorted = useMemo(() => sortByCount(filteredEntries), [filteredEntries]);
  const totalSorted = useMemo(() => sortByTotal(filteredEntries), [filteredEntries]);

  return (
    <section className="space-y-4">
      <div>
        <h5 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h5>
        <p className="text-sm text-gray-600 dark:text-gray-300">{description}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Showing entries with at least {minimumMentions} mentions.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <LeaderboardList
              title="Most Mentioned"
              entries={countSorted}
              currency={currency}
              selectedKey={selectedEntry?.key ?? null}
              onSelect={setSelectedKey}
            />
            <LeaderboardList
              title="Highest Cost"
              entries={totalSorted}
              currency={currency}
              selectedKey={selectedEntry?.key ?? null}
              onSelect={setSelectedKey}
            />
          </div>
        </div>
        <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h6 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Country Breakdown</h6>
          {selectedEntry ? (
            <div className="mt-3 space-y-2 text-sm">
              <div className="font-medium text-gray-900 dark:text-gray-100">{selectedEntry.label}</div>
              {selectedEntry.countries.map(country => (
                <div key={country.country} className="flex items-center justify-between text-gray-700 dark:text-gray-200">
                  <div>
                    {country.country}
                    <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                      {country.count} mention{country.count === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="font-semibold">{formatCurrency(country.total, currency)}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Select an entry to see the country split.
            </p>
          )}
        </div>
      </div>
    </section>
  );
};

export default function ExpenseLeaderboards({
  expenses,
  currency,
  minimumMentions = DEFAULT_MINIMUM_MENTIONS
}: ExpenseLeaderboardsProps) {
  const descriptionEntries = useMemo(
    () => buildLeaderboardEntries(expenses, expense => expense.description),
    [expenses]
  );
  const payeeEntries = useMemo(
    () => buildLeaderboardEntries(expenses, expense => expense.notes || expense.source),
    [expenses]
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
    </div>
  );
}
