import { CostTrackingData, CostSummary, CountryBreakdown, Expense, BudgetItem, CategoryBreakdown, CountryPeriod } from '../types';

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
      budgetAmount: budget.amount || 0,
      spentAmount: 0,
      remainingAmount: (budget.amount || 0),
      days: 0,
      averagePerDay: 0,
      expenses: [],
      categoryBreakdown: []
    });
  });
  
  // Add expenses to countries
  costData.expenses.forEach(expense => {
    if (!expense.isGeneralExpense && expense.country) {
      if (!countryMap.has(expense.country)) {
        // Create entry for countries without explicit budget
        countryMap.set(expense.country, {
          country: expense.country,
          budgetAmount: 0, // Will be undefined amount in budget
          spentAmount: 0,
          remainingAmount: 0,
          days: 0,
          averagePerDay: 0,
          expenses: [],
          categoryBreakdown: []
        });
      }
      
      const countryData = countryMap.get(expense.country)!;
      countryData.spentAmount += expense.amount;
      countryData.remainingAmount = countryData.budgetAmount - countryData.spentAmount;
      countryData.expenses.push(expense);
    }
  });
  
  // Add general expenses as a separate entry
  const generalExpenses = costData.expenses.filter(expense => expense.isGeneralExpense);
  if (generalExpenses.length > 0) {
    const generalSpent = generalExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    countryMap.set('General', {
      country: 'General',
      budgetAmount: 0, // General expenses don't have specific budgets
      spentAmount: generalSpent,
      remainingAmount: -generalSpent,
      days: 0,
      averagePerDay: 0,
      expenses: generalExpenses,
      categoryBreakdown: []
    });
  }
  
  // Calculate days, averages, and category breakdowns for each country
  const startDate = new Date(costData.tripStartDate);
  const endDate = new Date(costData.tripEndDate);
  
  countryMap.forEach(countryData => {
    // Calculate days spent in country based on configured periods or expenses
    const countryBudget = costData.countryBudgets.find(b => b.country === countryData.country);
    
    if (countryBudget?.periods && countryBudget.periods.length > 0) {
      // Use configured periods to calculate total days
      countryData.days = countryBudget.periods.reduce((totalDays, period) => {
        const periodStart = new Date(period.startDate);
        const periodEnd = new Date(period.endDate);
        const periodDays = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 3600 * 24)) + 1;
        return totalDays + periodDays;
      }, 0);
    } else {
      // Fallback to expense-based calculation
      const countryExpenseDates = countryData.expenses.map(e => new Date(e.date));
      if (countryExpenseDates.length > 0) {
        const minDate = new Date(Math.min(...countryExpenseDates.map(d => d.getTime())));
        const maxDate = new Date(Math.max(...countryExpenseDates.map(d => d.getTime())));
        countryData.days = Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 3600 * 24)) + 1;
      } else {
        countryData.days = 0;
      }
    }
    
    countryData.averagePerDay = countryData.days > 0 ? countryData.spentAmount / countryData.days : 0;
    
    // Calculate category breakdown for this country
    countryData.categoryBreakdown = calculateCategoryBreakdown(countryData.expenses);
  });
  
  return Array.from(countryMap.values()).sort((a, b) => b.spentAmount - a.spentAmount);
}

/**
 * Calculate category breakdown for a set of expenses
 */
export function calculateCategoryBreakdown(expenses: Expense[]): CategoryBreakdown[] {
  const categoryMap = new Map<string, CategoryBreakdown>();
  
  expenses.forEach(expense => {
    if (!categoryMap.has(expense.category)) {
      categoryMap.set(expense.category, {
        category: expense.category,
        amount: 0,
        count: 0
      });
    }
    
    const categoryData = categoryMap.get(expense.category)!;
    categoryData.amount += expense.amount;
    categoryData.count += 1;
  });
  
  return Array.from(categoryMap.values()).sort((a, b) => b.amount - a.amount);
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
 * Check if an expense falls within country periods
 */
export function isExpenseWithinPeriods(expense: Expense, periods: CountryPeriod[]): boolean {
  if (!periods || periods.length === 0) return true;
  
  const expenseDate = new Date(expense.date);
  return periods.some(period => {
    const periodStart = new Date(period.startDate);
    const periodEnd = new Date(period.endDate);
    return expenseDate >= periodStart && expenseDate <= periodEnd;
  });
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