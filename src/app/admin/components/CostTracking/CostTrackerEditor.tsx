'use client';

import { useState, useEffect } from 'react';
import { CostTrackingData, Expense, BudgetItem, CostSummary, CountryPeriod, ExistingTrip } from '../../../types';
import { calculateCostSummary, generateId, EXPENSE_CATEGORIES } from '../../../lib/costUtils';
import CostPieCharts from '../CostPieCharts';
import { ExpenseTravelLookup, createExpenseTravelLookup, TravelLinkInfo } from '../../../lib/expenseTravelLookup';
import BudgetSetup from './BudgetSetup';
import CountryBudgetManager from './CountryBudgetManager';
import CategoryManager from './CategoryManager';
import ExpenseManager from './ExpenseManager';
import CountryBreakdownDisplay from './CountryBreakdownDisplay';
import CostSummaryDashboard from './CostSummaryDashboard';

interface CostTrackerEditorProps {
  costData: CostTrackingData;
  setCostData: React.Dispatch<React.SetStateAction<CostTrackingData>>;
  onSave: () => void;
  existingTrips: ExistingTrip[];
  selectedTrip: ExistingTrip | null;
  setSelectedTrip: React.Dispatch<React.SetStateAction<ExistingTrip | null>>;
  mode: 'create' | 'edit';
  autoSaving: boolean;
  setHasUnsavedChanges: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function CostTrackerEditor({
  costData,
  setCostData,
  onSave,
  existingTrips,
  selectedTrip,
  setSelectedTrip,
  mode,
  autoSaving,
  setHasUnsavedChanges,
}: CostTrackerEditorProps) {
  const [currentBudget, setCurrentBudget] = useState<Partial<BudgetItem>>({
    country: '',
    amount: undefined,
    notes: ''
  });

  const [currentExpense, setCurrentExpense] = useState<Partial<Expense>>({
    date: new Date(),
    amount: 0,
    currency: 'EUR',
    category: '',
    country: '',
    description: '',
    notes: '',
    isGeneralExpense: false,
    expenseType: 'actual'
  });

  const [editingBudgetIndex, setEditingBudgetIndex] = useState<number | null>(null);
  const [editingExpenseIndex, setEditingExpenseIndex] = useState<number | null>(null);
  const [costSummary, setCostSummary] = useState<CostSummary | null>(null);
  
  const [editingPeriodForBudget, setEditingPeriodForBudget] = useState<string | null>(null);
  const [editingPeriodIndex, setEditingPeriodIndex] = useState<number | null>(null);
  const [currentPeriod, setCurrentPeriod] = useState<Partial<CountryPeriod>>({
    startDate: new Date(),
    endDate: new Date(),
    notes: ''
  });
  
  const [newCategory, setNewCategory] = useState('');
  const [editingCategoryIndex, setEditingCategoryIndex] = useState<number | null>(null);
  

  
  const [travelLookup, setTravelLookup] = useState<ExpenseTravelLookup | null>(null);
  
  const getCategories = (): string[] => {
    return costData.customCategories || [...EXPENSE_CATEGORIES];
  };
  
  const ensureCategoriesInitialized = () => {
    if (!costData.customCategories) {
      setCostData(prev => ({ ...prev, customCategories: [...EXPENSE_CATEGORIES] }));
    }
  };

  const getExistingCountries = (): string[] => {
    const countries = new Set<string>();
    costData.countryBudgets.forEach(budget => {
      if (budget.country && budget.country !== 'General') {
        countries.add(budget.country);
      }
    });
    costData.expenses.forEach(expense => {
      if (expense.country && expense.country !== 'General' && !expense.isGeneralExpense) {
        countries.add(expense.country);
      }
    });
    return Array.from(countries).sort();
  };

  const initializeTravelLookup = async (tripId: string) => {
    if (!tripId || tripId === '') return;
    try {
      const lookup = await createExpenseTravelLookup(tripId);
      setTravelLookup(lookup);
    } catch (error) {
      console.error('Failed to initialize travel lookup:', error);
    }
  };

  useEffect(() => {
    if (costData.tripId) {
      initializeTravelLookup(costData.tripId);
    }
  }, [costData.tripId]);

  useEffect(() => {
    if (costData.tripStartDate && costData.tripEndDate) {
      const summary = calculateCostSummary(costData);
      setCostSummary(summary);
    }
  }, [costData]);

  const handleExpenseAdded = async (expense: Expense, travelLinkInfo?: TravelLinkInfo) => {
    if (!expense.isGeneralExpense && expense.country && editingExpenseIndex === null) {
      const existingCountryBudget = costData.countryBudgets.find(
        budget => budget.country === expense.country
      );
      
      if (!existingCountryBudget) {
        const newCountryBudget: BudgetItem = {
          id: generateId(),
          country: expense.country,
          amount: undefined,
          currency: costData.currency,
          notes: 'Auto-created when adding expense'
        };
        
        setCostData(prev => ({ 
          ...prev, 
          countryBudgets: [...prev.countryBudgets, newCountryBudget] 
        }));
      }
    }

    if (editingExpenseIndex !== null) {
      const updatedExpenses = [...costData.expenses];
      updatedExpenses[editingExpenseIndex] = expense;
      setCostData(prev => ({ ...prev, expenses: updatedExpenses }));
      setEditingExpenseIndex(null);
    } else {
      setCostData(prev => ({ ...prev, expenses: [...prev.expenses, expense] }));
    }

    if (travelLinkInfo) {
      try {
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
        const response = await fetch(`${baseUrl}/api/travel-data/update-links`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tripId: costData.tripId,
            travelLinkInfo,
            expenseId: expense.id,
          }),
        });

        if (!response.ok) {
          console.error('Failed to update travel links', await response.json());
        }
      } catch (error) {
        console.error('Error updating travel links:', error);
      }
    }
  };

  return (
    <div className="space-y-8 text-gray-900 dark:text-gray-100">
      <BudgetSetup
        costData={costData}
        setCostData={setCostData}
        existingTrips={existingTrips}
        selectedTrip={selectedTrip}
        setSelectedTrip={setSelectedTrip}
        mode={mode}
      />
      {(selectedTrip || mode === 'edit') && (
      <>
        <CountryBudgetManager
          costData={costData}
          setCostData={setCostData}
          currentBudget={currentBudget}
          setCurrentBudget={setCurrentBudget}
          editingBudgetIndex={editingBudgetIndex}
          setEditingBudgetIndex={setEditingBudgetIndex}
          currentPeriod={currentPeriod}
          setCurrentPeriod={setCurrentPeriod}
          editingPeriodForBudget={editingPeriodForBudget}
          setEditingPeriodForBudget={setEditingPeriodForBudget}
          editingPeriodIndex={editingPeriodIndex}
          setEditingPeriodIndex={setEditingPeriodIndex}
        />
        <CategoryManager
          costData={costData}
          setCostData={setCostData}
          newCategory={newCategory}
          setNewCategory={setNewCategory}
          editingCategoryIndex={editingCategoryIndex}
          setEditingCategoryIndex={setEditingCategoryIndex}
          getCategories={getCategories}
          ensureCategoriesInitialized={ensureCategoriesInitialized}
        />
        <ExpenseManager
          costData={costData}
          setCostData={setCostData}
          currentExpense={currentExpense}
          setCurrentExpense={setCurrentExpense}
          editingExpenseIndex={editingExpenseIndex}
          setEditingExpenseIndex={setEditingExpenseIndex}
          getCategories={getCategories}
          getExistingCountries={getExistingCountries}
          travelLookup={travelLookup}
          onExpenseAdded={handleExpenseAdded}
          setHasUnsavedChanges={setHasUnsavedChanges}
        />

        {costSummary && (
          <CostSummaryDashboard costSummary={costSummary} costData={costData} />
        )}

        {costSummary && costSummary.countryBreakdown.some(c => c.spentAmount > 0) && (
            <CostPieCharts costSummary={costSummary} currency={costData.currency} />
        )}

        {costSummary && costSummary.countryBreakdown.length > 0 && (
          <CountryBreakdownDisplay costSummary={costSummary} currency={costData.currency} />
        )}

        <div className="flex justify-end items-center gap-4">
            {autoSaving && (
              <span className="text-sm text-gray-600">
                💾 Auto-saving...
              </span>
            )}
            <button
              onClick={onSave}
              disabled={!costData.tripId || !costData.overallBudget || costData.overallBudget <= 0}
              className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
            >
              {mode === 'edit' ? 'Update Cost Tracker' : 'Save Cost Tracker'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
