'use client';

import { useId } from 'react';
import { BudgetItem, CountryPeriod, CostTrackingData } from '@/app/types';
import AccessibleDatePicker from '@/app/admin/components/AccessibleDatePicker';
import { calculateInclusiveDays, formatCurrency, formatDate, generateId } from '@/app/lib/costUtils';

interface CountryBudgetManagerProps {
  costData: CostTrackingData;
  setCostData: React.Dispatch<React.SetStateAction<CostTrackingData>>;
  currentBudget: Partial<BudgetItem>;
  setCurrentBudget: React.Dispatch<React.SetStateAction<Partial<BudgetItem>>>;
  editingBudgetIndex: number | null;
  setEditingBudgetIndex: React.Dispatch<React.SetStateAction<number | null>>;
  currentPeriod: Partial<CountryPeriod>;
  setCurrentPeriod: React.Dispatch<React.SetStateAction<Partial<CountryPeriod>>>;
  editingPeriodForBudget: string | null;
  setEditingPeriodForBudget: React.Dispatch<React.SetStateAction<string | null>>;
  editingPeriodIndex: number | null;
  setEditingPeriodIndex: React.Dispatch<React.SetStateAction<number | null>>;
}

export default function CountryBudgetManager({
  costData,
  setCostData,
  currentBudget,
  setCurrentBudget,
  editingBudgetIndex,
  setEditingBudgetIndex,
  currentPeriod,
  setCurrentPeriod,
  editingPeriodForBudget,
  setEditingPeriodForBudget,
  editingPeriodIndex,
  setEditingPeriodIndex,
}: CountryBudgetManagerProps) {
  const id = useId();

  const addBudgetItem = () => {
    if (!currentBudget.country) {
      alert('Please enter a country name.');
      return;
    }

    const baseBudgetItem = {
      id: editingBudgetIndex !== null ? costData.countryBudgets[editingBudgetIndex].id : generateId(),
      country: currentBudget.country,
      currency: costData.currency,
      notes: currentBudget.notes || ''
    };

    // Only include amount if it's a positive number
    const budgetItem: BudgetItem = currentBudget.amount && currentBudget.amount > 0 
      ? { ...baseBudgetItem, amount: currentBudget.amount }
      : baseBudgetItem;

    if (editingBudgetIndex !== null) {
      const updatedBudgets = [...costData.countryBudgets];
      updatedBudgets[editingBudgetIndex] = budgetItem;
      setCostData(prev => ({ ...prev, countryBudgets: updatedBudgets }));
      setEditingBudgetIndex(null);
    } else {
      setCostData(prev => ({ ...prev, countryBudgets: [...prev.countryBudgets, budgetItem] }));
    }

    setCurrentBudget({ country: '', notes: '' });
  };

  const editBudgetItem = (index: number) => {
    const budget = costData.countryBudgets[index];
    setCurrentBudget(budget);
    setEditingBudgetIndex(index);
  };

  const deleteBudgetItem = (index: number) => {
    const updatedBudgets = costData.countryBudgets.filter((_, i) => i !== index);
    setCostData(prev => ({ ...prev, countryBudgets: updatedBudgets }));
  };

  const addPeriod = () => {
    if (!currentPeriod.startDate || !currentPeriod.endDate) {
      alert('Please provide both start and end dates for the period.');
      return;
    }

    if (new Date(currentPeriod.startDate) > new Date(currentPeriod.endDate)) {
      alert('Start date must be before end date.');
      return;
    }

    if (!editingPeriodForBudget) {
      alert('No country budget selected for adding period.');
      return;
    }

    const period: CountryPeriod = {
      id: editingPeriodIndex !== null ? '' : generateId(), // Will be updated for edit
      startDate: new Date(currentPeriod.startDate!),
      endDate: new Date(currentPeriod.endDate!),
      notes: currentPeriod.notes || ''
    };

    const updatedBudgets = costData.countryBudgets.map(budget => {
      if (budget.id === editingPeriodForBudget) {
        const periods = budget.periods || [];
        
        if (editingPeriodIndex !== null) {
          // Edit existing period
          const updatedPeriods = [...periods];
          period.id = periods[editingPeriodIndex].id;
          updatedPeriods[editingPeriodIndex] = period;
          return { ...budget, periods: updatedPeriods };
        } else {
          // Add new period
          return { ...budget, periods: [...periods, period] };
        }
      }
      return budget;
    });

    setCostData(prev => ({ ...prev, countryBudgets: updatedBudgets }));
    setCurrentPeriod({ startDate: new Date(), endDate: new Date(), notes: '' });
    setEditingPeriodIndex(null);
  };

  const editPeriod = (budgetId: string, periodIndex: number) => {
    const budget = costData.countryBudgets.find(b => b.id === budgetId);
    if (budget && budget.periods && budget.periods[periodIndex]) {
      const period = budget.periods[periodIndex];
      setCurrentPeriod(period);
      setEditingPeriodForBudget(budgetId);
      setEditingPeriodIndex(periodIndex);
    }
  };

  const deletePeriod = (budgetId: string, periodIndex: number) => {
    const updatedBudgets = costData.countryBudgets.map(budget => {
      if (budget.id === budgetId && budget.periods) {
        const updatedPeriods = budget.periods.filter((_, i) => i !== periodIndex);
        return { ...budget, periods: updatedPeriods };
      }
      return budget;
    });

    setCostData(prev => ({ ...prev, countryBudgets: updatedBudgets }));
  };

  const cancelPeriodEdit = () => {
    setCurrentPeriod({ startDate: new Date(), endDate: new Date(), notes: '' });
    setEditingPeriodForBudget(null);
    setEditingPeriodIndex(null);
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-md">
      <h4 className="font-medium mb-3">Country Budgets</h4>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <div>
          <label htmlFor="country-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Country</label>
          <input
            id="country-input"
            type="text"
            value={currentBudget.country || ''}
            onChange={(e) => setCurrentBudget(prev => ({ ...prev, country: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            placeholder="Argentina"
          />
        </div>
        <div>
          <label htmlFor="budget-amount" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Budget Amount</label>
          <input
            id="budget-amount"
            type="number"
            value={currentBudget.amount || ''}
            onChange={(e) => {
              const value = e.target.value;
              if (value) {
                setCurrentBudget(prev => ({ ...prev, amount: parseFloat(value) }));
              } else {
                // Remove amount property when input is empty
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { amount, ...rest } = currentBudget;
                setCurrentBudget(rest);
              }
            }}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            placeholder="1000 (leave empty for undefined budget)"
          />
        </div>
        <div>
          <label htmlFor={`${id}-budget-notes`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
          <input
            id={`${id}-budget-notes`}
            type="text"
            value={currentBudget.notes || ''}
            onChange={(e) => setCurrentBudget(prev => ({ ...prev, notes: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            placeholder="Optional notes"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={addBudgetItem}
            className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 mr-2"
          >
            {editingBudgetIndex !== null ? 'Update' : 'Add'} Budget
          </button>
          {editingBudgetIndex !== null && (
            <button
              onClick={() => {
                setEditingBudgetIndex(null);
                setCurrentBudget({ country: '', notes: '' });
              }}
              className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Country Budget List */}
      {costData.countryBudgets.length > 0 && (
        <div className="space-y-4">
          <h5 className="font-medium">Country Budgets ({costData.countryBudgets.length})</h5>
          {costData.countryBudgets.map((budget, index) => (
            <div key={budget.id} className="bg-white dark:bg-gray-800 p-4 rounded-sm border dark:border-gray-700">
              <div className="flex justify-between items-center mb-3">
                <div>
                  <span className="font-medium">{budget.country}</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                    {budget.amount ? formatCurrency(budget.amount, budget.currency) : 'Not set'}
                  </span>
                  {budget.notes && (
                    <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">({budget.notes})</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => editBudgetItem(index)}
                    className="text-blue-500 hover:text-blue-700 text-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteBudgetItem(index)}
                    className="text-red-500 hover:text-red-700 text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
              
              {/* Periods for this country */}
              <div className="mt-3 pt-3 border-t dark:border-gray-700">
                <div className="flex justify-between items-center mb-2">
                  <h6 className="text-sm font-medium text-gray-700 dark:text-gray-300">Visit Periods</h6>
                  <button
                    onClick={() => {
                      setEditingPeriodForBudget(budget.id);
                      setCurrentPeriod({ startDate: new Date(), endDate: new Date(), notes: '' });
                    }}
                    className="text-xs text-blue-500 hover:text-blue-700"
                  >
                    Add Period
                  </button>
                </div>
                
                {budget.periods && budget.periods.length > 0 ? (
                  <div className="space-y-2">
                    {budget.periods.map((period, periodIndex) => (
                      <div key={period.id} className="flex justify-between items-center bg-gray-50 dark:bg-gray-700 p-2 rounded-sm text-sm">
                        <div>
                          <span className="font-medium">
                            {formatDate(period.startDate)} - {formatDate(period.endDate)}
                          </span>
                          {period.notes && (
                            <span className="text-gray-500 dark:text-gray-400 ml-2">({period.notes})</span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => editPeriod(budget.id, periodIndex)}
                            className="text-blue-500 hover:text-blue-700 text-xs"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deletePeriod(budget.id, periodIndex)}
                            className="text-red-500 hover:text-red-700 text-xs"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Total days: {budget.periods.reduce((total, period) => {
                        return total + calculateInclusiveDays(period.startDate, period.endDate);
                      }, 0)}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    No periods configured. Per-day calculations will be based on expense dates.
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Period Management Form */}
      {editingPeriodForBudget && (
        <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-700">
          <h6 className="font-medium text-blue-800 dark:text-blue-200 mb-3">
            {editingPeriodIndex !== null ? 'Edit Period' : 'Add New Period'}
          </h6>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor={`${id}-period-start-date`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
              <AccessibleDatePicker
                id={`${id}-period-start-date`}
                value={currentPeriod.startDate instanceof Date ? currentPeriod.startDate : (currentPeriod.startDate ? new Date(currentPeriod.startDate) : null)}
                onChange={(d) => setCurrentPeriod(prev => ({ ...prev, startDate: d || undefined }))}
                className="w-full"
              />
            </div>
            <div>
              <label htmlFor={`${id}-period-end-date`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date</label>
              <AccessibleDatePicker
                id={`${id}-period-end-date`}
                value={currentPeriod.endDate instanceof Date ? currentPeriod.endDate : (currentPeriod.endDate ? new Date(currentPeriod.endDate) : null)}
                onChange={(d) => setCurrentPeriod(prev => ({ ...prev, endDate: d || undefined }))}
                className="w-full"
              />
            </div>
            <div>
              <label htmlFor={`${id}-period-notes`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes (optional)</label>
              <input
                id={`${id}-period-notes`}
                type="text"
                value={currentPeriod.notes || ''}
                onChange={(e) => setCurrentPeriod(prev => ({ ...prev, notes: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="First visit, return trip, etc."
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={addPeriod}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm"
            >
              {editingPeriodIndex !== null ? 'Update' : 'Add'} Period
            </button>
            <button
              onClick={cancelPeriodEdit}
              className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
