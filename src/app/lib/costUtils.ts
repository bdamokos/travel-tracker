import { CostTrackingData, CostSummary, CountryBreakdown, Expense, BudgetItem, CategoryBreakdown, CountryPeriod, ExpenseType } from '../types';
import { formatUtcDate } from './dateUtils';

/**
 * Helper function to determine if an expense is post-trip based on dates
 */
function isPostTripExpense(expense: Expense, tripEndDate: Date): boolean {
  if (expense.expenseType !== 'actual') return false;
  const expenseDate = new Date(expense.date);
  return expenseDate > tripEndDate;
}

/**
 * Helper function to filter expenses by type and calculate totals (with automatic post-trip detection)
 */
function calculateExpenseTotals(expenses: Expense[], expenseType: ExpenseType | 'post-trip', tripEndDate?: Date): { outflows: number, refunds: number, net: number } {
  let filteredExpenses: Expense[];
  
  if (expenseType === 'post-trip') {
    // For post-trip, filter actual expenses that are after trip end date
    filteredExpenses = expenses.filter(e => 
      (e.expenseType || 'actual') === 'actual' && 
      tripEndDate && 
      isPostTripExpense(e, tripEndDate)
    );
  } else {
    // For actual and planned, filter by expenseType but exclude post-trip actuals
    filteredExpenses = expenses.filter(e => {
      const eType = e.expenseType || 'actual';
      if (eType === expenseType) {
        // If it's an actual expense, make sure it's not post-trip
        if (eType === 'actual' && tripEndDate && isPostTripExpense(e, tripEndDate)) {
          return false;
        }
        return true;
      }
      return false;
    });
  }
  
  const outflows = filteredExpenses.filter(e => e.amount > 0).reduce((sum, e) => sum + e.amount, 0);
  const refunds = Math.abs(filteredExpenses.filter(e => e.amount < 0).reduce((sum, e) => sum + e.amount, 0));
  const net = outflows - refunds;
  return { outflows, refunds, net };
}

/**
 * Helper function to filter expenses by date range and type (excludes post-trip from actual)
 */
function getExpensesByDateAndType(expenses: Expense[], startDate: Date, endDate: Date, expenseType?: ExpenseType, tripEndDate?: Date): Expense[] {
  return expenses.filter(expense => {
    const expenseDate = new Date(expense.date);
    const eType = expense.expenseType || 'actual';
    
    // Date range check
    const inDateRange = expenseDate >= startDate && expenseDate <= endDate;
    if (!inDateRange) return false;
    
    // Type check
    if (expenseType && eType !== expenseType) return false;
    
    // Exclude post-trip expenses from actual expenses
    if (eType === 'actual' && tripEndDate && isPostTripExpense(expense, tripEndDate)) {
      return false;
    }
    
    return true;
  });
}

/**
 * Helper function to get expenses before a date (excludes post-trip from actual)
 */
function getExpensesBeforeDate(expenses: Expense[], date: Date, expenseType?: ExpenseType, tripEndDate?: Date): Expense[] {
  return expenses.filter(expense => {
    const expenseDate = new Date(expense.date);
    const eType = expense.expenseType || 'actual';
    
    // Date check
    if (expenseDate >= date) return false;
    
    // Type check
    if (expenseType && eType !== expenseType) return false;
    
    // Exclude post-trip expenses from actual expenses
    if (eType === 'actual' && tripEndDate && isPostTripExpense(expense, tripEndDate)) {
      return false;
    }
    
    return true;
  });
}

/**
 * Calculate comprehensive cost summary from cost tracking data
 */
export function calculateCostSummary(costData: CostTrackingData): CostSummary {
  const totalBudget = costData.overallBudget;
  
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
  
  // Calculate totals by expense type (with automatic post-trip detection)
  const actualTotals = calculateExpenseTotals(costData.expenses, 'actual', endDate);
  const plannedTotals = calculateExpenseTotals(costData.expenses, 'planned', endDate);
  const postTripTotals = calculateExpenseTotals(costData.expenses, 'post-trip', endDate);
  
  // Calculate date-based breakdowns for actual expenses only (excluding post-trip)
  const preTripActualExpenses = getExpensesBeforeDate(costData.expenses, startDate, 'actual', endDate);
  const tripActualExpenses = getExpensesByDateAndType(costData.expenses, startDate, endDate, 'actual', endDate);
  
  const preTripActualTotals = calculateExpenseTotals(preTripActualExpenses, 'actual', endDate);
  const tripActualTotals = calculateExpenseTotals(tripActualExpenses, 'actual', endDate);
  
  // Total spent = actual expenses only (for backward compatibility)
  const totalSpent = actualTotals.net;
  const totalRefunds = actualTotals.refunds;
  
  // Calculate committed spending (actual + planned) for budget planning
  const totalCommittedSpending = actualTotals.net + plannedTotals.net;
  const availableForPlanning = totalBudget - totalCommittedSpending;
  
  // Remaining budget calculation: budget - actual - planned (but not post-trip)
  const remainingBudget = totalBudget - totalCommittedSpending;
  
  // Extract individual components for summary
  const preTripSpent = preTripActualTotals.net;
  const preTripRefunds = preTripActualTotals.refunds;
  const tripSpent = tripActualTotals.net;
  const tripRefunds = tripActualTotals.refunds;
  const postTripSpent = postTripTotals.net;
  const postTripRefunds = postTripTotals.refunds;
  const plannedSpending = plannedTotals.net;
  const plannedRefunds = plannedTotals.refunds;
  
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
  
  // Suggested daily budget should use remaining days when in-trip, otherwise total duration
  let dailyBudgetBasisDays: number;
  if (tripStatus === 'during') {
    dailyBudgetBasisDays = Math.max(1, remainingDays);
  } else {
    dailyBudgetBasisDays = totalDays;
  }

  const suggestedDailyBudget = dailyBudgetBasisDays > 0 ? availableForPlanning / dailyBudgetBasisDays : 0;

  // Build recent trip spending history (last few days)
  const recentTripSpending = (() => {
    if (tripStatus === 'before') {
      return [] as { date: string; amount: number }[];
    }

    const historyWindow = 7;
    const msPerDay = 1000 * 60 * 60 * 24;

    const normalizeDate = (value: Date) => {
      const normalized = new Date(value);
      // Always snap to midnight in UTC so day buckets are stable regardless of viewer timezone
      normalized.setUTCHours(0, 0, 0, 0);
      return normalized;
    };

    const startOfTrip = normalizeDate(startDate);
    const endOfTrip = normalizeDate(endDate);
    const todayNormalized = normalizeDate(today);

    const effectiveHistoryEnd = tripStatus === 'after'
      ? endOfTrip
      : (todayNormalized > endOfTrip ? endOfTrip : todayNormalized);

    if (effectiveHistoryEnd < startOfTrip) {
      return [];
    }

    const earliestDay = (() => {
      const candidate = new Date(effectiveHistoryEnd);
      candidate.setDate(candidate.getDate() - (historyWindow - 1));
      return candidate < startOfTrip ? new Date(startOfTrip) : candidate;
    })();

    const dayTotals = new Map<string, number>();
    tripActualExpenses.forEach(expense => {
      const expenseDate = normalizeDate(new Date(expense.date));
      if (expenseDate < earliestDay || expenseDate > effectiveHistoryEnd) {
        return;
      }
      const key = expenseDate.toISOString().split('T')[0];
      dayTotals.set(key, (dayTotals.get(key) || 0) + expense.amount);
    });

    const history: { date: string; amount: number }[] = [];
    const totalDaysInRange = Math.floor((effectiveHistoryEnd.getTime() - earliestDay.getTime()) / msPerDay) + 1;

    for (let offset = 0; offset < totalDaysInRange; offset++) {
      const day = new Date(earliestDay);
      day.setDate(earliestDay.getDate() + offset);
      if (day > endOfTrip) break;
      const key = day.toISOString().split('T')[0];
      history.push({
        date: key,
        amount: dayTotals.get(key) || 0,
      });
    }

    return history;
  })();
  
  // Calculate country breakdowns
  const countryBreakdown = calculateCountryBreakdowns(costData);
  
  return {
    totalBudget,
    totalSpent,
    totalRefunds,
    remainingBudget,
    totalDays,
    remainingDays,
    averageSpentPerDay,
    suggestedDailyBudget,
    dailyBudgetBasisDays,
    countryBreakdown,
    preTripSpent,
    preTripRefunds,
    tripSpent,
    tripRefunds,
    averageSpentPerTripDay,
    tripStatus,
    // New fields for enhanced expense tracking
    postTripSpent,
    postTripRefunds,
    plannedSpending,
    plannedRefunds,
    totalCommittedSpending,
    availableForPlanning,
    recentTripSpending
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
      refundAmount: 0,
      remainingAmount: (budget.amount || 0),
      days: 0,
      averagePerDay: 0,
      preTripSpent: 0,
      tripSpent: 0,
      suggestedDailyBudget: 0,
      expenses: [],
      categoryBreakdown: [],
      // New fields for enhanced expense tracking
      postTripSpent: 0,
      postTripRefunds: 0,
      plannedSpending: 0,
      plannedRefunds: 0,
      availableForPlanning: budget.amount || 0
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
          refundAmount: 0,
          remainingAmount: 0,
          days: 0,
          averagePerDay: 0,
          preTripSpent: 0,
          tripSpent: 0,
          suggestedDailyBudget: 0,
          expenses: [],
          categoryBreakdown: [],
          // New fields for enhanced expense tracking
          postTripSpent: 0,
          postTripRefunds: 0,
          plannedSpending: 0,
          plannedRefunds: 0,
          availableForPlanning: 0
        });
      }
      
      const countryData = countryMap.get(expense.country)!;
      const expenseType = expense.expenseType || 'actual';
      
      // Handle different expense types (with automatic post-trip detection)
      const isPostTrip = isPostTripExpense(expense, endDate);
      
      if (expenseType === 'actual' && isPostTrip) {
        // Post-trip expense
        if (expense.amount > 0) {
          countryData.postTripSpent += expense.amount;
        } else {
          countryData.postTripRefunds += Math.abs(expense.amount);
        }
      } else if (expenseType === 'actual') {
        // Regular actual expense (not post-trip)
        if (expense.amount > 0) {
          countryData.spentAmount += expense.amount;
        } else {
          countryData.refundAmount += Math.abs(expense.amount);
        }
      } else if (expenseType === 'planned') {
        if (expense.amount > 0) {
          countryData.plannedSpending += expense.amount;
        } else {
          countryData.plannedRefunds += Math.abs(expense.amount);
        }
      }
      
      // Update remaining calculations
      const netActual = countryData.spentAmount - countryData.refundAmount;
      const netPlanned = countryData.plannedSpending - countryData.plannedRefunds;
      countryData.remainingAmount = countryData.budgetAmount - netActual - netPlanned;
      countryData.availableForPlanning = countryData.budgetAmount - netActual - netPlanned;
      
      countryData.expenses.push(expense);
    }
  });
  
  // Add general expenses as a separate entry
  const generalExpenses = costData.expenses.filter(expense => expense.isGeneralExpense);
  if (generalExpenses.length > 0) {
    // Calculate totals by expense type for general expenses (with automatic post-trip detection)
    const generalActualTotals = calculateExpenseTotals(generalExpenses, 'actual', endDate);
    const generalPlannedTotals = calculateExpenseTotals(generalExpenses, 'planned', endDate);
    const generalPostTripTotals = calculateExpenseTotals(generalExpenses, 'post-trip', endDate);
    
    // Calculate pre-trip vs trip spending for general actual expenses only (exclude post-trip)
    const generalActualExpenses = generalExpenses.filter(e => 
      (e.expenseType || 'actual') === 'actual' && !isPostTripExpense(e, endDate)
    );
    const generalPreTrip = generalActualExpenses.filter(e => new Date(e.date) < startDate).reduce((sum, e) => sum + e.amount, 0);
    const generalTrip = generalActualExpenses.filter(e => {
      const date = new Date(e.date);
      return date >= startDate && date <= endDate;
    }).reduce((sum, e) => sum + e.amount, 0);
    
    countryMap.set('General', {
      country: 'General',
      budgetAmount: 0, // General expenses don't have specific budgets
      spentAmount: generalActualTotals.outflows,
      refundAmount: generalActualTotals.refunds,
      remainingAmount: -generalActualTotals.net,
      days: 0,
      averagePerDay: 0,
      preTripSpent: generalPreTrip,
      tripSpent: generalTrip,
      suggestedDailyBudget: 0,
      expenses: generalExpenses,
      categoryBreakdown: [],
      // New fields for enhanced expense tracking
      postTripSpent: generalPostTripTotals.net,
      postTripRefunds: generalPostTripTotals.refunds,
      plannedSpending: generalPlannedTotals.net,
      plannedRefunds: generalPlannedTotals.refunds,
      availableForPlanning: -(generalActualTotals.net + generalPlannedTotals.net)
    });
  }
  
  // Calculate days, averages, and category breakdowns for each country
  countryMap.forEach(countryData => {
    // Calculate pre-trip vs trip spending for this country (actual expenses only, exclude post-trip)
    const actualExpenses = countryData.expenses.filter(e => 
      (e.expenseType || 'actual') === 'actual' && !isPostTripExpense(e, endDate)
    );
    const preTripActualExpenses = actualExpenses.filter(e => new Date(e.date) < startDate);
    const tripActualExpenses = actualExpenses.filter(e => {
      const date = new Date(e.date);
      return date >= startDate && date <= endDate;
    });
    
    countryData.preTripSpent = preTripActualExpenses.reduce((sum, e) => sum + e.amount, 0);
    countryData.tripSpent = tripActualExpenses.reduce((sum, e) => sum + e.amount, 0);
    
    // Update remaining calculations to include planned expenses
    const netActual = countryData.spentAmount - countryData.refundAmount;
    const netPlanned = countryData.plannedSpending - countryData.plannedRefunds;
    countryData.remainingAmount = countryData.budgetAmount - netActual - netPlanned;
    countryData.availableForPlanning = countryData.budgetAmount - netActual - netPlanned;
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
    
    // Calculate suggested daily budget for remaining days (if country has budget)
    if (countryData.budgetAmount > 0 && countryBudget?.periods) {
      // Account for actual spending and planned spending
      const totalCommitted = netActual + netPlanned;
      const availableBudget = countryData.budgetAmount - totalCommitted;
      const remainingDays = calculateRemainingDaysInCountry(countryBudget.periods, today, endDate);
      countryData.suggestedDailyBudget = remainingDays > 0 ? availableBudget / remainingDays : 0;
    }

    // Calculate averagePerDay using updated logic
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
 * Calculate remaining days in country periods
 */
function calculateRemainingDaysInCountry(
  periods: CountryPeriod[],
  today: Date,
  tripEndDate: Date
): number {
  let remainingDays = 0;
  
  for (const period of periods) {
    const periodStart = new Date(period.startDate);
    const periodEnd = new Date(Math.min(new Date(period.endDate).getTime(), tripEndDate.getTime()));
    
    if (today < periodEnd) {
      const startFrom = today > periodStart ? today : periodStart;
      const daysInPeriod = Math.ceil((periodEnd.getTime() - startFrom.getTime()) / (1000 * 3600 * 24)) + 1;
      remainingDays += Math.max(0, daysInPeriod);
    }
  }
  
  return remainingDays;
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

  // NEW LOGIC: Show meaningful averages based on what makes sense for each trip status
  
  if (tripStatus === 'before') {
    // Before trip: If we have pre-trip expenses, show them (useful for preparation costs)
    // But don't divide by days since that doesn't make sense pre-trip
    return 0; // Could show suggested daily budget if we have one
  }

  if (tripStatus === 'after') {
    // After trip: Show historical daily average based on actual trip spending
    const tripSpent = countryData.tripSpent;
    return countryData.days > 0 && tripSpent > 0 ? tripSpent / countryData.days : 0;
  }

  // During trip: Show current daily average based on elapsed time
  if (countryBudget?.periods && countryBudget.periods.length > 0) {
    // CASE 1: Country has configured periods
    return calculateDailyAverageWithPeriods(
      countryBudget.periods,
      countryData.tripSpent,
      today
    );
  } else {
    // CASE 2: No configured periods - use trip duration or expense dates
    return calculateDailyAverageWithoutPeriods(
      countryData.expenses.filter(e => {
        const date = new Date(e.date);
        return date >= tripStartDate && date <= tripEndDate;
      }),
      countryData.tripSpent,
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
    const date = expense.date instanceof Date ? expense.date.toISOString().split('T')[0] : expense.date;
    dailySpending.set(date, (dailySpending.get(date) || 0) + expense.amount);
  });
  
  return Array.from(dailySpending.entries())
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/**
 * Get common expense categories
 */
export const CASH_CATEGORY_NAME = 'Local currency held in cash';

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
  'Miscellaneous',
  CASH_CATEGORY_NAME
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
export function formatDate(dateInput: string | Date): string {
  // Handle different date formats
  let date: Date;
  
  // If it's already a Date object, use it directly
  if (dateInput instanceof Date) {
    date = dateInput;
  } else {
    const dateString = dateInput;
    
    // Check if it's in dd/mm/yyyy format (from YNAB imports)
  if (dateString.includes('/') && dateString.split('/').length === 3) {
    const parts = dateString.split('/');
    if (parts[0].length <= 2 && parts[1].length <= 2 && parts[2].length === 4) {
      // Assume dd/mm/yyyy format
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
      const year = parseInt(parts[2], 10);
      date = new Date(year, month, day);
    } else {
      // Try to parse as-is
      date = new Date(dateString);
    }
  } else {
    // Try to parse as-is (ISO format, etc.)
    date = new Date(dateString);
  }
  }
  
  // Check if date is valid
  if (isNaN(date.getTime())) {
    return 'Invalid Date';
  }
  
  return formatUtcDate(date, 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

/**
 * Calculate percentage
 */
export function calculatePercentage(value: number, total: number): number {
  return total > 0 ? (value / total) * 100 : 0;
}

/**
 * Format currency amount with refund footnote if applicable
 */
export function formatCurrencyWithRefunds(
  netAmount: number, 
  refundAmount: number, 
  currency: string = 'EUR'
): { displayText: string; hasRefunds: boolean; footnote?: string } {
  const hasRefunds = refundAmount > 0;
  const displayText = formatCurrency(netAmount, currency) + (hasRefunds ? '*' : '');
  const footnote = hasRefunds ? `*Total includes ${formatCurrency(refundAmount, currency)} of refunds` : undefined;
  
  return {
    displayText,
    hasRefunds,
    footnote
  };
}

/**
 * Check if a breakdown has any refunds
 */
export function hasAnyRefunds(costData: CostTrackingData): boolean {
  return costData.expenses.some(expense => expense.amount < 0);
}

/**
 * Get total refunds for expenses list
 */
export function getTotalRefunds(expenses: Expense[]): number {
  return Math.abs(expenses.filter(e => e.amount < 0).reduce((sum, expense) => sum + expense.amount, 0));
}

/**
 * Get display information for country average/day field
 */
export function getCountryAverageDisplay(
  countryData: CountryBreakdown,
  tripStatus: 'before' | 'during' | 'after',
  currency: string = 'EUR'
): { 
  label: string; 
  value: string; 
  tooltip?: string 
} {
  if (countryData.country === 'General') {
    return { label: 'Avg/Day', value: 'N/A' };
  }

  if (tripStatus === 'before') {
    if (countryData.preTripSpent > 0 && countryData.suggestedDailyBudget > 0) {
      return {
        label: 'Pre-trip + Suggested/Day',
        value: `${formatCurrency(countryData.preTripSpent, currency)} + ${formatCurrency(countryData.suggestedDailyBudget, currency)}`,
        tooltip: `Pre-trip expenses: ${formatCurrency(countryData.preTripSpent, currency)}, Suggested daily budget: ${formatCurrency(countryData.suggestedDailyBudget, currency)}`
      };
    } else if (countryData.preTripSpent > 0) {
      return {
        label: 'Pre-trip',
        value: formatCurrency(countryData.preTripSpent, currency),
        tooltip: 'Total pre-trip expenses for this destination'
      };
    } else if (countryData.suggestedDailyBudget > 0) {
      return {
        label: 'Suggested/Day',
        value: formatCurrency(countryData.suggestedDailyBudget, currency),
        tooltip: 'Suggested daily budget based on remaining budget and days'
      };
    } else {
      return { label: 'Avg/Day', value: '€0' };
    }
  }

  // During or after trip: show actual daily average
  return {
    label: 'Avg/Day',
    value: formatCurrency(countryData.averagePerDay, currency),
    tooltip: tripStatus === 'during' ? 'Daily average based on spending so far' : 'Historical daily average for the trip'
  };
} 
