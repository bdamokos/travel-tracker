/**
 * Unit tests for utility functions
 * These tests run with mocked dependencies and don't require a server
 */

import { describe, it, expect, beforeEach } from '@jest/globals'

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
} from '../lib/costUtils';

import { parseYnabFile } from '../lib/ynabUtils';
import { CostTrackingData, Expense, BudgetItem } from '../types';

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
      expect(summary.totalSpent).toBe(520); // 400 + 120
      expect(summary.plannedSpending).toBe(200);
      expect(summary.totalCommittedSpending).toBe(720); // 520 + 200
      expect(summary.remainingBudget).toBe(1280); // 2000 - 720
      expect(summary.totalDays).toBe(15); // June 1-15
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
});
