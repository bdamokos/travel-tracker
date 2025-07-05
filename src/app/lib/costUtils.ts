import { CostTrackingData, CostSummary, CountryBreakdown, Expense, BudgetItem } from '../types';

/**
 * Calculate comprehensive cost summary from cost tracking data
 */
export function calculateCostSummary(costData: CostTrackingData): CostSummary {
  const totalBudget = costData.overallBudget;
  const totalSpent = costData.expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const remainingBudget = totalBudget - totalSpent;
  
  const today = new Date();
  const startDate = new Date(costData.tripStartDate);
  const endDate = new Date(costData.tripEndDate);
  
  // Calculate total days and remaining days
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24));
  const remainingDays = Math.max(0, Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 3600 * 24)));
  
  // Calculate averages
  const daysElapsed = Math.max(1, totalDays - remainingDays);
  const averageSpentPerDay = totalSpent / daysElapsed;
  const suggestedDailyBudget = remainingDays > 0 ? remainingBudget / remainingDays : 0;
  
  // Calculate country breakdowns
  const countryBreakdown = calculateCountryBreakdowns(costData);
  
  return {
    totalBudget,
    totalSpent,
    remainingBudget,
    totalDays,
    remainingDays,
    averageSpentPerDay,
    suggestedDailyBudget,
    countryBreakdown
  };
}

/**
 * Calculate breakdown by country
 */
export function calculateCountryBreakdowns(costData: CostTrackingData): CountryBreakdown[] {
  const countryMap = new Map<string, CountryBreakdown>();
  
  // Initialize with country budgets
  costData.countryBudgets.forEach(budget => {
    countryMap.set(budget.country, {
      country: budget.country,
      budgetAmount: budget.amount,
      spentAmount: 0,
      remainingAmount: budget.amount,
      days: 0,
      averagePerDay: 0,
      expenses: []
    });
  });
  
  // Add expenses to countries
  costData.expenses.forEach(expense => {
    if (!expense.isGeneralExpense && expense.country) {
      if (!countryMap.has(expense.country)) {
        // Create entry for countries without explicit budget
        countryMap.set(expense.country, {
          country: expense.country,
          budgetAmount: 0,
          spentAmount: 0,
          remainingAmount: 0,
          days: 0,
          averagePerDay: 0,
          expenses: []
        });
      }
      
      const countryData = countryMap.get(expense.country)!;
      countryData.spentAmount += expense.amount;
      countryData.remainingAmount = countryData.budgetAmount - countryData.spentAmount;
      countryData.expenses.push(expense);
    }
  });
  
  // Calculate days and averages for each country
  const startDate = new Date(costData.tripStartDate);
  const endDate = new Date(costData.tripEndDate);
  
  countryMap.forEach(countryData => {
    // Calculate days spent in country based on expenses
    const countryExpenseDates = countryData.expenses.map(e => new Date(e.date));
    if (countryExpenseDates.length > 0) {
      const minDate = new Date(Math.min(...countryExpenseDates.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...countryExpenseDates.map(d => d.getTime())));
      countryData.days = Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 3600 * 24)) + 1;
    } else {
      countryData.days = 0;
    }
    
    countryData.averagePerDay = countryData.days > 0 ? countryData.spentAmount / countryData.days : 0;
  });
  
  return Array.from(countryMap.values()).sort((a, b) => b.spentAmount - a.spentAmount);
}

/**
 * Get expenses by date range
 */
export function getExpensesByDateRange(expenses: Expense[], startDate: string, endDate: string): Expense[] {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  return expenses.filter(expense => {
    const expenseDate = new Date(expense.date);
    return expenseDate >= start && expenseDate <= end;
  });
}

/**
 * Get expenses by country
 */
export function getExpensesByCountry(expenses: Expense[], country: string): Expense[] {
  return expenses.filter(expense => expense.country === country);
}

/**
 * Get expenses by category
 */
export function getExpensesByCategory(expenses: Expense[], category: string): Expense[] {
  return expenses.filter(expense => expense.category === category);
}

/**
 * Calculate daily spending trend
 */
export function calculateDailySpendingTrend(expenses: Expense[]): { date: string; amount: number }[] {
  const dailySpending = new Map<string, number>();
  
  expenses.forEach(expense => {
    const date = expense.date;
    dailySpending.set(date, (dailySpending.get(date) || 0) + expense.amount);
  });
  
  return Array.from(dailySpending.entries())
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/**
 * Get common expense categories
 */
export const EXPENSE_CATEGORIES = [
  'Accommodation',
  'Food & Dining',
  'Transportation',
  'Activities & Tours',
  'Shopping',
  'Insurance',
  'Visas & Documentation',
  'Medical',
  'Entertainment',
  'Miscellaneous'
] as const;

/**
 * Generate unique ID for new items
 */
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Format currency amount
 */
export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(amount);
}

/**
 * Format date for display
 */
export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Calculate percentage
 */
export function calculatePercentage(value: number, total: number): number {
  return total > 0 ? (value / total) * 100 : 0;
} 