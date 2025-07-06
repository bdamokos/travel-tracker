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
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24)) + 1;
  const remainingDays = Math.max(0, Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 3600 * 24)));
  
  // Determine trip status
  let tripStatus: 'before' | 'during' | 'after';
  if (today < startDate) {
    tripStatus = 'before';
  } else if (today <= endDate) {
    tripStatus = 'during';
  } else {
    tripStatus = 'after';
  }
  
  // Separate expenses into pre-trip and trip expenses
  const preTripExpenses = costData.expenses.filter(expense => new Date(expense.date) < startDate);
  const tripExpenses = costData.expenses.filter(expense => {
    const expenseDate = new Date(expense.date);
    return expenseDate >= startDate && expenseDate <= endDate;
  });
  
  const preTripSpent = preTripExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const tripSpent = tripExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  
  // Calculate intelligent averages based on trip status
  let averageSpentPerDay: number;
  let averageSpentPerTripDay: number;
  
  if (tripStatus === 'before') {
    // Before trip: no daily average yet, trip hasn't started
    averageSpentPerDay = 0;
    averageSpentPerTripDay = 0;
  } else if (tripStatus === 'during') {
    // During trip: average based on days elapsed in the trip
    const daysElapsedInTrip = Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 3600 * 24)) + 1;
    averageSpentPerDay = daysElapsedInTrip > 0 ? tripSpent / daysElapsedInTrip : 0;
    averageSpentPerTripDay = averageSpentPerDay;
  } else {
    // After trip: average based on total trip duration
    averageSpentPerDay = totalDays > 0 ? tripSpent / totalDays : 0;
    averageSpentPerTripDay = averageSpentPerDay;
  }
  
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
    countryBreakdown,
    preTripSpent,
    tripSpent,
    averageSpentPerTripDay,
    tripStatus
  };
}

/**
 * Calculate breakdown by country
 */
export function calculateCountryBreakdowns(costData: CostTrackingData): CountryBreakdown[] {
  const countryMap = new Map<string, CountryBreakdown>();
  
  // Calculate trip status for consistent logic
  const today = new Date();
  const startDate = new Date(costData.tripStartDate);
  const endDate = new Date(costData.tripEndDate);
  let tripStatus: 'before' | 'during' | 'after';
  if (today < startDate) {
    tripStatus = 'before';
  } else if (today <= endDate) {
    tripStatus = 'during';
  } else {
    tripStatus = 'after';
  }
  
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
    
    // Calculate averagePerDay using robust trip status logic
    countryData.averagePerDay = calculateCountryDailyAverage(
      countryData,
      countryBudget,
      startDate,
      endDate,
      today,
      tripStatus
    );
    
    // Calculate category breakdown for this country
    countryData.categoryBreakdown = calculateCategoryBreakdown(countryData.expenses);
  });
  
  return Array.from(countryMap.values()).sort((a, b) => b.spentAmount - a.spentAmount);
}

/**
 * Calculate daily average for a country considering all edge cases
 */
function calculateCountryDailyAverage(
  countryData: CountryBreakdown,
  countryBudget: BudgetItem | undefined,
  tripStartDate: Date,
  tripEndDate: Date,
  today: Date,
  tripStatus: 'before' | 'during' | 'after'
): number {
  // General expenses don't have daily averages
  if (countryData.country === 'General') {
    return 0;
  }

  // Filter expenses to only include those during the trip period
  const tripExpenses = countryData.expenses.filter(expense => {
    const expenseDate = new Date(expense.date);
    return expenseDate >= tripStartDate && expenseDate <= tripEndDate;
  });
  const tripSpent = tripExpenses.reduce((sum, expense) => sum + expense.amount, 0);

  // If no trip expenses, return 0
  if (tripSpent === 0) {
    return 0;
  }

  // Before trip: no daily average yet
  if (tripStatus === 'before') {
    return 0;
  }

  // After trip: use total country days
  if (tripStatus === 'after') {
    return countryData.days > 0 ? tripSpent / countryData.days : 0;
  }

  // During trip: complex logic for different scenarios
  if (countryBudget?.periods && countryBudget.periods.length > 0) {
    // CASE 1: Country has configured periods
    return calculateDailyAverageWithPeriods(
      countryBudget.periods,
      tripSpent,
      today
    );
  } else {
    // CASE 2: No configured periods - use trip duration or expense dates
    return calculateDailyAverageWithoutPeriods(
      tripExpenses,
      tripSpent,
      today,
      tripStartDate,
      tripEndDate,
      countryData.days
    );
  }
}

/**
 * Calculate daily average for countries with configured periods
 */
function calculateDailyAverageWithPeriods(
  periods: CountryPeriod[],
  tripSpent: number,
  today: Date
): number {
  let totalElapsedDays = 0;

  for (const period of periods) {
    const periodStart = new Date(period.startDate);
    const periodEnd = new Date(period.endDate);
    
    // Skip periods that haven't started yet
    if (today < periodStart) {
      continue;
    }
    
    // For periods that have started, calculate elapsed days
    const effectiveEnd = today < periodEnd ? today : periodEnd;
    const elapsedDays = Math.ceil((effectiveEnd.getTime() - periodStart.getTime()) / (1000 * 3600 * 24)) + 1;
    totalElapsedDays += Math.max(0, elapsedDays);
  }

  // If no periods have started yet, return 0
  if (totalElapsedDays === 0) {
    return 0;
  }

  return tripSpent / totalElapsedDays;
}

/**
 * Calculate daily average for countries without configured periods
 */
function calculateDailyAverageWithoutPeriods(
  tripExpenses: Expense[],
  tripSpent: number,
  today: Date,
  tripStartDate: Date,
  tripEndDate: Date,
  totalCountryDays: number
): number {
  if (tripExpenses.length === 0) {
    return 0;
  }

  // Get the date range of expenses
  const expenseDates = tripExpenses.map(e => new Date(e.date));
  const minExpenseDate = new Date(Math.min(...expenseDates.map(d => d.getTime())));
  const maxExpenseDate = new Date(Math.max(...expenseDates.map(d => d.getTime())));

  // Determine the period to use for calculation
  let startDateForCalc: Date;
  let endDateForCalc: Date;

  if (totalCountryDays > 0) {
    // CASE 2A: We have configured country days (likely equals trip duration)
    // Use trip start/end dates but cap the end date at today
    startDateForCalc = tripStartDate;
    endDateForCalc = today < tripEndDate ? today : tripEndDate;
  } else {
    // CASE 2B: Fall back to expense date range
    // Use expense dates but cap the end date at today
    startDateForCalc = minExpenseDate;
    endDateForCalc = today < maxExpenseDate ? today : maxExpenseDate;
  }

  // Calculate elapsed days
  const elapsedDays = Math.ceil((endDateForCalc.getTime() - startDateForCalc.getTime()) / (1000 * 3600 * 24)) + 1;
  
  return elapsedDays > 0 ? tripSpent / elapsedDays : 0;
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
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
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