'use client';

import { useEffect, useMemo, useState } from 'react';
import { CostTrackingData, Expense } from '../../../types';
import { TravelLinkInfo } from '../../../lib/expenseTravelLookup';
import ExpenseForm from '../ExpenseForm';
import InPlaceEditor from '../InPlaceEditor';
import ExpenseDisplay from '../ExpenseDisplay';
import ExpenseInlineEditor from '../ExpenseInlineEditor';
import TravelLinkDisplay from '../TravelLinkDisplay';
import TravelItemSelector from '../TravelItemSelector';
import { ExpenseTravelLookup } from '../../../lib/expenseTravelLookup';
import {
  useExpenseLinks,
  useLinkExpense,
  useMoveExpenseLink
} from '../../../hooks/useExpenseLinks';
import CashTransactionManager from './CashTransactionManager';
import {
  getAllocationsForSource,
  isCashAllocation,
  isCashSource,
  restoreAllocationOnSource
} from '../../../lib/cashTransactions';

interface ExpenseManagerProps {
  costData: CostTrackingData;
  setCostData: React.Dispatch<React.SetStateAction<CostTrackingData>>;
  currentExpense: Partial<Expense>;
  setCurrentExpense: React.Dispatch<React.SetStateAction<Partial<Expense>>>;
  editingExpenseIndex: number | null;
  setEditingExpenseIndex: React.Dispatch<React.SetStateAction<number | null>>;
  getCategories: () => string[];
  getExistingCountries: () => string[];
  travelLookup: ExpenseTravelLookup | null;
  onExpenseAdded: (expense: Expense, travelLinkInfo?: TravelLinkInfo) => Promise<void>;
  setHasUnsavedChanges: React.Dispatch<React.SetStateAction<boolean>>;
  tripId: string;
}

export default function ExpenseManager({
  costData,
  setCostData,
  currentExpense,
  setCurrentExpense,
  editingExpenseIndex,
  setEditingExpenseIndex,
  getCategories,
  getExistingCountries,
  travelLookup,
  onExpenseAdded,
  setHasUnsavedChanges,
  tripId,
}: ExpenseManagerProps) {

  const categories = getCategories();
  const countryOptions = getExistingCountries();

  const [isBulkLinkMode, setIsBulkLinkMode] = useState(false);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<string[]>([]);
  const [bulkTravelLink, setBulkTravelLink] = useState<TravelLinkInfo | undefined>(undefined);
  const [isApplyingBulk, setIsApplyingBulk] = useState(false);
  const [bulkFeedback, setBulkFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const { expenseLinks, isLoading: expenseLinksLoading, mutate: mutateExpenseLinks } = useExpenseLinks(tripId);
  const { trigger: linkExpense, isMutating: isLinkingExpense } = useLinkExpense();
  const { trigger: moveExpenseLink, isMutating: isMovingExpenseLink } = useMoveExpenseLink();

  // Keep selections in sync if expenses change (e.g., deletion)
  useEffect(() => {
    if (!isBulkLinkMode) return;
    setSelectedExpenseIds(prev => prev.filter(id => costData.expenses.some(expense => expense.id === id)));
  }, [costData.expenses, isBulkLinkMode]);

  const allExpenseIds = useMemo(() => costData.expenses.map(expense => expense.id), [costData.expenses]);

  const bulkOperationInFlight = isApplyingBulk || isLinkingExpense || isMovingExpenseLink;

  const toggleBulkLinkMode = () => {
    setIsBulkLinkMode(prev => {
      if (prev) {
        setSelectedExpenseIds([]);
        setBulkTravelLink(undefined);
        setBulkFeedback(null);
      }
      return !prev;
    });
  };

  const toggleSelectAll = () => {
    setSelectedExpenseIds(prev => (prev.length === allExpenseIds.length ? [] : [...allExpenseIds]));
  };

  const handleExpenseSelection = (expenseId: string) => {
    setSelectedExpenseIds(prev =>
      prev.includes(expenseId)
        ? prev.filter(id => id !== expenseId)
        : [...prev, expenseId]
    );
  };

  const handleBulkApply = async () => {
    if (!bulkTravelLink || selectedExpenseIds.length === 0 || !tripId) {
      setBulkFeedback({ type: 'error', message: 'Select at least one expense and a travel item before saving.' });
      return;
    }

    if (expenseLinksLoading) {
      setBulkFeedback({ type: 'error', message: 'Please wait for expense link data to finish loading.' });
      return;
    }

    setIsApplyingBulk(true);
    setBulkFeedback(null);

    const selectionSnapshot = [...selectedExpenseIds];

    try {
      const description = bulkTravelLink.name || undefined;

      for (const expenseId of selectionSnapshot) {
        const existingLink = expenseLinks.find(link => link.expenseId === expenseId);

        if (existingLink) {
          if (existingLink.travelItemId === bulkTravelLink.id) {
            continue; // Already linked to the desired item
          }

          await moveExpenseLink({
            tripId,
            expenseId,
            fromTravelItemId: existingLink.travelItemId,
            toTravelItemId: bulkTravelLink.id,
            toTravelItemType: bulkTravelLink.type,
            description,
          });
        } else {
          await linkExpense({
            tripId,
            expenseId,
            travelItemId: bulkTravelLink.id,
            travelItemType: bulkTravelLink.type,
            description,
          });
        }
      }

      setCostData(prev => ({
        ...prev,
        expenses: prev.expenses.map(expense => {
          if (!selectionSnapshot.includes(expense.id)) {
            return expense;
          }

          return {
            ...expense,
            travelReference: {
              type: bulkTravelLink.type,
              description,
              locationId: bulkTravelLink.type === 'location' ? bulkTravelLink.id : undefined,
              accommodationId: bulkTravelLink.type === 'accommodation' ? bulkTravelLink.id : undefined,
              routeId: bulkTravelLink.type === 'route' ? bulkTravelLink.id : undefined,
            },
          };
        }),
      }));

      setHasUnsavedChanges(true);
      setSelectedExpenseIds([]);
      await mutateExpenseLinks();

      setBulkFeedback({
        type: 'success',
        message: `Linked ${selectionSnapshot.length} expense${selectionSnapshot.length > 1 ? 's' : ''} to the selected travel item.`,
      });
    } catch (error) {
      console.error('Error linking expenses in bulk:', error);
      setBulkFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to update expense links.',
      });
    } finally {
      setIsApplyingBulk(false);
    }
  };

  const deleteExpense = (expenseId: string) => {
    const expense = costData.expenses.find(item => item.id === expenseId);
    if (!expense) {
      return;
    }

    if (isCashAllocation(expense)) {
      const parentId = expense.cashTransaction.parentExpenseId;
      const parentExpense = costData.expenses.find(item => item.id === parentId);

      if (!parentExpense || !isCashSource(parentExpense)) {
        alert('Unable to locate the cash transaction this spending belongs to. Please refresh the page.');
        return;
      }

      const updatedParent = restoreAllocationOnSource(parentExpense, expense.cashTransaction, expense.id);

      const updatedExpenses = costData.expenses
        .filter(item => item.id !== expenseId)
        .map(item => (item.id === parentId ? updatedParent : item));

      setCostData(prev => ({ ...prev, expenses: updatedExpenses }));
      setHasUnsavedChanges(true);
      setSelectedExpenseIds(prev => prev.filter(id => id !== expenseId));
      return;
    }

    if (isCashSource(expense)) {
      const linkedAllocations = getAllocationsForSource(costData.expenses, expense.id);
      if (linkedAllocations.length > 0) {
        const confirmation = confirm(
          `This cash transaction has ${linkedAllocations.length} linked cash spending entr${
            linkedAllocations.length === 1 ? 'y' : 'ies'
          }. Deleting it will also remove those expenses.\n\nDo you want to continue?`
        );
        if (!confirmation) {
          return;
        }
      }

      const removalIds = new Set<string>([expense.id, ...linkedAllocations.map(allocation => allocation.id)]);
      const updatedExpenses = costData.expenses.filter(item => !removalIds.has(item.id));

      setCostData(prev => ({ ...prev, expenses: updatedExpenses }));
      setHasUnsavedChanges(true);
      setSelectedExpenseIds(prev => prev.filter(id => !removalIds.has(id)));
      return;
    }

    const updatedExpenses = costData.expenses.filter(item => item.id !== expenseId);
    setCostData(prev => ({ ...prev, expenses: updatedExpenses }));
    setHasUnsavedChanges(true);
    setSelectedExpenseIds(prev => prev.filter(id => id !== expenseId));
  };

  const convertPlannedToActual = (expenseId: string) => {
    const updatedExpenses = costData.expenses.map(expense => {
      if (expense.cashTransaction) {
        return expense;
      }
      if (expense.id === expenseId && expense.expenseType === 'planned') {
        return {
          ...expense,
          expenseType: 'actual' as const,
          originalPlannedId: expense.id // Keep reference to original planned expense
        };
      }
      return expense;
    });
    setCostData(prev => ({ ...prev, expenses: updatedExpenses }));
    setHasUnsavedChanges(true);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold">Expense Tracking</h3>
        <div className="flex items-center gap-2">
          {isBulkLinkMode && (
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {selectedExpenseIds.length} selected
            </span>
          )}
          <button
            type="button"
            onClick={toggleBulkLinkMode}
            className="px-3 py-1 text-sm rounded border border-blue-500 text-blue-600 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-500/10"
          >
            {isBulkLinkMode ? 'Exit Bulk Link' : 'Bulk Link Travel Item'}
          </button>
        </div>
      </div>

      <div className="mb-6">
        <CashTransactionManager
          costData={costData}
          currency={costData.currency}
          categories={categories}
          countryOptions={countryOptions}
          tripId={tripId}
          onExpenseAdded={onExpenseAdded}
        />
      </div>

      <ExpenseForm
        currentExpense={currentExpense}
        setCurrentExpense={setCurrentExpense}
        onExpenseAdded={onExpenseAdded}
        editingExpenseIndex={editingExpenseIndex}
        setEditingExpenseIndex={setEditingExpenseIndex}
        currency={costData.currency}
        categories={categories}
        countryOptions={countryOptions}
        travelLookup={travelLookup}
        tripId={tripId}
      />

      {isBulkLinkMode && (
        <div className="mb-4 rounded-md border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              {selectedExpenseIds.length === allExpenseIds.length ? 'Clear Selection' : 'Select All'}
            </button>
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Choose a travel item to apply to all selected expenses.
            </span>
          </div>

          <TravelItemSelector
            expenseId="bulk-selector"
            tripId={tripId}
            onReferenceChange={(link) => setBulkTravelLink(link)}
            initialValue={bulkTravelLink}
            className="bg-white dark:bg-gray-800 p-3 rounded border border-blue-100 dark:border-blue-700"
          />

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleBulkApply}
              disabled={bulkOperationInFlight || expenseLinksLoading || !bulkTravelLink || selectedExpenseIds.length === 0}
              className="px-4 py-2 bg-green-500 text-white text-sm rounded disabled:opacity-60"
            >
              {bulkOperationInFlight ? 'Saving...' : 'Save Links'}
            </button>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {bulkTravelLink ? 'Selected travel item ready to link.' : 'Select a travel item to enable saving.'}
            </span>
          </div>

          {bulkFeedback && (
            <div
              className={`text-sm ${
                bulkFeedback.type === 'success'
                  ? 'text-green-700 dark:text-green-300'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {bulkFeedback.message}
            </div>
          )}
        </div>
      )}

      {costData.expenses.length > 0 && (
        <div>
          <h4 className="font-medium mb-2">Expenses ({costData.expenses.length})</h4>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {costData.expenses
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .map((expense) => (
              <div key={expense.id} className={isBulkLinkMode ? 'flex gap-3 items-start' : ''}>
                {isBulkLinkMode && (
                  <div className="pt-2">
                    <input
                      type="checkbox"
                      checked={selectedExpenseIds.includes(expense.id)}
                      onChange={() => handleExpenseSelection(expense.id)}
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                    />
                  </div>
                )}
                <div className="flex-1">
                  <InPlaceEditor<Expense>
                    data={expense}
                    onSave={async (updatedExpense) => {
                      const updatedExpenses = [...costData.expenses];
                      const expenseIndex = updatedExpenses.findIndex(e => e.id === expense.id);
                      if (expenseIndex !== -1) {
                        updatedExpenses[expenseIndex] = updatedExpense;
                        setCostData(prev => ({ ...prev, expenses: updatedExpenses }));
                        setHasUnsavedChanges(true);
                      }
                    }}
                    editor={(expense, onSave, onCancel) => (
                      <ExpenseInlineEditor
                        expense={expense}
                        onSave={onSave}
                        onCancel={onCancel}
                        currency={costData.currency}
                        categories={getCategories()}
                        countryOptions={getExistingCountries()}
                        travelLookup={travelLookup}
                        tripId={tripId}
                      />
                    )}
                  >
                    {(expense, _isEditing, onEdit) => (
                      <div>
                        <ExpenseDisplay
                          expense={expense}
                          onEdit={onEdit}
                          onDelete={() => deleteExpense(expense.id)}
                          onMarkActual={() => convertPlannedToActual(expense.id)}
                          showMarkActual={expense.expenseType === 'planned'}
                        />
                        
                        {travelLookup && (() => {
                          const travelLink = travelLookup.getTravelLinkForExpense(expense.id);
                          if (travelLink) {
                            return (
                              <div className="mt-2">
                                <TravelLinkDisplay travelLinkInfo={travelLink} />
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    )}
                  </InPlaceEditor>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
