'use client';

import { useState, useEffect } from 'react';
import { CostTrackingLink } from '../../types';
import AriaSelect from './AriaSelect';

interface Expense {
  id: string;
  description: string;
  amount: number;
  currency: string;
  date: string;
  category: string;
}

interface CostTrackingLinksManagerProps {
  currentLinks: CostTrackingLink[];
  onLinksChange: (links: CostTrackingLink[]) => void;
  className?: string;
}

export default function CostTrackingLinksManager({
  currentLinks,
  onLinksChange,
  className = ''
}: CostTrackingLinksManagerProps) {
  const [availableExpenses, setAvailableExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExpenseId, setSelectedExpenseId] = useState('');
  const [linkDescription, setLinkDescription] = useState('');

  // Load available expenses
  useEffect(() => {
    async function loadExpenses() {
      try {
        const response = await fetch('/api/cost-tracking/list');
        const costEntries = await response.json();
        
        const allExpenses: Expense[] = [];
        
        // Load detailed data for each cost entry to get expenses
        for (const entry of costEntries) {
          try {
            const detailResponse = await fetch(`/api/cost-tracking?id=${entry.id}`);
            const costData = await detailResponse.json();
            
            if (costData.expenses) {
              costData.expenses.forEach((expense: Expense) => {
                allExpenses.push({
                  id: expense.id,
                  description: expense.description,
                  amount: expense.amount,
                  currency: expense.currency,
                  date: expense.date,
                  category: expense.category
                });
              });
            }
          } catch (error) {
            console.error(`Error loading cost data for ${entry.id}:`, error);
          }
        }
        
        // Sort by date (newest first)
        allExpenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setAvailableExpenses(allExpenses);
      } catch (error) {
        console.error('Error loading expenses:', error);
      } finally {
        setLoading(false);
      }
    }
    
    loadExpenses();
  }, []);

  const handleAddLink = () => {
    if (!selectedExpenseId) return;

    const selectedExpense = availableExpenses.find(e => e.id === selectedExpenseId);
    if (!selectedExpense) return;

    // Check if link already exists
    if (currentLinks.some(link => link.expenseId === selectedExpenseId)) {
      alert('This expense is already linked!');
      return;
    }

    const baseLink = {
      expenseId: selectedExpenseId
    };

    // Only include description if it has a value
    const newLink: CostTrackingLink = linkDescription 
      ? { ...baseLink, description: linkDescription }
      : baseLink;

    onLinksChange([...currentLinks, newLink]);
    setSelectedExpenseId('');
    setLinkDescription('');
  };

  const handleRemoveLink = (expenseId: string) => {
    onLinksChange(currentLinks.filter(link => link.expenseId !== expenseId));
  };

  const getExpenseById = (expenseId: string) => {
    return availableExpenses.find(e => e.id === expenseId);
  };

  if (loading) {
    return (
      <div className={`text-sm text-gray-500 dark:text-gray-400 ${className}`}>
        Loading expenses...
      </div>
    );
  }

  // Filter out already linked expenses
  const availableToLink = availableExpenses.filter(expense => 
    !currentLinks.some(link => link.expenseId === expense.id)
  );

  return (
    <div className={`space-y-3 ${className}`}>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          💰 Linked Expenses
        </label>
        
        {/* Current Links */}
        {currentLinks.length > 0 && (
          <div className="space-y-2 mb-3">
            {currentLinks.map(link => {
              const expense = getExpenseById(link.expenseId);
              if (!expense) return null;
              
              return (
                <div key={link.expenseId} className="flex items-center justify-between bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 px-3 py-2 rounded text-sm">
                  <div>
                    <span className="font-medium">{expense.description}</span>
                    <span className="ml-2 text-green-600 dark:text-green-400">
                      {expense.amount} {expense.currency}
                    </span>
                    {link.description && (
                      <span className="ml-2 text-green-600 dark:text-green-400">
                        • {link.description}
                      </span>
                    )}
                    <div className="text-xs text-green-600 dark:text-green-400">
                      {expense.date} • {expense.category}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveLink(link.expenseId)}
                    className="text-red-500 hover:text-red-700 text-xs ml-2"
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Add New Link */}
        {availableToLink.length > 0 && (
          <div className="border border-gray-300 dark:border-gray-600 rounded p-3 space-y-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Select Expense to Link
              </label>
              <AriaSelect
                id="expense-select"
                value={selectedExpenseId}
                onChange={(value) => setSelectedExpenseId(value)}
                className="w-full px-2 py-1 text-sm"
                options={availableToLink.map(expense => ({
                  value: expense.id,
                  label: `${expense.description} - ${expense.amount} ${expense.currency} (${expense.date})`
                }))}
                placeholder="Choose an expense..."
              />
            </div>

            {selectedExpenseId && (
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Link Description (Optional)
                </label>
                <input
                  type="text"
                  value={linkDescription}
                  onChange={(e) => setLinkDescription(e.target.value)}
                  placeholder="e.g., Hotel booking, Activity fee"
                  className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            )}

            <button
              type="button"
              onClick={handleAddLink}
              disabled={!selectedExpenseId}
              className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Link Expense
            </button>
          </div>
        )}

        {availableToLink.length === 0 && currentLinks.length === 0 && (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            No expenses available to link. Create some expenses in the Cost Tracker first.
          </div>
        )}

        {availableToLink.length === 0 && currentLinks.length > 0 && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            All available expenses are already linked.
          </div>
        )}
      </div>
    </div>
  );
}