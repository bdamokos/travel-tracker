'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Accommodation,
  CostTrackingData,
  Expense,
  BudgetItem,
  CostSummary,
  CountryPeriod,
  ExistingTrip,
  Location,
  YnabCategoryMapping,
  YnabConfig
} from '@/app/types';
import { calculateCostSummary, generateId, EXPENSE_CATEGORIES, ensureManagedExpenseCategories } from '@/app/lib/costUtils';
import { calculateExpenseTotalsByLocation, ExpenseTravelLookup, TravelLinkInfo } from '@/app/lib/expenseTravelLookup';
import { filterExpensesByExcludedCountries } from '@/app/lib/countryInclusions';
import BudgetSetup from '@/app/admin/components/CostTracking/BudgetSetup';
import CountryBudgetManager from '@/app/admin/components/CostTracking/CountryBudgetManager';
import CategoryManager from '@/app/admin/components/CostTracking/CategoryManager';
import ExpenseManager from '@/app/admin/components/CostTracking/ExpenseManager';
import CostSummaryDashboard from '@/app/admin/components/CostTracking/CostSummaryDashboard';
import ExpenseLeaderboards from '@/app/admin/components/CostTracking/ExpenseLeaderboards';
import ExportDataMenu from '@/app/admin/components/CostTracking/ExportDataMenu';
import YnabImportForm from '@/app/admin/components/YnabImportForm';
import YnabMappingManager from '@/app/admin/components/YnabMappingManager';
import YnabSetup from '@/app/admin/components/YnabSetup';
import {
  applyAllocationSegmentsToSources,
  getAllocationSegments,
  isCashAllocation,
  isCashSource
} from '@/app/lib/cashTransactions';
import { getTodayLocalDay } from '@/app/lib/localDateUtils';

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

type ApplyExpenseToCostDataParams = {
  costData: CostTrackingData;
  expense: Expense;
  editingExpenseIndex: number | null;
};

const editorSections = [
  { id: 'cost-overview', label: 'Overview' },
  { id: 'cost-budgets', label: 'Budgets' },
  { id: 'cost-categories', label: 'Categories' },
  { id: 'cost-expenses', label: 'Expenses' },
  { id: 'cost-insights', label: 'Insights' },
] as const;

const secondaryActionClassName = [
  'inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300',
  'bg-white px-3 py-2 text-sm font-medium text-slate-700 transition',
  'hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
  'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800',
].join(' ');

const categoryListsEqual = (left: readonly string[], right: readonly string[]): boolean => {
  return left.length === right.length && left.every((category, index) => category === right[index]);
};

const primaryActionClassName = [
  'inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 py-2',
  'text-sm font-semibold text-white transition hover:bg-blue-700',
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
  'disabled:cursor-not-allowed disabled:bg-slate-400 disabled:text-slate-100',
].join(' ');

export function applyExpenseToCostData({
  costData,
  expense,
  editingExpenseIndex
}: ApplyExpenseToCostDataParams): CostTrackingData {
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
      throw new Error(
        'Unable to find one of the funding exchanges referenced by this transaction. Please refresh and try again.'
      );
    }

    updatedExpenses = applyAllocationSegmentsToSources(updatedExpenses, segments, expense.id);
  }

  if (isCashAllocation(expense) && editingExpenseIndex === null) {
    const segments = getAllocationSegments(expense.cashTransaction);
    const missingSource = segments.find(
      segment => !updatedExpenses.some(existing => existing.id === segment.sourceExpenseId)
    );

    if (missingSource) {
      throw new Error('Unable to find one of the cash exchanges referenced by this spending. Please refresh and try again.');
    }

    updatedExpenses = applyAllocationSegmentsToSources(updatedExpenses, segments, expense.id);
    updatedExpenses = [...updatedExpenses, expense];
  } else if (editingExpenseIndex !== null) {
    updatedExpenses[editingExpenseIndex] = expense;
  } else {
    updatedExpenses = [...updatedExpenses, expense];
  }

  return {
    ...costData,
    expenses: updatedExpenses,
    countryBudgets: updatedCountryBudgets
  };
}

/**
 * Renders the CostTrackerEditor UI for creating and editing a cost-tracking dataset, including budget and country budgets, categories, expense tracking, YNAB import/mappings/setup, travel lookup and expense-to-travel linking.
 *
 * @param costData - The cost tracking dataset to display and edit
 * @param setCostData - State setter to update the cost tracking dataset
 * @param onSave - Callback invoked to persist the cost tracker
 * @param existingTrips - List of available trips for travel-linked expenses
 * @param selectedTrip - Currently selected trip or null
 * @param setSelectedTrip - Setter to change the selected trip
 * @param mode - Editor mode, either `'create'` or `'edit'`
 * @param autoSaving - Whether auto-save is active (affects UI indicators)
 * @param setHasUnsavedChanges - Setter to mark the form as having unsaved changes
 * @param onRefreshData - Optional callback to refresh data from the server (used after imports)
 * @returns The rendered CostTrackerEditor component tree
 */
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
  const [excludedCountries, setExcludedCountries] = useState<string[]>([]);
  const [currentBudget, setCurrentBudget] = useState<Partial<BudgetItem>>({
    country: '',
    // amount omitted initially - no amount set
    notes: ''
  });

  const [currentExpense, setCurrentExpense] = useState<Partial<Expense>>({
    date: getTodayLocalDay(),
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
  const costSummary = useMemo<CostSummary | null>(() => {
    if (!costData.tripStartDate || !costData.tripEndDate) {
      return null;
    }

    return calculateCostSummary(costData);
  }, [costData]);
  
  const [editingPeriodForBudget, setEditingPeriodForBudget] = useState<string | null>(null);
  const [editingPeriodIndex, setEditingPeriodIndex] = useState<number | null>(null);
  const [currentPeriod, setCurrentPeriod] = useState<Partial<CountryPeriod>>({
    startDate: getTodayLocalDay(),
    endDate: getTodayLocalDay(),
    notes: ''
  });
  
  const [newCategory, setNewCategory] = useState('');
  const [editingCategoryIndex, setEditingCategoryIndex] = useState<number | null>(null);
  const [pendingSaveAfterCategoryRepair, setPendingSaveAfterCategoryRepair] = useState(false);
  
  // YNAB Import state
  const [showYnabImport, setShowYnabImport] = useState(false);
  const [showYnabMappings, setShowYnabMappings] = useState(false);
  const [showYnabSetup, setShowYnabSetup] = useState(false);
  

  
  const [travelLookup, setTravelLookup] = useState<ExpenseTravelLookup | null>(null);
  const [tripLocations, setTripLocations] = useState<Location[]>([]);
  const [tripAccommodations, setTripAccommodations] = useState<Accommodation[]>([]);
  
  const getCategories = (): string[] => {
    return ensureManagedExpenseCategories(costData.customCategories ?? EXPENSE_CATEGORIES);
  };
  
  const ensureCategoriesInitialized = (): void => {
    const categories = ensureManagedExpenseCategories(costData.customCategories ?? EXPENSE_CATEGORIES);
    if (!costData.customCategories || !categoryListsEqual(costData.customCategories, categories)) {
      setCostData(prev => ({
        ...prev,
        customCategories: ensureManagedExpenseCategories(prev.customCategories ?? EXPENSE_CATEGORIES)
      }));
      setHasUnsavedChanges(true);
    }
  };

  useEffect(() => {
    ensureCategoriesInitialized();
  });

  useEffect(() => {
    if (!pendingSaveAfterCategoryRepair) {
      return;
    }

    const categories = ensureManagedExpenseCategories(costData.customCategories ?? EXPENSE_CATEGORIES);
    if (!costData.customCategories || !categoryListsEqual(costData.customCategories, categories)) {
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      setPendingSaveAfterCategoryRepair(false);
      onSave();
    });

    return () => {
      cancelled = true;
    };
  }, [costData.customCategories, onSave, pendingSaveAfterCategoryRepair]);

  const handleSave = (): void => {
    const categories = ensureManagedExpenseCategories(costData.customCategories ?? EXPENSE_CATEGORIES);
    if (!costData.customCategories || !categoryListsEqual(costData.customCategories, categories)) {
      setPendingSaveAfterCategoryRepair(true);
      setCostData(prev => ({
        ...prev,
        customCategories: ensureManagedExpenseCategories(prev.customCategories ?? EXPENSE_CATEGORIES)
      }));
      setHasUnsavedChanges(true);
      return;
    }

    onSave();
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
    if (!tripId || tripId === '') {
      setTravelLookup(null);
      setTripLocations([]);
      setTripAccommodations([]);
      return;
    }
    try {
      // Fetch trip data to provide to the lookup service
      const response = await fetch(`/api/travel-data?id=${tripId}`, { cache: 'no-store' });
      if (response.ok) {
        const tripData = await response.json();
        setTripLocations(tripData.locations ?? []);
        setTripAccommodations(tripData.accommodations ?? []);
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
        setTripLocations([]);
        setTripAccommodations([]);
      }
    } catch (error) {
      console.error('Failed to initialize travel lookup:', error);
      setTravelLookup(null);
      setTripLocations([]);
      setTripAccommodations([]);
    }
  };

  useEffect(() => {
    if (costData.tripId) {
      queueMicrotask(() => {
        void initializeTravelLookup(costData.tripId);
      });
    }
  }, [costData.tripId]);

  useEffect(() => {
    if (travelLookup) {
      travelLookup.hydrateFromExpenses(costData.expenses);
    }
  }, [costData.expenses, travelLookup]);

  const leaderboardExpenses = useMemo(
    () => filterExpensesByExcludedCountries(costData.expenses || [], excludedCountries),
    [costData.expenses, excludedCountries]
  );

  const locationTotals = useMemo(() => {
    if (!travelLookup || tripLocations.length === 0) {
      return null;
    }

    return calculateExpenseTotalsByLocation({
      expenses: leaderboardExpenses,
      travelLookup,
      accommodations: tripAccommodations,
      trackingCurrency: costData.currency || 'USD'
    });
  }, [costData.currency, leaderboardExpenses, travelLookup, tripAccommodations, tripLocations]);

  const canSave = Boolean(costData.tripId && costData.overallBudget && costData.overallBudget > 0);

  const handleExpenseAdded = async (incomingExpense: Expense, travelLinkInfo?: TravelLinkInfo | TravelLinkInfo[]) => {
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

    let updatedCostData: CostTrackingData | null = null;
    let applyErrorMessage: string | null = null;

    setCostData(prevCostData => {
      try {
        updatedCostData = applyExpenseToCostData({
          costData: prevCostData,
          expense,
          editingExpenseIndex
        });
        return updatedCostData;
      } catch (error) {
        applyErrorMessage =
          error instanceof Error
            ? error.message
            : 'Unable to update the cost tracker with this expense.';
        return prevCostData;
      }
    });

    if (applyErrorMessage || !updatedCostData) {
      const errorMessage =
        applyErrorMessage ?? 'Unable to update the cost tracker with this expense.';
      console.error('Failed to apply expense update:', errorMessage);
      alert(errorMessage);
      return;
    }

    if (editingExpenseIndex !== null) {
      setEditingExpenseIndex(null);
    }

    // Mark as having unsaved changes to trigger auto-save
    setHasUnsavedChanges(true);

    // Only handle single links here - multi-links are saved directly by the useMultiRouteLinks hook
    if (travelLinkInfo && !Array.isArray(travelLinkInfo)) {
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
  };

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
    <div className="space-y-8 pb-28 text-gray-900 dark:text-gray-100">
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
        <nav
          aria-label="Cost tracker sections"
          className="sticky top-2 z-20 -mx-1 overflow-x-auto rounded-xl border border-slate-200 bg-white/95 px-1.5 py-1.5 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/90"
        >
          <div className="flex min-w-max gap-1">
            {editorSections.map(section => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="rounded-lg px-2 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-50 sm:px-3 sm:text-sm"
              >
                {section.label}
              </a>
            ))}
          </div>
        </nav>

        {costSummary && (
          <section id="cost-overview" className="scroll-mt-24">
            <CostSummaryDashboard
              costSummary={costSummary}
              costData={costData}
              excludedCountries={excludedCountries}
              setExcludedCountries={setExcludedCountries}
            />
          </section>
        )}

        <section id="cost-budgets" className="scroll-mt-24">
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
        </section>

        <section id="cost-categories" className="scroll-mt-24">
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
        </section>

        <section id="cost-expenses" className="scroll-mt-24 space-y-4">
          {mode === 'edit' && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    Expense operations
                  </p>
                  <h3 className="mt-1 text-xl font-semibold text-slate-950 dark:text-slate-100">Expense Tracking</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                <ExportDataMenu costData={costData} />
                <button
                  type="button"
                  onClick={() => setShowYnabSetup(true)}
                  className={secondaryActionClassName}
                >
                  Setup YNAB API
                </button>
                <button
                  type="button"
                  onClick={() => setShowYnabMappings(true)}
                  className={secondaryActionClassName}
                >
                  Manage YNAB Mappings
                </button>
                <button
                  type="button"
                  onClick={() => setShowYnabImport(true)}
                  className={primaryActionClassName}
                >
                  Import from YNAB
                </button>
                </div>
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
        </section>

        {costData.expenses.length > 0 && (
          <section id="cost-insights" className="scroll-mt-24">
            <ExpenseLeaderboards
              expenses={leaderboardExpenses}
              currency={costData.currency}
              locationTotals={locationTotals}
              locations={tripLocations}
            />
          </section>
        )}

        <div className="sticky bottom-3 z-30 rounded-xl border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:bottom-4 sm:p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {autoSaving ? 'Saving changes' : canSave ? 'Ready to save' : 'Not ready to save'}
              </p>
              <p className="hidden text-xs text-slate-500 dark:text-slate-400 sm:block">
                {autoSaving
                  ? 'Autosave is writing the latest edit.'
                  : mode === 'edit'
                    ? 'Manual save is still available for this tracker.'
                    : 'Complete the required budget and trip fields to save.'}
              </p>
            </div>
            <div className="flex shrink-0 items-center justify-end gap-3">
            {autoSaving && (
              <span className="hidden text-sm font-medium text-slate-600 dark:text-slate-300 sm:inline" aria-live="polite">
                Auto-saving...
              </span>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className={primaryActionClassName}
            >
              {mode === 'edit' ? 'Update Cost Tracker' : 'Save Cost Tracker'}
            </button>
            </div>
          </div>
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
