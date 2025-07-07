'use client';

import { useState, useEffect } from 'react';
import { CostTrackingData, Expense, BudgetItem, CostSummary, CountryPeriod, YnabCategoryMapping, ExpenseType } from '../../types';
import { calculateCostSummary, formatCurrency, formatDate, generateId, EXPENSE_CATEGORIES, getCountryAverageDisplay, formatCurrencyWithRefunds } from '../../lib/costUtils';
import YnabImportForm from './YnabImportForm';
import YnabMappingManager from './YnabMappingManager';
import CostPieCharts from './CostPieCharts';
import ExpenseForm from './ExpenseForm';
import TravelLinkDisplay from './TravelLinkDisplay';

interface ExistingTrip {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  createdAt: string;
}

interface ExistingCostEntry {
  id: string;
  tripId: string;
  tripTitle: string;
  tripStartDate: string;
  tripEndDate: string;
  overallBudget: number;
  currency: string;
  totalSpent: number;
  remainingBudget: number;
  createdAt: string;
}

export default function CostTrackingForm() {
  const [mode, setMode] = useState<'create' | 'edit' | 'list'>('list');
  const [existingTrips, setExistingTrips] = useState<ExistingTrip[]>([]);
  const [existingCostEntries, setExistingCostEntries] = useState<ExistingCostEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoSaving, setAutoSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  const [costData, setCostData] = useState<CostTrackingData>({
    id: '',
    tripId: '',
    tripTitle: '',
    tripStartDate: '',
    tripEndDate: '',
    overallBudget: 0,
    currency: 'EUR',
    countryBudgets: [],
    expenses: [],
    customCategories: [...EXPENSE_CATEGORIES],
    createdAt: '',
  });

  const [currentBudget, setCurrentBudget] = useState<Partial<BudgetItem>>({
    country: '',
    amount: undefined,
    notes: ''
  });

  const [currentExpense, setCurrentExpense] = useState<Partial<Expense>>({
    date: '',
    amount: 0,
    currency: 'EUR',
    category: '',
    country: '',
    description: '',
    notes: '',
    isGeneralExpense: false,
    expenseType: 'actual',
    travelReference: undefined
  });

  const [editingBudgetIndex, setEditingBudgetIndex] = useState<number | null>(null);
  const [editingExpenseIndex, setEditingExpenseIndex] = useState<number | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<ExistingTrip | null>(null);
  const [costSummary, setCostSummary] = useState<CostSummary | null>(null);
  
  // Period management state
  const [editingPeriodForBudget, setEditingPeriodForBudget] = useState<string | null>(null);
  const [editingPeriodIndex, setEditingPeriodIndex] = useState<number | null>(null);
  const [currentPeriod, setCurrentPeriod] = useState<Partial<CountryPeriod>>({
    startDate: '',
    endDate: '',
    notes: ''
  });
  
  // Category management state
  const [newCategory, setNewCategory] = useState('');
  const [editingCategoryIndex, setEditingCategoryIndex] = useState<number | null>(null);
  
  // YNAB Import state
  const [showYnabImport, setShowYnabImport] = useState(false);
  const [showYnabMappings, setShowYnabMappings] = useState(false);
  
  // Country autocomplete state (keeping for other parts of the form)
  // const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  // const [filteredCountries, setFilteredCountries] = useState<string[]>([]);
  
  // Helper function to get categories with backward compatibility
  const getCategories = (): string[] => {
    return costData.customCategories || [...EXPENSE_CATEGORIES];
  };
  
  // Helper function to ensure categories are initialized
  const ensureCategoriesInitialized = () => {
    if (!costData.customCategories) {
      setCostData(prev => ({ ...prev, customCategories: [...EXPENSE_CATEGORIES] }));
    }
  };

  // Helper function to determine if an expense is post-trip
  const isPostTripExpense = (expense: Expense): boolean => {
    if (!costData.tripEndDate) return false;
    const expenseDate = new Date(expense.date);
    const tripEndDate = new Date(costData.tripEndDate);
    return expenseDate > tripEndDate && expense.expenseType === 'actual';
  };

  // Helper function to get all existing countries
  const getExistingCountries = (): string[] => {
    const countries = new Set<string>();
    
    // Add countries from country budgets
    costData.countryBudgets.forEach(budget => {
      if (budget.country && budget.country !== 'General') {
        countries.add(budget.country);
      }
    });
    
    // Add countries from existing expenses
    costData.expenses.forEach(expense => {
      if (expense.country && expense.country !== 'General' && !expense.isGeneralExpense) {
        countries.add(expense.country);
      }
    });
    
    return Array.from(countries).sort();
  };

  // Note: These functions were used by the old expense form, now handled by ExpenseForm
  // const handleCountryInputChange = (value: string) => { ... };
  // const selectCountry = (country: string) => { ... };

  // Load existing trips and cost entries
  useEffect(() => {
    let mounted = true;
    
    const loadData = async () => {
      setLoading(true);
      await Promise.all([loadExistingTrips(), loadExistingCostEntries()]);
      if (mounted) {
        setLoading(false);
      }
    };
    
    loadData();
    
    return () => {
      mounted = false;
    };
  }, []);

  // Recalculate summary when cost data changes
  useEffect(() => {
    if (costData.tripStartDate && costData.tripEndDate) {
      const summary = calculateCostSummary(costData);
      setCostSummary(summary);
    }
  }, [costData]);

  // Auto-save effect for edit mode (debounced)
  useEffect(() => {
    // Only auto-save if we're in edit mode and have made changes
    if (mode === 'edit' && costData.id && costData.tripId && costData.overallBudget > 0 && hasUnsavedChanges) {
      const timeoutId = setTimeout(async () => {
        try {
          setAutoSaving(true);
          const success = await autoSaveCostData();
          if (success) {
            setHasUnsavedChanges(false); // Mark as saved
          }
          setAutoSaving(false);
        } catch (error) {
          console.error('Auto-save failed:', error);
          setAutoSaving(false);
        }
      }, 2000); // Auto-save after 2 seconds of inactivity

      return () => clearTimeout(timeoutId);
    }
  }, [costData.overallBudget, costData.countryBudgets, costData.expenses, mode, hasUnsavedChanges]);

  // Track when user makes changes (but not on initial load)
  useEffect(() => {
    if (mode === 'edit' && costData.id) {
      // Set flag that we have unsaved changes
      setHasUnsavedChanges(true);
    }
  }, [costData.overallBudget, costData.countryBudgets, costData.expenses]); // Track actual data changes

  const loadExistingTrips = async () => {
    try {
      const response = await fetch('/api/travel-data/list');
      if (response.ok) {
        const trips = await response.json();
        setExistingTrips(trips);
      } else {
        setExistingTrips([]); // Ensure it's always an array
      }
    } catch (error) {
      console.error('Error loading trips:', error);
    }
  };

  const loadExistingCostEntries = async () => {
    try {
      const response = await fetch('/api/cost-tracking/list');
      if (response.ok) {
        const entries = await response.json();
        setExistingCostEntries(entries);
      } else {
        console.error('Error loading cost entries:', response.status);
      }
    } catch (error) {
      console.error('Error loading cost entries:', error);
    }
  };

  const loadCostEntryForEditing = async (costId: string) => {
    try {
      if (!costId) {
        console.error('Cost ID is missing');
        alert('Error: Cost ID is missing');
        return;
      }
      
      const response = await fetch(`/api/cost-tracking?id=${costId}`);
      if (response.ok) {
        const data = await response.json();
        
        // Migration: Ensure all expenses have expenseType field (for backward compatibility)
        const migratedData = {
          ...data,
          expenses: data.expenses.map((expense: Expense) => ({
            ...expense,
            expenseType: expense.expenseType || 'actual'
          }))
        };
        
        setCostData(migratedData);
        setHasUnsavedChanges(false); // Reset flag when entering edit mode
        setMode('edit');
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Error response:', response.status, errorData);
        alert(`Error loading cost entry: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error loading cost entry:', error);
      alert('Error loading cost entry');
    }
  };

  const handleTripSelection = (trip: ExistingTrip) => {
    setSelectedTrip(trip);
    setCostData(prev => ({
      ...prev,
      tripId: trip.id,
      tripTitle: trip.title,
      tripStartDate: trip.startDate,
      tripEndDate: trip.endDate
    }));
  };

  const addBudgetItem = () => {
    if (!currentBudget.country) {
      alert('Please enter a country name.');
      return;
    }

    const budgetItem: BudgetItem = {
      id: editingBudgetIndex !== null ? costData.countryBudgets[editingBudgetIndex].id : generateId(),
      country: currentBudget.country,
      amount: currentBudget.amount && currentBudget.amount > 0 ? currentBudget.amount : undefined,
      currency: costData.currency, // Use the main currency from cost data
      notes: currentBudget.notes || ''
    };

    if (editingBudgetIndex !== null) {
      const updatedBudgets = [...costData.countryBudgets];
      updatedBudgets[editingBudgetIndex] = budgetItem;
      setCostData(prev => ({ ...prev, countryBudgets: updatedBudgets }));
      setEditingBudgetIndex(null);
    } else {
      setCostData(prev => ({ ...prev, countryBudgets: [...prev.countryBudgets, budgetItem] }));
    }

    setCurrentBudget({ country: '', amount: undefined, notes: '' });
  };

  // Note: Replaced by handleExpenseAdded for React 19 Actions
  // const addExpense = () => { ... };

  // Handler for the new ExpenseForm component using React 19 Actions
  const handleExpenseAdded = (expense: Expense) => {
    // Auto-create country budget if expense is for a country we don't have a budget for
    if (!expense.isGeneralExpense && expense.country && editingExpenseIndex === null) {
      const existingCountryBudget = costData.countryBudgets.find(
        budget => budget.country === expense.country
      );
      
      if (!existingCountryBudget) {
        const newCountryBudget: BudgetItem = {
          id: generateId(),
          country: expense.country,
          amount: undefined, // Undefined amount as requested
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

    // Note: Country dropdown now handled in ExpenseForm
  };

  const editBudgetItem = (index: number) => {
    const budget = costData.countryBudgets[index];
    setCurrentBudget(budget);
    setEditingBudgetIndex(index);
  };

  const editExpense = (expenseId: string) => {
    const index = costData.expenses.findIndex(exp => exp.id === expenseId);
    if (index === -1) {
      console.error('Expense not found:', expenseId);
      return;
    }
    
    const expense = costData.expenses[index];
    setCurrentExpense(expense);
    setEditingExpenseIndex(index);
  };

  const removeTravelLink = (expenseId: string) => {
    const updatedExpenses = costData.expenses.map(expense => 
      expense.id === expenseId 
        ? { ...expense, travelReference: undefined }
        : expense
    );
    setCostData(prev => ({ ...prev, expenses: updatedExpenses }));
  };

  const deleteBudgetItem = (index: number) => {
    const updatedBudgets = costData.countryBudgets.filter((_, i) => i !== index);
    setCostData(prev => ({ ...prev, countryBudgets: updatedBudgets }));
  };

  // Period management functions
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
      startDate: currentPeriod.startDate,
      endDate: currentPeriod.endDate,
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
    setCurrentPeriod({ startDate: '', endDate: '', notes: '' });
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
    setCurrentPeriod({ startDate: '', endDate: '', notes: '' });
    setEditingPeriodForBudget(null);
    setEditingPeriodIndex(null);
  };

  // Category management functions
  const addCategory = () => {
    if (!newCategory.trim()) {
      alert('Please enter a category name.');
      return;
    }

    ensureCategoriesInitialized();
    const currentCategories = getCategories();

    if (currentCategories.includes(newCategory.trim())) {
      alert('This category already exists.');
      return;
    }

    if (editingCategoryIndex !== null) {
      // Edit existing category
      const updatedCategories = [...currentCategories];
      updatedCategories[editingCategoryIndex] = newCategory.trim();
      setCostData(prev => ({ ...prev, customCategories: updatedCategories }));
      setEditingCategoryIndex(null);
    } else {
      // Add new category
      setCostData(prev => ({
        ...prev,
        customCategories: [...currentCategories, newCategory.trim()]
      }));
    }

    setNewCategory('');
  };

  const editCategory = (index: number) => {
    const currentCategories = getCategories();
    setNewCategory(currentCategories[index]);
    setEditingCategoryIndex(index);
  };

  const deleteCategory = (index: number) => {
    const currentCategories = getCategories();
    const categoryToDelete = currentCategories[index];
    
    // Check if the category is used in any expenses
    const isUsed = costData.expenses.some(expense => expense.category === categoryToDelete);
    if (isUsed) {
      alert('Cannot delete this category as it is used in existing expenses.');
      return;
    }

    const updatedCategories = currentCategories.filter((_, i) => i !== index);
    setCostData(prev => ({ ...prev, customCategories: updatedCategories }));
  };

  const cancelCategoryEdit = () => {
    setNewCategory('');
    setEditingCategoryIndex(null);
  };

  const deleteExpense = (expenseId: string) => {
    const updatedExpenses = costData.expenses.filter(expense => expense.id !== expenseId);
    setCostData(prev => ({ ...prev, expenses: updatedExpenses }));
  };

  const convertPlannedToActual = (expenseId: string) => {
    const updatedExpenses = costData.expenses.map(expense => {
      if (expense.id === expenseId && expense.expenseType === 'planned') {
        return {
          ...expense,
          expenseType: 'actual' as ExpenseType,
          originalPlannedId: expense.id // Keep reference to original planned expense
        };
      }
      return expense;
    });
    setCostData(prev => ({ ...prev, expenses: updatedExpenses }));
    setHasUnsavedChanges(true);
  };

  const handleYnabImportComplete = async () => {
    // Reload the cost data to show imported transactions
    if (costData.id) {
      await loadCostEntryForEditing(costData.id);
    }
    setShowYnabImport(false);
  };

  const handleYnabMappingsSave = async (mappings: YnabCategoryMapping[]) => {
    try {
      // Create new country budgets for any new countries in mappings
      const newCountries = mappings
        .filter(m => m.mappingType === 'country' && m.countryName)
        .map(m => m.countryName!)
        .filter(country => !costData.countryBudgets.some(b => b.country === country));

      const newBudgets = newCountries.map(country => ({
        id: `budget-${country}-${Date.now()}`,
        country: country,
        amount: undefined,
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

      const response = await fetch(`/api/cost-tracking?id=${costData.id}`, {
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

  // Silent auto-save function (no alerts, no redirects)
  const autoSaveCostData = async () => {
    // Validation (silent)
    if (!costData.tripId || !costData.overallBudget || costData.overallBudget <= 0) {
      return false; // Invalid data, don't save
    }

    const method = mode === 'edit' ? 'PUT' : 'POST';
    const url = mode === 'edit' ? `/api/cost-tracking?id=${costData.id}` : '/api/cost-tracking';
    
    const dataToSave = mode === 'edit' ? costData : { ...costData, id: undefined };
    
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dataToSave),
    });
    
    return response.ok; // Return success status
  };

  const saveCostData = async () => {
    try {
      // Validation
      if (!costData.tripId || !costData.overallBudget || costData.overallBudget <= 0) {
        alert('Please select a trip and set an overall budget (greater than 0) before saving.');
        return;
      }

      const method = mode === 'edit' ? 'PUT' : 'POST';
      const url = mode === 'edit' ? `/api/cost-tracking?id=${costData.id}` : '/api/cost-tracking';
      
      // For new entries, don't include the empty ID in the request body
      const dataToSave = mode === 'edit' 
        ? costData 
        : { ...costData, id: undefined };
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataToSave),
      });
      
      if (response.ok) {
        await response.json();
        setHasUnsavedChanges(false); // Mark as saved
        alert('Cost tracking data saved successfully!');
        setMode('list');
        await loadExistingCostEntries();
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Save error:', response.status, errorData);
        alert(`Error saving cost tracking data: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error:', error);
      alert(`Error saving cost tracking data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // List view
  if (mode === 'list') {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold">Cost Tracking</h2>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                setLoading(true);
                await Promise.all([loadExistingTrips(), loadExistingCostEntries()]);
                setLoading(false);
              }}
              disabled={loading}
              className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
            <button
              onClick={() => setMode('create')}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Create New Cost Tracker
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Loading cost tracking data...</p>
          </div>
        ) : existingCostEntries.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">No cost tracking entries found.</p>
            <button
              onClick={() => setMode('create')}
              className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Create Your First Cost Tracker
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {existingCostEntries.map((entry) => (
              <div key={entry.id} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-6 shadow-xs hover:shadow-md transition-shadow">
                <h3 className="font-semibold text-lg mb-2">{entry.tripTitle}</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">
                  {formatDate(entry.tripStartDate)} - {formatDate(entry.tripEndDate)}
                </p>
                
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-300">Budget:</span>
                    <span className="font-medium">{formatCurrency(entry.overallBudget, entry.currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-300">Spent:</span>
                    <span className="font-medium">{formatCurrency(entry.totalSpent, entry.currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-300">Remaining:</span>
                    <span className={`font-medium ${entry.remainingBudget >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(entry.remainingBudget, entry.currency)}
                    </span>
                  </div>
                </div>
                
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => loadCostEntryForEditing(entry.id)}
                    className="flex-1 px-3 py-2 bg-blue-500 text-white rounded-sm text-sm hover:bg-blue-600"
                  >
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Create/Edit form
  return (
    <div className="space-y-8 text-gray-900 dark:text-gray-100">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">
          {mode === 'edit' ? 'Edit Cost Tracker' : 'Create New Cost Tracker'}
        </h2>
        <button
          onClick={() => {
            setMode('list');
            setCostData({
              id: '',
              tripId: '',
              tripTitle: '',
              tripStartDate: '',
              tripEndDate: '',
              overallBudget: 0,
              currency: 'EUR',
              countryBudgets: [],
              expenses: [],
              customCategories: [...EXPENSE_CATEGORIES],
              createdAt: '',
            });
            setSelectedTrip(null);
            setCostSummary(null);
          }}
          className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
        >
          ← Back to List
        </button>
      </div>

      {/* Trip Selection */}
      {mode === 'create' && !selectedTrip && (
        <div>
          <h3 className="text-xl font-semibold mb-4">Select a Trip</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {existingTrips.map((trip) => (
              <div key={trip.id} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                   onClick={() => handleTripSelection(trip)}>
                <h4 className="font-semibold">{trip.title}</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400">{trip.description}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  {formatDate(trip.startDate)} - {formatDate(trip.endDate)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Budget Setup */}
      {(selectedTrip || mode === 'edit') && (
        <>
          <div>
            <h3 className="text-xl font-semibold mb-4">Budget Setup</h3>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-md mb-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="overall-budget" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Overall Budget</label>
                  <input
                    id="overall-budget"
                    type="number"
                    value={costData.overallBudget || ''}
                    onChange={(e) => setCostData(prev => ({ ...prev, overallBudget: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    placeholder="5000"
                  />
                </div>
                <div>
                  <label htmlFor="currency-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Currency</label>
                  <select
                    id="currency-select"
                    value={costData.currency}
                    onChange={(e) => setCostData(prev => ({ ...prev, currency: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  >
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                    <option value="GBP">GBP</option>
                    <option value="CAD">CAD</option>
                    <option value="AUD">AUD</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Trip</label>
                  <input
                    type="text"
                    value={costData.tripTitle}
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                  />
                </div>
              </div>
            </div>

            {/* Country Budgets */}
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
                    onChange={(e) => setCurrentBudget(prev => ({ ...prev, amount: e.target.value ? parseFloat(e.target.value) : undefined }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    placeholder="1000 (leave empty for undefined budget)"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                  <input
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
                        setCurrentBudget({ country: '', amount: undefined, notes: '' });
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
                              setCurrentPeriod({ startDate: '', endDate: '', notes: '' });
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
                                const start = new Date(period.startDate);
                                const end = new Date(period.endDate);
                                return total + Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1;
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
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
                      <input
                        type="date"
                        value={currentPeriod.startDate || ''}
                        onChange={(e) => setCurrentPeriod(prev => ({ ...prev, startDate: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date</label>
                      <input
                        type="date"
                        value={currentPeriod.endDate || ''}
                        onChange={(e) => setCurrentPeriod(prev => ({ ...prev, endDate: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes (optional)</label>
                      <input
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
          </div>

          {/* Category Management */}
          <div>
            <h3 className="text-xl font-semibold mb-4">Expense Categories</h3>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-md mb-4">
              <h4 className="font-medium mb-3">Manage Categories</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {editingCategoryIndex !== null ? 'Edit Category' : 'Add New Category'}
                  </label>
                  <input
                    type="text"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    placeholder="e.g., Local Transport, Souvenirs"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <button
                    onClick={addCategory}
                    className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600"
                  >
                    {editingCategoryIndex !== null ? 'Update' : 'Add'} Category
                  </button>
                  {editingCategoryIndex !== null && (
                    <button
                      onClick={cancelCategoryEdit}
                      className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>

              {/* Category List */}
              {getCategories().length > 0 && (
                <div>
                  <h5 className="font-medium mb-3">Categories ({getCategories().length})</h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {getCategories().map((category, index) => (
                      <div key={category} className="flex justify-between items-center bg-white dark:bg-gray-800 p-3 rounded-sm border dark:border-gray-700">
                        <span className="font-medium text-sm">{category}</span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => editCategory(index)}
                            className="text-blue-500 hover:text-blue-700 text-xs"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteCategory(index)}
                            className="text-red-500 hover:text-red-700 text-xs"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Expense Tracking */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">Expense Tracking</h3>
              {mode === 'edit' && (
                <div className="flex gap-2">
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
              )}
            </div>
            
            {/* React 19 Actions-powered Expense Form */}
            <ExpenseForm
              currentExpense={currentExpense}
              setCurrentExpense={setCurrentExpense}
              onExpenseAdded={handleExpenseAdded}
              editingExpenseIndex={editingExpenseIndex}
              setEditingExpenseIndex={setEditingExpenseIndex}
              currency={costData.currency}
              categories={getCategories()}
              countryOptions={getExistingCountries()}
            />

            {/* Expense List */}
            {costData.expenses.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Expenses ({costData.expenses.length})</h4>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                                  {costData.expenses
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map((expense) => (
                  <div key={expense.id} className="bg-white dark:bg-gray-800 p-3 rounded-sm border dark:border-gray-700">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{expense.description}</span>
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            {formatCurrency(expense.amount, expense.currency)}
                          </span>
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          {formatDate(expense.date)} • {expense.category}
                          {expense.isGeneralExpense ? ' • General' : ` • ${expense.country}`}
                          {(expense.expenseType === 'planned' || isPostTripExpense(expense)) && (
                            <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
                              expense.expenseType === 'planned' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' : 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
                            }`}>
                              {expense.expenseType === 'planned' ? 'Planned' : 'Post-Trip'}
                            </span>
                          )}
                        </div>
                        {expense.notes && (
                          <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">{expense.notes}</div>
                        )}
                        {expense.travelReference && (
                          <div className="mt-2">
                            <TravelLinkDisplay 
                              travelReference={expense.travelReference} 
                              showRemoveButton={true}
                              onRemove={() => removeTravelLink(expense.id)}
                            />
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => editExpense(expense.id)}
                          className="text-blue-500 hover:text-blue-700 text-sm"
                        >
                          Edit
                        </button>
                        {expense.expenseType === 'planned' && (
                          <button
                            onClick={() => convertPlannedToActual(expense.id)}
                            className="text-green-500 hover:text-green-700 text-sm"
                          >
                            Mark Actual
                          </button>
                        )}
                        <button
                          onClick={() => deleteExpense(expense.id)}
                          className="text-red-500 hover:text-red-700 text-sm"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                </div>
              </div>
            )}
          </div>

          {/* Cost Summary */}
          {costSummary && (
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
                    For remaining {costSummary.remainingDays} days
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
                  <h4 className="font-medium text-gray-800 dark:text-gray-200">Days Remaining</h4>
                  <p className="text-lg font-bold text-gray-600 dark:text-gray-300">
                    {costSummary.remainingDays}
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
                          {costSummary.tripStatus === 'before' ? 'Planned trip spending' : 
                           costSummary.tripStatus === 'during' ? 'Spent so far' : 'Total trip spending'}
                        </p>
                      </div>
                    )}
                    
                    {costSummary.postTripSpent !== 0 && (
                      <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-lg">
                        <h4 className="font-medium text-amber-800 dark:text-amber-200">Post-Trip</h4>
                        <p className="text-lg font-bold text-amber-600 dark:text-amber-300">
                          {(() => {
                            const refundDisplay = formatCurrencyWithRefunds(costSummary.postTripSpent, costSummary.postTripRefunds, costData.currency);
                            return refundDisplay.displayText;
                          })()}
                        </p>
                        <p className="text-xs text-amber-600 dark:text-amber-300 mt-1">
                          After trip ended
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Pie Charts Analysis */}
              {costSummary.countryBreakdown.some(c => c.spentAmount > 0) && (
                <CostPieCharts costSummary={costSummary} currency={costData.currency} />
              )}

              {/* Country Breakdown */}
              {costSummary.countryBreakdown.length > 0 && (
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
                              {country.budgetAmount === 0 ? 'Not set' : formatCurrency(country.budgetAmount, costData.currency)}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-600 dark:text-gray-300">Spent:</span>
                            <span className="font-medium ml-2">
                              {(() => {
                                const netSpent = country.spentAmount - country.refundAmount;
                                const refundDisplay = formatCurrencyWithRefunds(netSpent, country.refundAmount, costData.currency);
                                return refundDisplay.displayText;
                              })()}
                            </span>
                            {country.refundAmount > 0 && (
                              <div className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                                *Includes {formatCurrency(country.refundAmount, costData.currency)} of refunds
                              </div>
                            )}
                          </div>
                          <div>
                            {(() => {
                              const avgDisplay = getCountryAverageDisplay(country, costSummary.tripStatus, costData.currency);
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
                                    const refundDisplay = formatCurrencyWithRefunds(netPlanned, country.plannedRefunds, costData.currency);
                                    return refundDisplay.displayText;
                                  })()}
                                </span>
                                {country.plannedRefunds > 0 && (
                                  <div className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                                    *Includes {formatCurrency(country.plannedRefunds, costData.currency)} expected refunds
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
                                    const refundDisplay = formatCurrencyWithRefunds(netPostTrip, country.postTripRefunds, costData.currency);
                                    return refundDisplay.displayText;
                                  })()}
                                </span>
                                {country.postTripRefunds > 0 && (
                                  <div className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                                    *Includes {formatCurrency(country.postTripRefunds, costData.currency)} of refunds
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
                              {formatCurrency(country.availableForPlanning, costData.currency)}
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
                                        return `${formatCurrency(category.amount, costData.currency)}*`;
                                      } else {
                                        return formatCurrency(category.amount, costData.currency);
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
              )}
            </div>
          )}

          {/* Save Button */}
          <div className="flex justify-end items-center gap-4">
            {autoSaving && (
              <span className="text-sm text-gray-600">
                💾 Auto-saving...
              </span>
            )}
            <button
              onClick={saveCostData}
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
          costData={costData}
          onImportComplete={handleYnabImportComplete}
          onClose={() => setShowYnabImport(false)}
        />
      )}
      
      {/* YNAB Mapping Manager Modal */}
      {showYnabMappings && (
        <YnabMappingManager
          costData={costData}
          onSave={handleYnabMappingsSave}
          onClose={() => setShowYnabMappings(false)}
        />
      )}
    </div>
  );
} 