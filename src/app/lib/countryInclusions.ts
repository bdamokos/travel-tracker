import type { Expense } from '@/app/types';

export const GENERAL_COUNTRY_LABEL = 'General';
export const UNASSIGNED_COUNTRY_LABEL = 'Unassigned';

export function getExpenseCountryLabel(expense: Expense): string {
  if (expense.isGeneralExpense) {
    return GENERAL_COUNTRY_LABEL;
  }

  const country = expense.country?.trim();
  return country ? country : UNASSIGNED_COUNTRY_LABEL;
}

export function deriveExcludedCountries(excludedCountries: string[]): Set<string> {
  const derived = new Set(excludedCountries);

  // Align with charts: excluding "General" also removes unassigned/no-country expenses.
  if (derived.has(GENERAL_COUNTRY_LABEL)) {
    derived.add(UNASSIGNED_COUNTRY_LABEL);
  }

  return derived;
}

export function filterExpensesByExcludedCountries(expenses: Expense[], excludedCountries: string[]): Expense[] {
  if (excludedCountries.length === 0) {
    return expenses;
  }

  const excluded = deriveExcludedCountries(excludedCountries);
  return expenses.filter(expense => !excluded.has(getExpenseCountryLabel(expense)));
}

