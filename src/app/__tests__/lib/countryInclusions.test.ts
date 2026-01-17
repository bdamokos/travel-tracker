import { describe, it, expect } from '@jest/globals';
import type { Expense } from '@/app/types';
import {
  GENERAL_COUNTRY_LABEL,
  UNASSIGNED_COUNTRY_LABEL,
  deriveExcludedCountries,
  filterExpensesByExcludedCountries,
  getExpenseCountryLabel
} from '@/app/lib/countryInclusions';

const baseExpense: Expense = {
  id: 'expense-1',
  date: new Date('2024-01-01'),
  amount: 10,
  currency: 'EUR',
  category: 'Food',
  country: 'France',
  description: 'Lunch',
  expenseType: 'actual',
};

describe('countryInclusions', () => {
  describe('getExpenseCountryLabel', () => {
    it('returns General for general expenses', () => {
      const expense: Expense = { ...baseExpense, isGeneralExpense: true, country: 'France' };
      expect(getExpenseCountryLabel(expense)).toBe(GENERAL_COUNTRY_LABEL);
    });

    it('returns trimmed country for non-general expenses', () => {
      const expense: Expense = { ...baseExpense, isGeneralExpense: false, country: '  Japan  ' };
      expect(getExpenseCountryLabel(expense)).toBe('Japan');
    });

    it('returns Unassigned when country is blank for non-general expenses', () => {
      const expense: Expense = { ...baseExpense, isGeneralExpense: false, country: '   ' };
      expect(getExpenseCountryLabel(expense)).toBe(UNASSIGNED_COUNTRY_LABEL);
    });
  });

  describe('deriveExcludedCountries', () => {
    it('adds Unassigned when General is excluded', () => {
      const derived = deriveExcludedCountries([GENERAL_COUNTRY_LABEL]);
      expect(derived.has(GENERAL_COUNTRY_LABEL)).toBe(true);
      expect(derived.has(UNASSIGNED_COUNTRY_LABEL)).toBe(true);
    });

    it('does not add Unassigned when General is not excluded', () => {
      const derived = deriveExcludedCountries(['France']);
      expect(derived.has(UNASSIGNED_COUNTRY_LABEL)).toBe(false);
    });
  });

  describe('filterExpensesByExcludedCountries', () => {
    it('filters expenses based on derived excluded countries', () => {
      const expenses: Expense[] = [
        { ...baseExpense, id: 'fr', country: 'France', isGeneralExpense: false },
        { ...baseExpense, id: 'jp', country: 'Japan', isGeneralExpense: false },
        { ...baseExpense, id: 'gen', country: 'General', isGeneralExpense: true },
        { ...baseExpense, id: 'unas', country: '', isGeneralExpense: false },
      ];

      const filtered = filterExpensesByExcludedCountries(expenses, [GENERAL_COUNTRY_LABEL, 'Japan']);
      const filteredIds = new Set(filtered.map(e => e.id));

      expect(filteredIds.has('fr')).toBe(true);
      expect(filteredIds.has('jp')).toBe(false);
      expect(filteredIds.has('gen')).toBe(false);
      // Unassigned is implicitly excluded when General is excluded.
      expect(filteredIds.has('unas')).toBe(false);
    });
  });
});

