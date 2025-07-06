'use client';

import { Expense, ExpenseType } from '../../types';
import { generateId } from '../../lib/costUtils';

interface ExpenseFormProps {
  currentExpense: Partial<Expense>;
  setCurrentExpense: (expense: Partial<Expense>) => void;
  onExpenseAdded: (expense: Expense) => void;
  editingExpenseIndex: number | null;
  setEditingExpenseIndex: (index: number | null) => void;
  currency: string;
  categories: string[];
  countryOptions: string[];
}

export default function ExpenseForm({
  currentExpense,
  setCurrentExpense,
  onExpenseAdded,
  editingExpenseIndex,
  setEditingExpenseIndex,
  currency,
  categories,
  countryOptions
}: ExpenseFormProps) {
  
  // React 19 Action for adding/updating expenses
  async function submitExpenseAction(formData: FormData) {
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
    onExpenseAdded(expense);
    
    // Reset form
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
    
    if (editingExpenseIndex !== null) {
      setEditingExpenseIndex(null);
    }
  }

  return (
    <div className="bg-gray-50 p-4 rounded-lg" data-testid="expense-form">
      <h4 className="font-medium mb-3">
        {editingExpenseIndex !== null ? 'Edit Expense' : 'Add New Expense'}
      </h4>
      
      <form action={submitExpenseAction} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="expense-date" className="block text-sm font-medium text-gray-700">
            Date *
          </label>
          <input
            id="expense-date"
            name="date"
            type="date"
            defaultValue={currentExpense.date || ''}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="expense-amount" className="block text-sm font-medium text-gray-700">
            Amount * (use negative for refunds)
          </label>
          <input
            id="expense-amount"
            name="amount"
            type="number"
            step="0.01"
            defaultValue={currentExpense.amount || ''}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="expense-currency" className="block text-sm font-medium text-gray-700">
            Currency
          </label>
          <select
            id="expense-currency"
            name="currency"
            defaultValue={currentExpense.currency || currency}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
            <option value="GBP">GBP</option>
          </select>
        </div>

        <div>
          <label htmlFor="expense-category" className="block text-sm font-medium text-gray-700">
            Category *
          </label>
          <select
            id="expense-category"
            name="category"
            defaultValue={currentExpense.category || ''}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select Category</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="expense-country" className="block text-sm font-medium text-gray-700">
            Country
          </label>
          <select
            id="expense-country"
            name="country"
            defaultValue={currentExpense.country || ''}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">General/Multiple Countries</option>
            {countryOptions.map(country => (
              <option key={country} value={country}>{country}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="expense-type" className="block text-sm font-medium text-gray-700">
            Expense Type
          </label>
          <select
            id="expense-type"
            name="expenseType"
            defaultValue={currentExpense.expenseType || 'actual'}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="actual">Actual</option>
            <option value="planned">Planned</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label htmlFor="expense-description" className="block text-sm font-medium text-gray-700">
            Description
          </label>
          <input
            id="expense-description"
            name="description"
            type="text"
            defaultValue={currentExpense.description || ''}
            placeholder="e.g., Lunch at restaurant"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="md:col-span-2">
          <label htmlFor="expense-notes" className="block text-sm font-medium text-gray-700">
            Notes
          </label>
          <textarea
            id="expense-notes"
            name="notes"
            defaultValue={currentExpense.notes || ''}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            <span className="text-sm text-gray-700">
              This is a general expense (not tied to a specific country)
            </span>
          </label>
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
                  expenseType: 'actual'
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