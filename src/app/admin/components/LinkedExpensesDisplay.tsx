'use client';

import { formatCurrency, formatDate } from '../../lib/costUtils';
import { useExpenseLinks } from '../../hooks/useExpenseLinks';
import { useExpenses } from '../../hooks/useExpenses';
import { CostTrackingData } from '../../types';
import { ExpenseTravelLookup } from '../../lib/expenseTravelLookup';

interface LinkedExpensesDisplayProps {
  // New: support multiple items
  items?: Array<{ itemType: 'location' | 'accommodation' | 'route'; itemId: string; itemName?: string }>;
  // Backward compatibility
  itemId?: string;
  itemType?: 'location' | 'accommodation' | 'route';
  itemName?: string;
  className?: string;
  // Legacy props - kept for backward compatibility but not used
  travelLookup?: ExpenseTravelLookup | null;
  costData?: CostTrackingData | null;
  // Required: trip ID for fetching data
  tripId: string;
}

export default function LinkedExpensesDisplay({
  items,
  itemId,
  itemType,
  className = '',
  tripId
}: LinkedExpensesDisplayProps) {
  // Use our new SWR hooks for real-time data
  const { expenseLinks, isLoading: linksLoading } = useExpenseLinks(tripId);
  const { expenses, isLoading: expensesLoading } = useExpenses(tripId);

  const isLoading = linksLoading || expensesLoading;

  // Get the travel item IDs we're interested in
  const targetItems = items?.length ? items : (itemId && itemType ? [{ itemType, itemId }] : []);

  // Filter expense links for our target items
  const relevantLinks = expenseLinks.filter(link => 
    targetItems.some(item => item.itemId === link.travelItemId && item.itemType === link.travelItemType)
  );

  // Get the linked expenses
  const linkedExpenses = expenses
    .filter(expense => relevantLinks.some(link => link.expenseId === expense.id))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (isLoading) {
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