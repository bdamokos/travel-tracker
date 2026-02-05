'use client';

import type { JSX } from 'react';
import { CostSummary, CostTrackingData } from '@/app/types';
import { formatCurrency, formatCurrencyWithRefunds } from '@/app/lib/costUtils';

interface CostSummaryDashboardProps {
  costSummary: CostSummary;
  costData: CostTrackingData;
}

type TrendDirection = 'up' | 'down' | 'flat';


export default function CostSummaryDashboard({
  costSummary,
  costData
}: CostSummaryDashboardProps): JSX.Element {
  const today = new Date();
  const dailyBudgetLabel = (() => {
    const days = costSummary.dailyBudgetBasisDays;
    const baseLabel = costSummary.tripStatus === 'during' ? 'remaining day' : 'journey day';
    const suffix = days === 1 ? '' : 's';
    return `${baseLabel}${suffix}`;
  })();

  const tripSpendingHistory = costSummary.recentTripSpending;
  const maxTripSpending = tripSpendingHistory.length > 0
    ? Math.max(...tripSpendingHistory.map(entry => entry.amount), 0)
    : 0;

  const normalizeDate = (value: Date) => {
    const normalized = new Date(value);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  };

  const getEffectiveTripEnd = () => {
    const tripEndDate = normalizeDate(new Date(costData.tripEndDate));
    const normalizedToday = normalizeDate(today);
    return normalizedToday < tripEndDate ? normalizedToday : tripEndDate;
  };

  const tripStartDate = normalizeDate(new Date(costData.tripStartDate));
  const effectiveTripEnd = getEffectiveTripEnd();

  const getAverageForDateRange = (startDate: Date, endDate: Date) => {
    if (endDate < tripStartDate) {
      return { average: 0, total: 0, days: 0 };
    }

    const effectiveStart = startDate < tripStartDate ? tripStartDate : startDate;
    const msPerDay = 1000 * 60 * 60 * 24;
    const days = Math.floor((endDate.getTime() - effectiveStart.getTime()) / msPerDay) + 1;

    if (days <= 0) {
      return { average: 0, total: 0, days: 0 };
    }

    const total = costData.expenses
      .filter(expense => {
        const expenseDate = normalizeDate(new Date(expense.date));
        return expenseDate >= effectiveStart && expenseDate <= endDate;
      })
      .reduce((sum, expense) => sum + expense.amount, 0);

    return { average: total / days, total, days };
  };

  const calculateRangeAverage = (rangeDays: number) => {
    const rangeEnd = effectiveTripEnd;
    const rangeStart = normalizeDate(new Date(rangeEnd));
    rangeStart.setDate(rangeStart.getDate() - (rangeDays - 1));
    return getAverageForDateRange(rangeStart, rangeEnd);
  };

  const calculateTrend = (rangeDays: number, currentAverage: number) => {
    const previousRangeEnd = normalizeDate(new Date(effectiveTripEnd));
    previousRangeEnd.setDate(previousRangeEnd.getDate() - rangeDays);
    const previousRangeStart = normalizeDate(new Date(previousRangeEnd));
    previousRangeStart.setDate(previousRangeStart.getDate() - (rangeDays - 1));

    const { average: previousAverage } = getAverageForDateRange(previousRangeStart, previousRangeEnd);
    const delta = previousAverage > 0 ? ((currentAverage - previousAverage) / previousAverage) * 100 : 0;
    const trend: TrendDirection = delta > 2 ? 'up' : delta < -2 ? 'down' : 'flat';
    return { trend, delta, previousAverage };
  };

  const weeklyAverage = calculateRangeAverage(7);
  const weeklyTrend = calculateTrend(7, weeklyAverage.average);
  const monthlyAverage = calculateRangeAverage(30);
  const monthlyTrend = calculateTrend(30, monthlyAverage.average);

  const currentCountries = (() => {
    if (costSummary.tripStatus !== 'during') {
      return [];
    }

    const todayDate = normalizeDate(today);
    const countriesWithPeriods = costData.countryBudgets.filter(budget => {
      if (!budget.periods || budget.periods.length === 0) {
        return false;
      }
      return budget.periods.some(period => {
        const start = normalizeDate(new Date(period.startDate));
        const end = normalizeDate(new Date(period.endDate));
        return todayDate >= start && todayDate <= end;
      });
    });

    if (countriesWithPeriods.length > 0) {
      return Array.from(new Set(countriesWithPeriods.map(budget => budget.country)));
    }

    const recentCountrySpend = costData.expenses
      .filter(expense => {
        const expenseDate = normalizeDate(new Date(expense.date));
        const daysAgo = Math.floor((todayDate.getTime() - expenseDate.getTime()) / (1000 * 60 * 60 * 24));
        return daysAgo >= 0 && daysAgo < 7 && expense.country && !expense.isGeneralExpense;
      })
      .reduce((acc, expense) => {
        const key = expense.country;
        acc.set(key, (acc.get(key) || 0) + expense.amount);
        return acc;
      }, new Map<string, number>());

    return Array.from(recentCountrySpend.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([country]) => country);
  })();

  const currentCountryBreakdowns = currentCountries
    .map(country => costSummary.countryBreakdown.find(entry => entry.country === country))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  const trendLabel = (trend: TrendDirection, delta: number) => {
    if (trend === 'flat') {
      return 'Steady';
    }
    const rounded = Math.abs(delta).toFixed(1);
    return trend === 'up' ? `Up ${rounded}%` : `Down ${rounded}%`;
  };

  return (
    <div>
      <h3 className="text-xl font-semibold mb-4">Cost Summary</h3>
      
      {/* Most Important: Money Available */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className={`${costSummary.availableForPlanning >= 0 ? 'bg-green-50 dark:bg-green-950' : 'bg-red-50 dark:bg-red-950'} p-6 rounded-lg`}>
          <h4 className={`font-bold text-lg ${costSummary.availableForPlanning >= 0 ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
            Money Left
          </h4>
          <p className={`text-3xl font-bold ${costSummary.availableForPlanning >= 0 ? 'text-green-600 dark:text-green-300' : 'text-red-600 dark:text-red-300'}`}>
            {formatCurrency(costSummary.availableForPlanning, costData.currency)}
          </p>
          <p className={`text-sm mt-1 ${costSummary.availableForPlanning >= 0 ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
            Available for new expenses
          </p>
          {costSummary.reservedBudget > 0 && (
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
              {formatCurrency(costSummary.reservedBudget, costData.currency)} reserved for upcoming obligations
            </p>
          )}
        </div>
        <div className="bg-blue-50 dark:bg-blue-950 p-6 rounded-lg">
          <h4 className="font-bold text-lg text-blue-800 dark:text-blue-200">Daily Budget</h4>
          <p className="text-3xl font-bold text-blue-600 dark:text-blue-300">
            {formatCurrency(costSummary.suggestedDailyBudget, costData.currency)}
          </p>
          <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
            For {costSummary.dailyBudgetBasisDays} {dailyBudgetLabel}
          </p>
        </div>
      </div>

      {/* Secondary: Current Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-red-50 dark:bg-red-950 p-4 rounded-lg">
          <h4 className="font-medium text-red-800 dark:text-red-200">Total Spent</h4>
          <p className="text-xl font-bold text-red-600 dark:text-red-300">
            {(() => {
              const refundDisplay = formatCurrencyWithRefunds(costSummary.totalSpent, costSummary.totalRefunds, costData.currency);
              return refundDisplay.displayText;
            })()}
          </p>
          {costSummary.totalRefunds > 0 && (
            <p className="text-xs text-red-700 dark:text-red-300 mt-1">
              *Includes {formatCurrency(costSummary.totalRefunds, costData.currency)} refunds
            </p>
          )}
        </div>
        {costSummary.plannedSpending > 0 && (
          <div className="bg-cyan-50 dark:bg-cyan-950 p-4 rounded-lg">
            <h4 className="font-medium text-cyan-800 dark:text-cyan-200">Planned Spending</h4>
            <p className="text-xl font-bold text-cyan-600 dark:text-cyan-300">
              {(() => {
                const refundDisplay = formatCurrencyWithRefunds(costSummary.plannedSpending, costSummary.plannedRefunds, costData.currency);
                return refundDisplay.displayText;
              })()}
            </p>
            <p className="text-xs text-cyan-600 dark:text-cyan-300 mt-1">
              Future commitments
            </p>
          </div>
        )}
        {costSummary.tripStatus === 'during' && (
          <div className="bg-orange-50 dark:bg-orange-950 p-4 rounded-lg">
            <h4 className="font-medium text-orange-800 dark:text-orange-200">Trip Average/Day</h4>
            <p className="text-xl font-bold text-orange-600 dark:text-orange-300">
              {formatCurrency(costSummary.averageSpentPerDay, costData.currency)}
            </p>
            <p className="text-xs text-orange-600 dark:text-orange-300 mt-1">
              Trip spending so far
            </p>
            {tripSpendingHistory.length > 0 && (
              <div className="mt-4">
                <div className="flex items-end gap-1 h-20">
                  {tripSpendingHistory.map((entry) => {
                    const normalizedAmount = Math.max(entry.amount, 0);
                    const percentage = maxTripSpending > 0 ? (normalizedAmount / maxTripSpending) * 100 : 0;
                    const minHeight = normalizedAmount > 0 ? '6px' : '2px';
                    const [year, month, day] = entry.date.split('-').map(Number);
                    const labelDate = !Number.isNaN(year) && !Number.isNaN(month) && !Number.isNaN(day)
                      ? new Date(year, month - 1, day)
                      : new Date(entry.date);
                    const dayLabel = labelDate.toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric'
                    });
                    return (
                      <div key={entry.date} className="flex-1 h-full flex flex-col items-center justify-end">
                        <div
                          className="w-full bg-orange-200 dark:bg-orange-900/60 rounded-t-sm overflow-hidden"
                          style={{ height: `${percentage}%`, minHeight }}
                        >
                          <div className="w-full h-full bg-orange-500 dark:bg-orange-400" />
                        </div>
                        <div className="mt-1 text-[10px] text-orange-700 dark:text-orange-300 text-center leading-tight">
                          {dayLabel}
                        </div>
                        <div className="text-[10px] text-orange-500 dark:text-orange-200">
                          {formatCurrency(entry.amount, costData.currency)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Daily Average Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-emerald-50 dark:bg-emerald-950 p-4 rounded-lg">
          <h4 className="font-medium text-emerald-800 dark:text-emerald-200">Last 7 Days Avg</h4>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-300">
            {formatCurrency(weeklyAverage.average, costData.currency)}
          </p>
          <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">
            {weeklyAverage.days > 0 ? `Based on ${weeklyAverage.days} day${weeklyAverage.days === 1 ? '' : 's'}` : 'No recent spend'}
          </p>
          <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-2">
            Trend: {trendLabel(weeklyTrend.trend, weeklyTrend.delta)} vs prior week
          </p>
        </div>
        <div className="bg-teal-50 dark:bg-teal-950 p-4 rounded-lg">
          <h4 className="font-medium text-teal-800 dark:text-teal-200">Last 30 Days Avg</h4>
          <p className="text-xl font-bold text-teal-600 dark:text-teal-300">
            {formatCurrency(monthlyAverage.average, costData.currency)}
          </p>
          <p className="text-xs text-teal-700 dark:text-teal-300 mt-1">
            {monthlyAverage.days > 0 ? `Based on ${monthlyAverage.days} day${monthlyAverage.days === 1 ? '' : 's'}` : 'No recent spend'}
          </p>
          <p className="text-xs text-teal-700 dark:text-teal-300 mt-2">
            Trend: {trendLabel(monthlyTrend.trend, monthlyTrend.delta)} vs prior month
          </p>
        </div>
        {currentCountryBreakdowns.length > 0 ? (
          currentCountryBreakdowns.map(country => (
            <div key={country.country} className="bg-sky-50 dark:bg-sky-950 p-4 rounded-lg">
              <h4 className="font-medium text-sky-800 dark:text-sky-200">{country.country} Avg/Day</h4>
              <p className="text-xl font-bold text-sky-600 dark:text-sky-300">
                {formatCurrency(country.averagePerDay, costData.currency)}
              </p>
              <p className="text-xs text-sky-700 dark:text-sky-300 mt-1">
                {country.remainingAmount >= 0
                  ? `Budget left: ${formatCurrency(country.remainingAmount, costData.currency)}`
                  : `Over budget by: ${formatCurrency(Math.abs(country.remainingAmount), costData.currency)}`}
              </p>
            </div>
          ))
        ) : (
          <div className="bg-sky-50 dark:bg-sky-950 p-4 rounded-lg lg:col-span-2">
            <h4 className="font-medium text-sky-800 dark:text-sky-200">Current Countries</h4>
            <p className="text-sm text-sky-700 dark:text-sky-300 mt-1">
              No active country periods detected yet.
            </p>
          </div>
        )}
      </div>

      {/* Reference Information */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-50 dark:bg-gray-950 p-4 rounded-lg">
          <h4 className="font-medium text-gray-800 dark:text-gray-200">Total Budget</h4>
          <p className="text-lg font-bold text-gray-600 dark:text-gray-300">
            {formatCurrency(costSummary.totalBudget, costData.currency)}
          </p>
          {costSummary.reservedBudget > 0 && (
            <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 space-y-1">
              <div className="flex justify-between">
                <span>Reserved</span>
                <span className="font-semibold">{formatCurrency(costSummary.reservedBudget, costData.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span>Spendable</span>
                <span className="font-semibold">{formatCurrency(costSummary.spendableBudget, costData.currency)}</span>
              </div>
            </div>
          )}
        </div>
        {costSummary.plannedSpending > 0 && (
          <div className="bg-indigo-50 dark:bg-indigo-950 p-4 rounded-lg">
            <h4 className="font-medium text-indigo-800 dark:text-indigo-200">Total Committed</h4>
            <p className="text-lg font-bold text-indigo-600 dark:text-indigo-300">
              {formatCurrency(costSummary.totalCommittedSpending, costData.currency)}
            </p>
            <p className="text-xs text-indigo-600 dark:text-indigo-300 mt-1">
              Spent + planned
            </p>
          </div>
        )}
        <div className="bg-gray-50 dark:bg-gray-950 p-4 rounded-lg">
          <h4 className="font-medium text-gray-800 dark:text-gray-200">
            {(() => {
              if (costSummary.tripStatus === 'before') {
                const daysUntilStart = Math.max(0, Math.ceil((new Date(costData.tripStartDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24)));
                return daysUntilStart > 0 ? 'Days Until Trip' : 'Trip Starting';
              } else if (costSummary.tripStatus === 'during') {
                return 'Days Until End';
              } else {
                return 'Trip Duration';
              }
            })()}
          </h4>
          <p className="text-lg font-bold text-gray-600 dark:text-gray-300">
            {(() => {
              if (costSummary.tripStatus === 'before') {
                const daysUntilStart = Math.max(0, Math.ceil((new Date(costData.tripStartDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24)));
                return daysUntilStart;
              } else if (costSummary.tripStatus === 'during') {
                return costSummary.remainingDays;
              } else {
                return costSummary.totalDays;
              }
            })()}
          </p>
          {costSummary.tripStatus === 'during' && costSummary.daysCompleted > 0 && (
            <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-800 dark:bg-orange-900/40 dark:text-orange-100">
              <span className="h-2 w-2 rounded-full bg-orange-500" aria-hidden="true" />
              {costSummary.daysCompleted} day{costSummary.daysCompleted === 1 ? '' : 's'} completed
            </div>
          )}
        </div>
      </div>

      {/* Detailed Breakdown (only show if there are specific expense types) */}
      {(costSummary.preTripSpent > 0 || costSummary.tripSpent > 0 || costSummary.postTripSpent > 0) && (
        <div>
          <h4 className="font-medium mb-3 text-gray-700 dark:text-gray-300">Expense Breakdown</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {costSummary.preTripSpent > 0 && (
              <div className="bg-purple-50 dark:bg-purple-950 p-4 rounded-lg">
                <h4 className="font-medium text-purple-800 dark:text-purple-200">Pre-Trip</h4>
                <p className="text-lg font-bold text-purple-600 dark:text-purple-300">
                  {(() => {
                    const refundDisplay = formatCurrencyWithRefunds(costSummary.preTripSpent, costSummary.preTripRefunds, costData.currency);
                    return refundDisplay.displayText;
                  })()}
                </p>
                <p className="text-xs text-purple-600 dark:text-purple-300 mt-1">
                  Flights, gear, insurance
                </p>
              </div>
            )}
            
            {costSummary.tripSpent > 0 && (
              <div className="bg-yellow-50 dark:bg-yellow-950 p-4 rounded-lg">
                <h4 className="font-medium text-yellow-800 dark:text-yellow-200">During Trip</h4>
                <p className="text-lg font-bold text-yellow-600 dark:text-yellow-300">
                  {(() => {
                    const refundDisplay = formatCurrencyWithRefunds(costSummary.tripSpent, costSummary.tripRefunds, costData.currency);
                    return refundDisplay.displayText;
                  })()}
                </p>
                <p className="text-xs text-yellow-600 dark:text-yellow-300 mt-1">
                  {costSummary.tripStatus === 'before' ? 'Planned trip spending' : 'Daily spending'}
                </p>
              </div>
            )}
            
            {costSummary.postTripSpent > 0 && (
              <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-lg">
                <h4 className="font-medium text-amber-800 dark:text-amber-200">Post-Trip</h4>
                <p className="text-lg font-bold text-amber-600 dark:text-amber-300">
                  {(() => {
                    const refundDisplay = formatCurrencyWithRefunds(costSummary.postTripSpent, costSummary.postTripRefunds, costData.currency);
                    return refundDisplay.displayText;
                  })()}
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-300 mt-1">
                  Follow-up expenses
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
