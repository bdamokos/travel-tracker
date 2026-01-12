/**
 * Unit tests for utility functions
 * These tests run with mocked dependencies and don't require a server
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals'

// Example unit test for utility functions
describe('Utility Functions', () => {
  it('should be able to run unit tests', () => {
    // Simple test to verify unit test setup
    expect(true).toBe(true)
  })

  it('should handle basic math operations', () => {
    const result = 2 + 2
    expect(result).toBe(4)
  })
})

// Integration tests for core business workflows
import {
  formatCurrency,
  calculateCostSummary,
  generateId,
  getExpensesByCountry,
  EXPENSE_CATEGORIES
} from '@/app/lib/costUtils';

import { parseAccommodationData } from '@/app/lib/privacyUtils';

import { parseYnabFile } from '@/app/lib/ynabUtils';
import { CostTrackingData, Expense, BudgetItem } from '@/app/types';

describe('Core Business Workflow Tests', () => {
  
  describe('Expense Management Workflow', () => {
    let testCostData: CostTrackingData;

    beforeEach(() => {
      testCostData = {
        id: 'test-cost-data',
        tripId: 'test-trip',
        tripTitle: 'Test Trip',
        tripStartDate: new Date('2024-06-01'),
        tripEndDate: new Date('2024-06-15'),
        overallBudget: 3000,
        currency: 'EUR', // Real default from codebase
        countryBudgets: [],
        expenses: [],
        createdAt: new Date().toISOString()
      };
    });

    it('should add expense and auto-create country budget', () => {
      const newExpense: Expense = {
        id: generateId(),
        date: new Date('2024-06-05'),
        amount: 50,
        currency: 'EUR',
        category: 'Food & Dining', // Use real category from EXPENSE_CATEGORIES
        country: 'France',
        description: 'Restaurant meal',
        expenseType: 'actual'
      };

      // Simulate the handleExpenseAdded workflow
      testCostData.expenses.push(newExpense);
      
      // Auto-create country budget (as done in CostTrackerEditor)
      if (!newExpense.isGeneralExpense && newExpense.country) {
        const existingBudget = testCostData.countryBudgets.find(b => b.country === newExpense.country);
        if (!existingBudget) {
          const newBudget: BudgetItem = {
            id: generateId(),
            country: newExpense.country,
            currency: testCostData.currency,
            notes: 'Auto-created when adding expense'
          };
          testCostData.countryBudgets.push(newBudget);
        }
      }

      expect(testCostData.expenses).toHaveLength(1);
      expect(testCostData.countryBudgets).toHaveLength(1);
      expect(testCostData.countryBudgets[0].country).toBe('France');
      expect(testCostData.countryBudgets[0].notes).toBe('Auto-created when adding expense');
    });

    it('should update expense correctly', () => {
      const originalExpense: Expense = {
        id: 'expense-1',
        date: new Date('2024-06-05'),
        amount: 50,
        currency: 'EUR',
        category: 'Food & Dining',
        country: 'France',
        description: 'Original meal',
        expenseType: 'actual'
      };

      testCostData.expenses.push(originalExpense);

      // Update expense (simulate editing workflow)
      const updatedExpense = {
        ...originalExpense,
        amount: 75,
        description: 'Updated meal cost'
      };

      const expenseIndex = testCostData.expenses.findIndex(e => e.id === originalExpense.id);
      testCostData.expenses[expenseIndex] = updatedExpense;

      expect(testCostData.expenses[0].amount).toBe(75);
      expect(testCostData.expenses[0].description).toBe('Updated meal cost');
      expect(testCostData.expenses[0].id).toBe('expense-1'); // ID unchanged
    });

    it('should filter expenses by country correctly', () => {
      testCostData.expenses = [
        {
          id: 'exp1',
          date: new Date('2024-06-01'),
          amount: 100,
          currency: 'EUR',
          category: 'Accommodation',
          country: 'France',
          description: 'Hotel',
          expenseType: 'actual'
        },
        {
          id: 'exp2',
          date: new Date('2024-06-02'),
          amount: 80,
          currency: 'EUR',
          category: 'Food & Dining',
          country: 'Italy',
          description: 'Restaurant',
          expenseType: 'actual'
        },
        {
          id: 'exp3',
          date: new Date('2024-06-03'),
          amount: 60,
          currency: 'EUR',
          category: 'Food & Dining',
          country: 'France',
          description: 'Cafe',
          expenseType: 'actual'
        }
      ];

      const franceExpenses = getExpensesByCountry(testCostData.expenses, 'France');
      
      expect(franceExpenses).toHaveLength(2);
      expect(franceExpenses.every(e => e.country === 'France')).toBe(true);
      expect(franceExpenses.map(e => e.amount)).toEqual([100, 60]);
    });
  });

  describe('Cost Summary Financial Calculations', () => {
    it('should calculate cost summary with real expense data correctly', () => {
      const costData: CostTrackingData = {
        id: 'test',
        tripId: 'trip-1',
        tripTitle: 'Real Trip Test',
        tripStartDate: new Date('2024-06-01'),
        tripEndDate: new Date('2024-06-15'),
        overallBudget: 2000,
        currency: 'EUR',
        countryBudgets: [
          {
            id: 'budget-france',
            country: 'France',
            amount: 1000,
            currency: 'EUR',
            notes: 'France budget'
          }
        ],
        expenses: [
          {
            id: 'exp1',
            date: new Date('2024-05-25'), // Pre-trip
            amount: 400,
            currency: 'EUR',
            category: 'Transportation',
            country: 'General',
            description: 'Flight booking',
            expenseType: 'actual',
            isGeneralExpense: true
          },
          {
            id: 'exp2',
            date: new Date('2024-06-03'), // During trip
            amount: 120,
            currency: 'EUR',
            category: 'Food & Dining',
            country: 'France',
            description: 'Dinner',
            expenseType: 'actual'
          },
          {
            id: 'exp3',
            date: new Date('2024-06-10'), // Planned expense
            amount: 200,
            currency: 'EUR',
            category: 'Activities & Tours',
            country: 'France',
            description: 'Museum tickets',
            expenseType: 'planned'
          }
        ],
        createdAt: new Date().toISOString()
      };

      const summary = calculateCostSummary(costData);

      expect(summary.totalBudget).toBe(2000);
      expect(summary.reservedBudget).toBe(0);
      expect(summary.spendableBudget).toBe(2000);
      expect(summary.totalSpent).toBe(520); // 400 + 120
      expect(summary.plannedSpending).toBe(200);
      expect(summary.totalCommittedSpending).toBe(720); // 520 + 200
      expect(summary.remainingBudget).toBe(1280); // 2000 - 720
      expect(summary.totalDays).toBe(15); // June 1-15
    });

    it('should exclude reserved budget from available planning and daily suggestions', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-06-05T12:00:00.000Z'));

      try {
        const costData: CostTrackingData = {
          id: 'reserved-test',
          tripId: 'trip-1',
          tripTitle: 'Reserved Budget Trip',
          tripStartDate: new Date('2024-06-01'),
          tripEndDate: new Date('2024-06-10'),
          overallBudget: 4000,
          reservedBudget: 800,
          currency: 'EUR',
          countryBudgets: [],
          expenses: [
            {
              id: 'actual-expense',
              date: new Date('2024-06-03'),
              amount: 200,
              currency: 'EUR',
              category: 'Food & Dining',
              country: 'General',
              description: 'Meals',
              expenseType: 'actual',
              isGeneralExpense: true
            },
            {
              id: 'planned-expense',
              date: new Date('2024-06-08'),
              amount: 300,
              currency: 'EUR',
              category: 'Transportation',
              country: 'General',
              description: 'Train',
              expenseType: 'planned',
              isGeneralExpense: true
            }
          ],
          createdAt: new Date().toISOString()
        };

        const summary = calculateCostSummary(costData);

        // Spendable budget should exclude reserved funds
        expect(summary.spendableBudget).toBe(3200);
        expect(summary.reservedBudget).toBe(800);

        // Available for planning should use spendable budget
        expect(summary.availableForPlanning).toBe(3200 - (200 + 300));
        expect(summary.remainingBudget).toBe(2700);

        // Daily budget suggestion should respect reservation
        const expectedRemainingDays = Math.max(1, summary.dailyBudgetBasisDays);
        expect(summary.suggestedDailyBudget).toBeCloseTo(summary.availableForPlanning / expectedRemainingDays);
      } finally {
        jest.useRealTimers();
      }
    });

    it('should keep recent trip spending buckets aligned to UTC dates', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2025-10-08T12:00:00.000Z'));

      try {
        const costData: CostTrackingData = {
          id: 'tz-test',
          tripId: 'trip-utc',
          tripTitle: 'Timezone Check',
          tripStartDate: new Date('2025-10-01T00:00:00.000Z'),
          tripEndDate: new Date('2025-10-10T00:00:00.000Z'),
          overallBudget: 5000,
          currency: 'EUR',
          countryBudgets: [],
          expenses: [
            {
              id: 'exp-oct6',
              date: new Date('2025-10-06T00:00:00.000Z'),
              amount: 85,
              currency: 'EUR',
              category: 'Transportation',
              country: 'Brazil',
              description: 'Metro',
              expenseType: 'actual'
            },
            {
              id: 'exp-oct7-1',
              date: new Date('2025-10-07T00:00:00.000Z'),
              amount: 3.03,
              currency: 'EUR',
              category: 'Food & Dining',
              country: 'Brazil',
              description: 'Airport snack',
              expenseType: 'actual'
            },
            {
              id: 'exp-oct7-2',
              date: new Date('2025-10-07T00:00:00.000Z'),
              amount: 1.27,
              currency: 'EUR',
              category: 'Transportation',
              country: 'Brazil',
              description: 'Bus fare',
              expenseType: 'actual'
            },
            {
              id: 'exp-oct7-3',
              date: new Date('2025-10-07T00:00:00.000Z'),
              amount: 0.11,
              currency: 'EUR',
              category: 'Miscellaneous',
              country: 'Brazil',
              description: 'Exchange fee',
              expenseType: 'actual'
            }
          ],
          createdAt: new Date().toISOString()
        };

        const summary = calculateCostSummary(costData);
        const oct7Entry = summary.recentTripSpending.find(entry => entry.date === '2025-10-07');

        expect(oct7Entry?.amount).toBeCloseTo(4.41);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('YNAB Import Workflow', () => {
    it('should parse valid YNAB TSV data correctly', () => {
      const mockYnabTsv = `Account	Flag	Date	Payee	Category Group/Category	Category Group	Category	Memo	Outflow	Inflow
Checking		2024-06-01	Restaurant ABC	Food & Dining	Food & Dining	Food & Dining	Dinner in Paris	€25.50	
Checking		2024-06-02	Hotel XYZ	Accommodation	Accommodation	Accommodation	Hotel stay	€150.00	
Checking		2024-06-03	Refund	Food & Dining	Food & Dining	Food & Dining	Meal refund		€10.00`;

      const result = parseYnabFile(mockYnabTsv);

      expect(result.transactions).toHaveLength(2); // Only outflow transactions are included
      expect(result.categories).toContain('Food & Dining');
      expect(result.categories).toContain('Accommodation');
      expect(result.totalLines).toBe(3);
      expect(result.skippedLines).toBe(1); // The inflow-only line is skipped
    });

    it('should handle invalid YNAB format gracefully', () => {
      const invalidTsv = `Invalid	Header	Format
Some	Invalid	Data`;

      expect(() => parseYnabFile(invalidTsv)).toThrow('File must contain a "Category" column');
    });
  });

  describe('Currency Formatting', () => {
    it('should format EUR currency correctly (default for app)', () => {
      expect(formatCurrency(1234.56, 'EUR')).toBe('€1,234.56');
      expect(formatCurrency(1000, 'EUR')).toBe('€1,000');
      expect(formatCurrency(0, 'EUR')).toBe('€0');
    });

    it('should handle negative amounts (refunds)', () => {
      expect(formatCurrency(-25.50, 'EUR')).toBe('-€25.5'); // Actual behavior: no trailing zero
    });
  });

  describe('Expense Categories', () => {
    it('should include all expected expense categories', () => {
      // Test actual categories from the codebase
      expect(EXPENSE_CATEGORIES).toContain('Food & Dining');
      expect(EXPENSE_CATEGORIES).toContain('Accommodation');
      expect(EXPENSE_CATEGORIES).toContain('Transportation');
      expect(EXPENSE_CATEGORIES).toContain('Activities & Tours');
      expect(EXPENSE_CATEGORIES.length).toBeGreaterThan(5);
    });
  });

  describe('ID Generation', () => {
    it('should generate unique IDs for expenses and budgets', () => {
      const id1 = generateId();
      const id2 = generateId();
      
      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe('string');
      expect(id1.length).toBeGreaterThan(10); // Should be reasonable length
    });
  });

  describe('Accommodation Data Parsing', () => {
    it('should parse multi-line YAML notes correctly', () => {
      const testYaml = `---
name: Test Hotel
address: 123 Main St
notes: |
  This is a multi-line note.
  It should preserve all lines.
  Including this third line.
website: https://example.com
---`;

      const result = parseAccommodationData(testYaml);
      
      expect(result.isStructured).toBe(true);
      expect(result.data).not.toBeNull();
      expect(result.data?.name).toBe('Test Hotel');
      expect(result.data?.address).toBe('123 Main St');
      expect(result.data?.website).toBe('https://example.com');
      
      // Test that multi-line notes are preserved
      expect(result.data?.notes).toBeDefined();
      const noteLines = result.data?.notes?.split('\n') || [];
      expect(noteLines.length).toBe(3);
      expect(noteLines[0]).toBe('This is a multi-line note.');
      expect(noteLines[1]).toBe('It should preserve all lines.');
      expect(noteLines[2]).toBe('Including this third line.');
    });

    it('should handle YAML with multi-line notes followed by additional keys', () => {
      const testYaml = `---
name: Hotel with Complex Notes
notes: |
  First line of notes
  Second line of notes
phone: +1-555-0123
checkin: 15:00
---`;

      const result = parseAccommodationData(testYaml);
      
      expect(result.isStructured).toBe(true);
      expect(result.data?.name).toBe('Hotel with Complex Notes');
      expect(result.data?.phone).toBe('+1-555-0123');
      expect(result.data?.checkin).toBe('15:00');
      
      const noteLines = result.data?.notes?.split('\n') || [];
      expect(noteLines.length).toBe(2);
      expect(noteLines[0]).toBe('First line of notes');
      expect(noteLines[1]).toBe('Second line of notes');
    });

    it('should handle non-YAML accommodation data as plain text', () => {
      const plainText = 'Just some plain text accommodation notes';
      
      const result = parseAccommodationData(plainText);
      
      expect(result.isStructured).toBe(false);
      expect(result.data).toBeNull();
      expect(result.rawText).toBe(plainText);
    });
  });
});
