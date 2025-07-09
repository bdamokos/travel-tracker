'use client';

import { useState, useEffect } from 'react';
import { formatCurrency, formatDate } from '../../lib/costUtils';
import { Expense, CostTrackingData } from '../../types';
import { ExpenseTravelLookup } from '../../lib/expenseTravelLookup';

interface LinkedExpensesDisplayProps {
  // New: support multiple items
  items?: Array<{ itemType: 'location' | 'accommodation' | 'route'; itemId: string; itemName?: string }>;
  // Backward compatibility
  itemId?: string;
  itemType?: 'location' | 'accommodation' | 'route';
  itemName?: string;
  className?: string;
  travelLookup: ExpenseTravelLookup | null;
  costData: CostTrackingData | null;
}

export default function LinkedExpensesDisplay({
  items,
  itemId,
  itemType,
  className = '',
  travelLookup,
  costData
}: LinkedExpensesDisplayProps) {
  const [linkedExpenses, setLinkedExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!travelLookup || !costData) {
      setLoading(false);
      return;
    }

    async function loadLinkedExpenses() {
      try {
        if (!travelLookup || !costData) {
          setLinkedExpenses([]);
          return;
        }
        // New: support multiple items
        let expenseIds: string[] = [];
        if (items && items.length > 0) {
          for (const item of items) {
            const ids = travelLookup.getExpensesForTravelItem(item.itemType, item.itemId);
            expenseIds.push(...ids);
          }
        } else if (itemType && itemId) {
          expenseIds = travelLookup.getExpensesForTravelItem(itemType, itemId);
        }
        // Deduplicate
        expenseIds = Array.from(new Set(expenseIds));
        const expenses = costData.expenses.filter(exp => expenseIds.includes(exp.id));
        // Sort by date
        expenses.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        setLinkedExpenses(expenses);
      } catch (error) {
        console.error('Error loading linked expenses:', error);
      } finally {
        setLoading(false);
      }
    }
    loadLinkedExpenses();
  }, [items, itemId, itemType, travelLookup, costData]);

  if (loading) {
    return (
      <div className={`text-xs text-gray-500 dark:text-gray-400 ${className}`}>
        Loading linked expenses...
      </div>
    );
  }

  if (linkedExpenses.length === 0) {
    return null;
  }

  const totalAmount = linkedExpenses.reduce((sum, expense) => {
    // Convert all to EUR for simplicity (in a real app, you'd want proper currency conversion)
    return sum + expense.amount;
  }, 0);

  return (
    <div className={`mt-2 ${className}`}>
      <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
        💰 Linked Expenses ({linkedExpenses.length})
      </div>
      <div className="space-y-1">
        {linkedExpenses.map(expense => (
          <div key={expense.id} className="flex items-center justify-between text-xs bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 px-2 py-1 rounded">
            <div className="flex items-center gap-2">
              <span>{expense.description}</span>
              
            </div>
            <div className="flex items-center gap-2">
              <span>{formatCurrency(expense.amount, expense.currency)}</span>
              <span className="text-gray-500 dark:text-gray-400">{formatDate(expense.date)}</span>
            </div>
          </div>
        ))}
        {linkedExpenses.length > 1 && (
          <div className="flex justify-end text-xs font-medium text-green-700 dark:text-green-300 pt-1 border-t border-green-200 dark:border-green-800">
            Total: {formatCurrency(totalAmount, 'EUR')}
          </div>
        )}
      </div>
    </div>
  );
}