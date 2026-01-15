'use client';

import { useState, useEffect } from 'react';
import TravelItemSelector from './TravelItemSelector';
import MultiRouteLinkManager from './MultiRouteLinkManager';
import AriaSelect from './AriaSelect';
import { Expense, ExpenseType } from '@/app/types';
import { TravelLinkInfo, ExpenseTravelLookup } from '@/app/lib/expenseTravelLookup';
import { useMultiRouteLinks } from '@/app/hooks/useMultiRouteLinks';
import { CASH_CATEGORY_NAME, generateId } from '@/app/lib/costUtils';
import AccessibleDatePicker from './AccessibleDatePicker';


interface ExpenseFormProps {
  currentExpense: Partial<Expense>;
  setCurrentExpense: React.Dispatch<React.SetStateAction<Partial<Expense>>>;
  onExpenseAdded: (expense: Expense, travelLinkInfo?: TravelLinkInfo | TravelLinkInfo[]) => void;
  editingExpenseIndex: number | null;
  setEditingExpenseIndex: (index: number | null) => void;
  currency: string;
  categories: string[];
  countryOptions: string[];
  travelLookup: ExpenseTravelLookup | null;
  tripId: string;
}

export default function ExpenseForm({
  currentExpense,
  setCurrentExpense,
  onExpenseAdded,
  editingExpenseIndex,
  setEditingExpenseIndex,
  currency,
  categories,
  countryOptions,
  travelLookup,
  tripId
}: ExpenseFormProps) {
  const [selectedTravelLinkInfo, setSelectedTravelLinkInfo] = useState<TravelLinkInfo | undefined>(undefined);
  const [useMultiLink, setUseMultiLink] = useState(false);
  const [multiLinks, setMultiLinks] = useState<TravelLinkInfo[]>([]);
  const { error: linkError, saveLinks } = useMultiRouteLinks();
  const selectableCategories = categories.includes(CASH_CATEGORY_NAME)
    ? ((editingExpenseIndex !== null && currentExpense.category === CASH_CATEGORY_NAME)
        ? categories
        : categories.filter(category => category !== CASH_CATEGORY_NAME))
    : categories;

  // Load existing travel link(s) when editing an expense
  useEffect(() => {
    let abortController: AbortController | null = null;

    if (editingExpenseIndex !== null && currentExpense.id && tripId) {
      abortController = new AbortController();

      const loadLinks = async () => {
        try {
          const response = await fetch(`/api/travel-data/${tripId}/expense-links`, {
            signal: abortController!.signal
          });

          if (!response.ok) {
            throw new Error(`Failed to load expense links: ${response.statusText}`);
          }

          const links = await response.json();
          const expenseLinks = links.filter((link: { expenseId: string }) => link.expenseId === currentExpense.id);

          if (expenseLinks.length > 1) {
            setUseMultiLink(true);
            setMultiLinks(expenseLinks.map((link: { travelItemId: string; travelItemType: 'location' | 'accommodation' | 'route'; travelItemName: string; splitMode?: 'equal' | 'percentage' | 'fixed'; splitValue?: number }) => ({
              id: link.travelItemId,
              type: link.travelItemType,
              name: link.travelItemName,
              splitMode: link.splitMode,
              splitValue: link.splitValue
            })));
          } else if (expenseLinks.length === 1) {
            setUseMultiLink(false);
            setSelectedTravelLinkInfo({
              id: expenseLinks[0].travelItemId,
              type: expenseLinks[0].travelItemType,
              name: expenseLinks[0].travelItemName,
              splitMode: expenseLinks[0].splitMode,
              splitValue: expenseLinks[0].splitValue
            });
          } else {
            setUseMultiLink(false);
            setSelectedTravelLinkInfo(undefined);
            setMultiLinks([]);
          }
        } catch (error) {
          if (error instanceof Error && error.name !== 'AbortError') {
            console.error('Error loading existing travel link:', error);
            setUseMultiLink(false);
            setSelectedTravelLinkInfo(undefined);
            setMultiLinks([]);
          }
        }
      };

      loadLinks();
    } else {
      setUseMultiLink(false);
      setSelectedTravelLinkInfo(undefined);
      setMultiLinks([]);
    }

    return () => {
      if (abortController) {
        abortController.abort();
      }
    };
  }, [editingExpenseIndex, currentExpense.id, tripId]);

  // React 19 Action for adding/updating expenses
  async function submitExpenseAction(formData: FormData) {
    try {
      const data = Object.fromEntries(formData);
      
      // Convert form data to expense object
      const expense: Expense = {
        id: editingExpenseIndex !== null ? currentExpense.id! : generateId(),
        date: new Date(data.date as string),
        amount: parseFloat(data.amount as string),
        currency: data.currency as string || currency,
        category: data.category as string,
        country: data.country as string || '',
        description: data.description as string || '',
        notes: data.notes as string || '',
        isGeneralExpense: data.isGeneralExpense === 'on',
        expenseType: (data.expenseType as ExpenseType) || 'actual'
      };

      // Validate required fields
      if (!expense.date || !expense.amount || expense.amount === 0 || !expense.category) {
        const missing = [];
        if (!expense.date) missing.push('Date');
        if (!expense.amount || expense.amount === 0) missing.push('Amount (cannot be zero, use negative for refunds)');
        if (!expense.category) missing.push('Category');
        throw new Error(`Please fill in the following required fields: ${missing.join(', ')}`);
      }

      // Save expense with backward-compatible single-link parameter
      // (undefined in multi-link mode; actual multi-links saved separately below)
      onExpenseAdded(expense, selectedTravelLinkInfo);

      // Save expense links if needed (multi-link mode)
      if (expense.id && tripId) {
        const linksToSave = useMultiLink ? multiLinks : selectedTravelLinkInfo;

        if (linksToSave && (Array.isArray(linksToSave) ? linksToSave.length > 0 : true)) {
          const linkSuccess = await saveLinks({
            expenseId: expense.id,
            tripId,
            links: linksToSave
          });
          if (!linkSuccess) {
            // linkError state is set by the hook and displayed below
            // Don't reference it here as it may be stale due to async state updates
            throw new Error('Failed to save expense links. Please check the error message below and try again.');
          }
        }
      }
      
      // Reset form state first
      if (editingExpenseIndex !== null) {
        setEditingExpenseIndex(null);
      }
      
      // Reset form data
      setUseMultiLink(false);
      setMultiLinks([]);
      setCurrentExpense({
        date: new Date(),
        amount: 0,
        currency: currency,
        category: '',
        country: '',
        description: '',
        notes: '',
        isGeneralExpense: false,
        expenseType: 'actual',
        travelReference: selectedTravelLinkInfo && !useMultiLink ? {
          type: selectedTravelLinkInfo.type,
          locationId: selectedTravelLinkInfo.type === 'location' ? selectedTravelLinkInfo.id : undefined,
          accommodationId: selectedTravelLinkInfo.type === 'accommodation' ? selectedTravelLinkInfo.id : undefined,
          routeId: selectedTravelLinkInfo.type === 'route' ? selectedTravelLinkInfo.id : undefined,
          description: selectedTravelLinkInfo.name,
        } : undefined
      });
      
    } catch (error) {
      console.error('Error submitting expense:', error);
      throw error; // Re-throw to show error to user
    }
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg" data-testid="expense-form">
      <h4 className="font-medium mb-3">
        {editingExpenseIndex !== null ? 'Edit Expense' : 'Add New Expense'}
      </h4>
      
      <form 
        key={editingExpenseIndex !== null ? `edit-${currentExpense.id}` : 'new'} 
        action={submitExpenseAction} 
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        <div>
          <label htmlFor="expense-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Date *
          </label>
          <AccessibleDatePicker
            id="expense-date"
            name="date"
            required
            className="w-full"
            defaultValue={
              currentExpense.date instanceof Date
                ? currentExpense.date
                : (typeof currentExpense.date === 'string' && currentExpense.date)
                  ? new Date(currentExpense.date)
                  : null
            }
          />
        </div>

        <div>
          <label htmlFor="expense-amount" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Amount * (use negative for refunds)
          </label>
          <input
            id="expense-amount"
            name="amount"
            type="number"
            step="0.01"
            defaultValue={currentExpense.amount || ''}
            required
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
          />
        </div>

        <div>
          <label htmlFor="expense-currency" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Currency
          </label>
          <AriaSelect
            id="expense-currency"
            name="currency"
            defaultValue={currentExpense.currency || currency}
            options={[
              { value: 'EUR', label: 'EUR' },
              { value: 'USD', label: 'USD' },
              { value: 'GBP', label: 'GBP' }
            ]}
            placeholder="Select Currency"
          />
        </div>

        <div>
          <label htmlFor="expense-category" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Category *
          </label>
          <AriaSelect
            id="expense-category"
            name="category"
            defaultValue={currentExpense.category || ''}
            required
            options={selectableCategories.map(cat => ({ value: cat, label: cat }))}
            placeholder="Select Category"
          />
          {categories.includes(CASH_CATEGORY_NAME) && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Cash exchanges are managed from the cash handling section above.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="expense-country" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Country
          </label>
          <AriaSelect
            id="expense-country"
            name="country"
            defaultValue={currentExpense.country || ''}
            options={countryOptions.map(country => ({ value: country, label: country }))}
            placeholder="General/Multiple Countries"
          />
        </div>

        <div>
          <label htmlFor="expense-type" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Expense Type
          </label>
          <AriaSelect
            id="expense-type"
            name="expenseType"
            defaultValue={currentExpense.expenseType || 'actual'}
            options={[
              { value: 'actual', label: 'Actual' },
              { value: 'planned', label: 'Planned' }
            ]}
            placeholder="Select Type"
          />
        </div>

        <div className="md:col-span-2">
          <label htmlFor="expense-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Description
          </label>
          <input
            id="expense-description"
            name="description"
            type="text"
            defaultValue={currentExpense.description || ''}
            placeholder="e.g., Lunch at restaurant"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
          />
        </div>

        <div className="md:col-span-2">
          <label htmlFor="expense-notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Notes
          </label>
          <textarea
            id="expense-notes"
            name="notes"
            defaultValue={currentExpense.notes || ''}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
          />
        </div>

        <div className="md:col-span-2">
          <label className="flex items-center">
            <input
              type="checkbox"
              name="isGeneralExpense"
              defaultChecked={currentExpense.isGeneralExpense || false}
              className="mr-2"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              This is a general expense (not tied to a specific country)
            </span>
          </label>
        </div>

        <div className="md:col-span-2">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={useMultiLink}
              onChange={(e) => {
                setUseMultiLink(e.target.checked);
                if (e.target.checked) {
                  setSelectedTravelLinkInfo(undefined);
                } else {
                  setMultiLinks([]);
                }
              }}
              className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Link to multiple routes (split cost)
            </span>
          </label>
        </div>

        <div className="md:col-span-2">
          {useMultiLink ? (
            <MultiRouteLinkManager
              expenseId={currentExpense.id ?? 'new-expense'}
              tripId={tripId}
              expenseAmount={currentExpense.amount || 0}
              expenseCurrency={currentExpense.currency || currency}
              transactionDate={currentExpense.date}
              initialLinks={multiLinks}
              onLinksChange={setMultiLinks}
            />
          ) : (
            <TravelItemSelector
              expenseId={currentExpense.id ?? 'new-expense'}
              tripId={tripId}
              travelLookup={travelLookup}
              transactionDate={currentExpense.date}
              initialValue={selectedTravelLinkInfo}
              onReferenceChange={(travelLinkInfo) => {
                setSelectedTravelLinkInfo(travelLinkInfo);
                setCurrentExpense(prev => ({
                  ...prev,
                  travelReference: travelLinkInfo ? {
                    type: travelLinkInfo.type,
                    locationId: travelLinkInfo.type === 'location' ? travelLinkInfo.id : undefined,
                    accommodationId: travelLinkInfo.type === 'accommodation' ? travelLinkInfo.id : undefined,
                    routeId: travelLinkInfo.type === 'route' ? travelLinkInfo.id : undefined,
                    description: travelLinkInfo.name,
                  } : undefined,
                }));
              }}
            />
          )}

          {linkError && (
            <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
              <p className="text-sm text-red-600 dark:text-red-400">
                Error saving links: {linkError}
              </p>
            </div>
          )}
        </div>

        <div className="md:col-span-2 flex gap-2">
          <button
            type="submit"
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {editingExpenseIndex !== null ? 'Update Expense' : 'Add Expense'}
          </button>
          
          {editingExpenseIndex !== null && (
            <button
              type="button"
              onClick={() => {
                setEditingExpenseIndex(null);
                setCurrentExpense({
                  date: new Date(),
                  amount: 0,
                  currency: currency,
                  category: '',
                  country: '',
                  description: '',
                  notes: '',
                  isGeneralExpense: false,
                  expenseType: 'actual',
                  travelReference: undefined
                });
              }}
              className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              Cancel Edit
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
