'use client';

import { useState, useEffect } from 'react';
import { CostTrackingData, Expense, BudgetItem, CostSummary, CountryPeriod, ExistingTrip, YnabCategoryMapping, YnabConfig } from '../../../types';
import { calculateCostSummary, generateId, EXPENSE_CATEGORIES, CASH_CATEGORY_NAME } from '../../../lib/costUtils';
import CostPieCharts from '../CostPieCharts';
import { ExpenseTravelLookup, TravelLinkInfo } from '../../../lib/expenseTravelLookup';
import BudgetSetup from './BudgetSetup';
import CountryBudgetManager from './CountryBudgetManager';
import CategoryManager from './CategoryManager';
import ExpenseManager from './ExpenseManager';
import CountryBreakdownDisplay from './CountryBreakdownDisplay';
import CostSummaryDashboard from './CostSummaryDashboard';
import YnabImportForm from '../YnabImportForm';
import YnabMappingManager from '../YnabMappingManager';
import YnabSetup from '../YnabSetup';
import ExportDataMenu from './ExportDataMenu';
import {
  applyAllocationSegmentsToSources,
  getAllocationSegments,
  isCashAllocation,
  isCashSource
} from '../../../lib/cashTransactions';

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
  onRefreshData?: () => Promise<void>;
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
  onRefreshData,
}: CostTrackerEditorProps) {
  const [currentBudget, setCurrentBudget] = useState<Partial<BudgetItem>>({
    country: '',
    // amount omitted initially - no amount set
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
  
  // YNAB Import state
  const [showYnabImport, setShowYnabImport] = useState(false);
  const [showYnabMappings, setShowYnabMappings] = useState(false);
  const [showYnabSetup, setShowYnabSetup] = useState(false);
  

  
  const [travelLookup, setTravelLookup] = useState<ExpenseTravelLookup | null>(null);
  
  const getCategories = (): string[] => {
    const baseCategories = costData.customCategories ? [...costData.customCategories] : [...EXPENSE_CATEGORIES];
    if (!baseCategories.includes(CASH_CATEGORY_NAME)) {
      baseCategories.push(CASH_CATEGORY_NAME);
    }
    return baseCategories;
  };
  
  const ensureCategoriesInitialized = () => {
    if (!costData.customCategories) {
      setCostData(prev => ({
        ...prev,
        customCategories: Array.from(new Set([...EXPENSE_CATEGORIES, CASH_CATEGORY_NAME]))
      }));
    } else if (!costData.customCategories.includes(CASH_CATEGORY_NAME)) {
      setCostData(prev => ({
        ...prev,
        customCategories: [...prev.customCategories!, CASH_CATEGORY_NAME]
      }));
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
      // Fetch trip data to provide to the lookup service
      const response = await fetch(`/api/travel-data?id=${tripId}`);
      if (response.ok) {
        const tripData = await response.json();
        const lookup = new ExpenseTravelLookup(tripId, {
          title: tripData.title,
          locations: tripData.locations,
          accommodations: tripData.accommodations,
          routes: tripData.routes,
          costData: {
            expenses: costData.expenses
          }
        });
        setTravelLookup(lookup);
      } else {
        console.error('Failed to fetch trip data for travel lookup');
        setTravelLookup(null);
      }
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

  useEffect(() => {
    if (travelLookup) {
      travelLookup.hydrateFromExpenses(costData.expenses);
    }
  }, [costData.expenses, travelLookup]);

  const handleExpenseAdded = async (incomingExpense: Expense, travelLinkInfo?: TravelLinkInfo) => {
    let expense: Expense = { ...incomingExpense };

    if (isCashSource(expense) && expense.cashTransaction.cashTransactionId !== expense.id) {
      expense = {
        ...expense,
        cashTransaction: {
          ...expense.cashTransaction,
          cashTransactionId: expense.id
        }
      };
    }

    const updatedCountryBudgets = [...costData.countryBudgets];
    if (!expense.isGeneralExpense && expense.country && editingExpenseIndex === null) {
      const hasBudget = updatedCountryBudgets.some(budget => budget.country === expense.country);
      if (!hasBudget) {
        updatedCountryBudgets.push({
          id: generateId(),
          country: expense.country,
          currency: costData.currency,
          notes: 'Auto-created when adding expense'
        });
      }
    }

    let updatedExpenses = [...costData.expenses];

    if (isCashSource(expense) && expense.cashTransaction.fundingSegments?.length) {
      const segments = expense.cashTransaction.fundingSegments;
      const missingSource = segments.find(
        segment => !updatedExpenses.some(existing => existing.id === segment.sourceExpenseId)
      );

      if (missingSource) {
        alert(
          'Unable to find one of the funding exchanges referenced by this transaction. Please refresh and try again.'
        );
        return;
      }

      try {
        updatedExpenses = applyAllocationSegmentsToSources(updatedExpenses, segments, expense.id);
      } catch (error) {
        console.error('Failed to apply funding segments to cash sources:', error);
        alert(
          error instanceof Error
            ? error.message
            : 'Unable to apply the funding exchanges to this transaction.'
        );
        return;
      }
    }

    if (isCashAllocation(expense) && editingExpenseIndex === null) {
      const segments = getAllocationSegments(expense.cashTransaction);
      const missingSource = segments.find(
        segment => !updatedExpenses.some(existing => existing.id === segment.sourceExpenseId)
      );

      if (missingSource) {
        alert('Unable to find one of the cash exchanges referenced by this spending. Please refresh and try again.');
        return;
      }

      try {
        updatedExpenses = applyAllocationSegmentsToSources(updatedExpenses, segments, expense.id);
      } catch (error) {
        console.error('Failed to apply cash allocation:', error);
        alert(
          error instanceof Error
            ? error.message
            : 'Unable to allocate this cash spending to the available exchanges.'
        );
        return;
      }

      updatedExpenses = [...updatedExpenses, expense];
    } else if (editingExpenseIndex !== null) {
      updatedExpenses[editingExpenseIndex] = expense;
    } else {
      updatedExpenses = [...updatedExpenses, expense];
    }

    const updatedCostData: CostTrackingData = {
      ...costData,
      expenses: updatedExpenses,
      countryBudgets: updatedCountryBudgets
    };

    setCostData(updatedCostData);

    if (editingExpenseIndex !== null) {
      setEditingExpenseIndex(null);
    }

    // Mark as having unsaved changes to trigger auto-save
    setHasUnsavedChanges(true);

    if (travelLinkInfo) {
      try {
        // First, save the expense data to ensure it exists on the server before creating the link
        const saveResponse = await fetch(`/api/cost-tracking?id=${costData.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updatedCostData),
        });

        if (!saveResponse.ok) {
          throw new Error('Failed to save expense data before creating link');
        }

        // Reset unsaved changes flag since we just saved
        setHasUnsavedChanges(false);

        // Now create the travel link
        const response = await fetch('/api/travel-data/expense-links', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tripId: costData.tripId,
            expenseId: expense.id,
            travelItemId: travelLinkInfo.id,
            travelItemType: travelLinkInfo.type,
            description: travelLinkInfo.name,
          }),
        });

        if (!response.ok) {
          const result = await response.json();
          console.error('Failed to link expense to travel item:', result);
          
          // Handle duplicate link case
          if (response.status === 409 && result.error === 'DUPLICATE_LINK' && result.existingLink) {
            const existingLink = result.existingLink;
            const itemTypeLabel = existingLink.travelItemType === 'location' ? 'location' : 
                                 existingLink.travelItemType === 'accommodation' ? 'accommodation' : 'route';
            
            const proceed = confirm(
              `⚠️ DUPLICATE LINK WARNING

` +
              `This expense is already linked to:
` +
              `${itemTypeLabel.toUpperCase()}: "${existingLink.travelItemName}"

` +
              `Do you want to move the link to "${travelLinkInfo.name}" instead?

` +
              `(This will remove the link from "${existingLink.travelItemName}" and add it to "${travelLinkInfo.name}")`
            );
            
            if (proceed) {
              // Use the move API endpoint
              const moveResponse = await fetch('/api/travel-data/expense-links/move', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  tripId: costData.tripId,
                  expenseId: expense.id,
                  fromTravelItemId: existingLink.travelItemId,
                  toTravelItemId: travelLinkInfo.id,
                  toTravelItemType: travelLinkInfo.type,
                  description: travelLinkInfo.name,
                }),
              });
              
              if (!moveResponse.ok) {
                const moveResult = await moveResponse.json();
                console.error('Failed to move expense link:', moveResult);
                alert(`Failed to move expense link: ${moveResult.error || 'Unknown error'}`);
              }
            }
          } else {
            alert(`Failed to link expense: ${result.error || 'Unknown error'}`);
          }
        }
      } catch (error) {
        console.error('Error linking expense to travel item:', error);
        alert(`Failed to link expense: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  };

  // YNAB import handlers
  const handleYnabImportComplete = async () => {
    // Close the import modal
    setShowYnabImport(false);
    
    // Refresh the cost data to show newly imported expenses
    if (onRefreshData) {
      try {
        await onRefreshData();
      } catch (error) {
        console.error('Error refreshing data after YNAB import:', error);
        // Still show success since import completed, just refresh failed
      }
    }
  };;

  const handleYnabMappingsSave = async (mappings: YnabCategoryMapping[]) => {
    try {
      // Create new country budgets for any new countries in mappings
      const newCountries = mappings
        .filter(m => m.mappingType === 'country' && m.countryName)
        .map(m => m.countryName!)
        .filter(country => !costData.countryBudgets.some(b => b.country === country));

      const newBudgets = newCountries.map(country => ({
        id: generateId(),
        country: country,
        // amount omitted - no budget amount set for auto-created budget
        currency: costData.currency,
        notes: 'Auto-created from YNAB mapping'
      }));

      // Update cost data with new mappings and budgets
      const updatedCostData = {
        ...costData,
        countryBudgets: [...costData.countryBudgets, ...newBudgets],
        ynabImportData: {
          ...costData.ynabImportData,
          mappings: mappings,
          importedTransactionHashes: costData.ynabImportData?.importedTransactionHashes || []
        },
        updatedAt: new Date().toISOString()
      };

      const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/api/cost-tracking?id=${costData.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedCostData),
      });
      
      if (response.ok) {
        setCostData(updatedCostData);
        const message = newCountries.length > 0 
          ? `YNAB mappings saved successfully! Created ${newCountries.length} new country budget(s): ${newCountries.join(', ')}`
          : 'YNAB mappings saved successfully!';
        alert(message);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        alert(`Error saving mappings: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error saving YNAB mappings:', error);
      alert('Error saving YNAB mappings');
    }
  };

  const handleYnabConfigSaved = async (config: YnabConfig) => {
    try {
      // Update cost data with YNAB configuration
      const updatedCostData = {
        ...costData,
        ynabConfig: config,
        updatedAt: new Date().toISOString()
      };

      // Save to backend if in edit mode
      if (mode === 'edit' && costData.id) {
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
        const response = await fetch(`${baseUrl}/api/cost-tracking?id=${costData.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updatedCostData),
        });
        
        if (response.ok) {
          setCostData(updatedCostData);
          alert('YNAB configuration saved successfully!');
        } else {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          alert(`Error saving YNAB configuration: ${errorData.error || 'Unknown error'}`);
        }
      } else {
        // For create mode, just update local state
        setCostData(updatedCostData);
        alert('YNAB configuration saved! Remember to save your cost tracker to persist the configuration.');
      }
    } catch (error) {
      console.error('Error saving YNAB configuration:', error);
      alert('Error saving YNAB configuration');
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
        <div className="space-y-4">
          {mode === 'edit' && (
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-semibold">Expense Tracking</h3>
              <div className="flex gap-2">
                <ExportDataMenu costData={costData} />
                <button
                  onClick={() => setShowYnabSetup(true)}
                  className="px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 text-sm"
                >
                  Setup YNAB API
                </button>
                <button
                  onClick={() => setShowYnabMappings(true)}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm"
                >
                  Manage YNAB Mappings
                </button>
                <button
                  onClick={() => setShowYnabImport(true)}
                  className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 text-sm"
                >
                  Import from YNAB
                </button>
              </div>
            </div>
          )}
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
            tripId={costData.tripId}
          />
        </div>

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

      {/* YNAB Import Modal */}
      {showYnabImport && (
        <YnabImportForm
          isOpen={showYnabImport}
          costData={costData}
          onImportComplete={handleYnabImportComplete}
          onClose={() => setShowYnabImport(false)}
        />
      )}
      
      {/* YNAB Setup Modal */}
      <YnabSetup
        isOpen={showYnabSetup}
        costTrackerId={costData.id}
        existingConfig={costData.ynabConfig}
        onConfigSaved={handleYnabConfigSaved}
        onClose={() => setShowYnabSetup(false)}
      />
      
      {/* YNAB Mapping Manager Modal */}
      <YnabMappingManager
        isOpen={showYnabMappings}
        costData={costData}
        onSave={handleYnabMappingsSave}
        onClose={() => setShowYnabMappings(false)}
      />
    </div>
  );
}
