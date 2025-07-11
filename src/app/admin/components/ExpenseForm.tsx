'use client';

import { useState } from 'react';
import TravelItemSelector from './TravelItemSelector';
import AriaSelect from './AriaSelect';
import { Expense, ExpenseType } from '../../types';
import { TravelLinkInfo, ExpenseTravelLookup } from '@/app/lib/expenseTravelLookup';
import { generateId } from '@/app/lib/costUtils';


interface ExpenseFormProps {
  currentExpense: Partial<Expense>;
  setCurrentExpense: (expense: Partial<Expense>) => void;
  onExpenseAdded: (expense: Expense, travelLinkInfo?: TravelLinkInfo) => void;
  editingExpenseIndex: number | null;
  setEditingExpenseIndex: (index: number | null) => void;
  currency: string;
  categories: string[];
  countryOptions: string[];
  travelLookup: ExpenseTravelLookup | null;
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
  travelLookup
}: ExpenseFormProps) {
  const [selectedTravelLinkInfo, setSelectedTravelLinkInfo] = useState<TravelLinkInfo | undefined>(undefined);

  // React 19 Action for adding/updating expenses
  async function submitExpenseAction(formData: FormData) {
    try {
      const data = Object.fromEntries(formData);
      
      // Convert form data to expense object
      const expense: Expense = {
        id: editingExpenseIndex !== null ? currentExpense.id! : generateId(),
        date: data.date as string,
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

      // Call the parent handler
      onExpenseAdded(expense, selectedTravelLinkInfo);
      
      // Reset form state first
      if (editingExpenseIndex !== null) {
        setEditingExpenseIndex(null);
      }
      
      // Reset form data
      setCurrentExpense({
        date: '',
        amount: 0,
        currency: currency,
        category: '',
        country: '',
        description: '',
        notes: '',
        isGeneralExpense: false,
        expenseType: 'actual'
      });
      setSelectedTravelLinkInfo(undefined);
      
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
          <input
            id="expense-date"
            name="date"
            type="date"
            defaultValue={currentExpense.date || ''}
            required
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
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
            options={categories.map(cat => ({ value: cat, label: cat }))}
            placeholder="Select Category"
          />
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
          <TravelItemSelector
            expenseId={currentExpense.id!}
            travelLookup={travelLookup}
            onReferenceChange={(travelLinkInfo) => {
              setSelectedTravelLinkInfo(travelLinkInfo);
              setCurrentExpense({
                ...currentExpense,
                travelReference: travelLinkInfo ? {
                  type: travelLinkInfo.type,
                  locationId: travelLinkInfo.type === 'location' ? travelLinkInfo.id : undefined,
                  accommodationId: travelLinkInfo.type === 'accommodation' ? travelLinkInfo.id : undefined,
                  routeId: travelLinkInfo.type === 'route' ? travelLinkInfo.id : undefined,
                  description: travelLinkInfo.name,
                } : undefined,
              });
            }}
          />
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
                  date: '',
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
                setSelectedTravelLinkInfo(undefined);
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