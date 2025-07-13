'use client';

import { CostSummary } from '../../../types';
import { formatCurrency, getCountryAverageDisplay, formatCurrencyWithRefunds } from '../../../lib/costUtils';

interface CountryBreakdownDisplayProps {
  costSummary: CostSummary;
  currency: string;
}


export default function CountryBreakdownDisplay({
  costSummary,
  currency
}: CountryBreakdownDisplayProps) {
  return (
    <div>
      <h4 className="font-medium mb-3">Country Breakdown</h4>
      <div className="space-y-2">
        {costSummary.countryBreakdown.map((country) => (
          <div key={country.country} className="bg-white dark:bg-gray-800 p-4 rounded-sm border dark:border-gray-700">
            <div className="flex justify-between items-center mb-2">
              <h5 className="font-medium">{country.country}</h5>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {country.expenses.length} expenses • {country.days} days
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm mb-3">
              <div>
                <span className="text-gray-600 dark:text-gray-300">Budget:</span>
                <span className="font-medium ml-2">
                  {country.budgetAmount === 0 ? 'Not set' : formatCurrency(country.budgetAmount, currency)}
                </span>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-300">Spent:</span>
                <span className="font-medium ml-2">
                  {(() => {
                    const netSpent = country.spentAmount - country.refundAmount;
                    const refundDisplay = formatCurrencyWithRefunds(netSpent, country.refundAmount, currency);
                    return refundDisplay.displayText;
                  })()}
                </span>
                {country.refundAmount > 0 && (
                  <div className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                    *Includes {formatCurrency(country.refundAmount, currency)} of refunds
                  </div>
                )}
              </div>
              <div>
                {(() => {
                  const avgDisplay = getCountryAverageDisplay(country, costSummary.tripStatus, currency);
                  return (
                    <>
                      <span className="text-gray-600 dark:text-gray-300">{avgDisplay.label}:</span>
                      <span className="font-medium ml-2" title={avgDisplay.tooltip}>
                        {avgDisplay.value}
                      </span>
                    </>
                  );
                })()}
              </div>
            </div>
            
            {/* Enhanced Expense Info */}
            {(country.plannedSpending > 0 || country.postTripSpent > 0) && (
              <div className="grid grid-cols-2 gap-4 text-sm mb-3 pt-3 border-t dark:border-gray-700">
                {country.plannedSpending > 0 && (
                  <div>
                    <span className="text-gray-600 dark:text-gray-300">Planned:</span>
                    <span className="font-medium ml-2 text-cyan-600 dark:text-cyan-300">
                      {(() => {
                        const netPlanned = country.plannedSpending - country.plannedRefunds;
                        const refundDisplay = formatCurrencyWithRefunds(netPlanned, country.plannedRefunds, currency);
                        return refundDisplay.displayText;
                      })()}
                    </span>
                    {country.plannedRefunds > 0 && (
                      <div className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                        *Includes {formatCurrency(country.plannedRefunds, currency)} expected refunds
                      </div>
                    )}
                  </div>
                )}
                {country.postTripSpent > 0 && (
                  <div>
                    <span className="text-gray-600 dark:text-gray-300">Post-Trip:</span>
                    <span className="font-medium ml-2 text-amber-600 dark:text-amber-300">
                      {(() => {
                        const netPostTrip = country.postTripSpent - country.postTripRefunds;
                        const refundDisplay = formatCurrencyWithRefunds(netPostTrip, country.postTripRefunds, currency);
                        return refundDisplay.displayText;
                      })()}
                    </span>
                    {country.postTripRefunds > 0 && (
                      <div className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                        *Includes {formatCurrency(country.postTripRefunds, currency)} of refunds
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            
            {/* Available Budget Display */}
            {country.budgetAmount > 0 && country.availableForPlanning !== (country.budgetAmount - (country.spentAmount - country.refundAmount)) && (
              <div className="text-sm mb-3 pt-3 border-t dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-300">Available for Planning:</span>
                <span className={`font-medium ml-2 ${country.availableForPlanning >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}>
                  {formatCurrency(country.availableForPlanning, currency)}
                </span>
              </div>
            )}
            
            {/* Category Breakdown */}
            {country.categoryBreakdown.length > 0 && (
              <div className="mt-3 pt-3 border-t dark:border-gray-700">
                <h6 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Categories:</h6>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {country.categoryBreakdown.map((category) => (
                    <div key={category.category} className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-300">{category.category} ({category.count}):</span>
                      <span className="font-medium">
                        {(() => {
                          // Check if this category has any refunds
                          const categoryExpenses = country.expenses.filter(e => e.category === category.category);
                          const hasRefunds = categoryExpenses.some(e => e.amount < 0);
                          
                          // category.amount is already the net amount (outflows - refunds)
                          if (hasRefunds) {
                            return `${formatCurrency(category.amount, currency)}*`;
                          } else {
                            return formatCurrency(category.amount, currency);
                          }
                        })()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}