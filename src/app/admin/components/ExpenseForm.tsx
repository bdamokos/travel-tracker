'use client';

import TravelItemSelector from './TravelItemSelector';
import MultiRouteLinkManager from './MultiRouteLinkManager';
import AriaSelect from './AriaSelect';
import { Expense, ExpenseType } from '@/app/types';
import { TravelLinkInfo, ExpenseTravelLookup } from '@/app/lib/expenseTravelLookup';
import { useMultiRouteLinks } from '@/app/hooks/useMultiRouteLinks';
import { useLoadExpenseLinks } from '@/app/hooks/useLoadExpenseLinks';
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
  const { error: linkError, saving: linkSaving, saveLinks } = useMultiRouteLinks();

  // Load existing links when editing an expense
  const {
    isLoading: linksLoading,
    error: linksLoadError,
    singleLink: selectedTravelLinkInfo,
    multiLinks,
    isMultiLinkMode: useMultiLink,
    setSingleLink: setSelectedTravelLinkInfo,
    setMultiLinks,
    setIsMultiLinkMode: setUseMultiLink,
    reset: resetLinks
  } = useLoadExpenseLinks(
    currentExpense.id,
    tripId,
    editingExpenseIndex !== null
  );

  const isSubmitting = linkSaving || linksLoading;

  const selectableCategories = categories.includes(CASH_CATEGORY_NAME)
    ? ((editingExpenseIndex !== null && currentExpense.category === CASH_CATEGORY_NAME)
        ? categories
        : categories.filter(category => category !== CASH_CATEGORY_NAME))
    : categories;

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

      // In multi-link mode, save links via hook first, then save expense without link param
      // In single-link mode, pass link to onExpenseAdded which handles it via handleExpenseAdded
      if (useMultiLink && expense.id && tripId && multiLinks.length > 0) {
        // Save expense first (without link param - links handled separately)
        onExpenseAdded(expense, undefined);

        // Then save multi-links via hook
        const result = await saveLinks({
          expenseId: expense.id,
          tripId,
          links: multiLinks
        });
        if (!result.success) {
          throw new Error(result.error || 'Failed to save expense links. Please try again.');
        }
      } else {
        // Single-link mode: let handleExpenseAdded save the link via API
        onExpenseAdded(expense, selectedTravelLinkInfo);
      }
      
      // Reset form state first
      if (editingExpenseIndex !== null) {
        setEditingExpenseIndex(null);
      }

      // Reset form data and link state
      resetLinks();
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

          {(linkError || linksLoadError) && (
            <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
              <p className="text-sm text-red-600 dark:text-red-400">
                {linksLoadError ? `Error loading links: ${linksLoadError}` :
                 `Error saving links: ${linkError}`}
              </p>
            </div>
          )}
        </div>

        <div className="md:col-span-2 flex gap-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {linkSaving ? 'Saving...' : editingExpenseIndex !== null ? 'Update Expense' : 'Add Expense'}
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
