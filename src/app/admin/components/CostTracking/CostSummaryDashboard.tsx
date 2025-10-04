'use client';

import { CostSummary, CostTrackingData } from '../../../types';
import { formatCurrency, formatCurrencyWithRefunds } from '../../../lib/costUtils';

interface CostSummaryDashboardProps {
  costSummary: CostSummary;
  costData: CostTrackingData;
}


export default function CostSummaryDashboard({
  costSummary,
  costData
}: CostSummaryDashboardProps) {
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
                    const percentage = maxTripSpending > 0 ? (entry.amount / maxTripSpending) * 100 : 0;
                    const barHeight = Math.max(percentage, entry.amount > 0 ? 8 : 2); // ensure small expenses still visible
                    const labelDate = new Date(entry.date);
                    const dayLabel = labelDate.toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric'
                    });
                    return (
                      <div key={entry.date} className="flex-1 h-full flex flex-col items-center justify-end">
                        <div className="w-full bg-orange-200 dark:bg-orange-900/60 rounded-t-sm overflow-hidden" style={{ height: `${barHeight}%` }}>
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

      {/* Reference Information */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-50 dark:bg-gray-950 p-4 rounded-lg">
          <h4 className="font-medium text-gray-800 dark:text-gray-200">Total Budget</h4>
          <p className="text-lg font-bold text-gray-600 dark:text-gray-300">
            {formatCurrency(costSummary.totalBudget, costData.currency)}
          </p>
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
