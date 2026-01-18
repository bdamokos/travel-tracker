'use client';

import { formatCurrency, formatDate } from '@/app/lib/costUtils';
import { calculateSplitAmount, ExpenseTravelLookup } from '@/app/lib/expenseTravelLookup';
import { useExpenseLinks } from '@/app/hooks/useExpenseLinks';
import { useExpenses } from '@/app/hooks/useExpenses';
import { CostTrackingData } from '@/app/types';

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
  const relevantLinks = (expenseLinks || []).filter(link => 
    targetItems.some(item => item.itemId === link.travelItemId && item.itemType === link.travelItemType)
  );

  const groupLinksByExpenseId = (links: typeof relevantLinks): Map<string, typeof relevantLinks> => {
    return links.reduce((acc, link) => {
      const group = acc.get(link.expenseId) ?? [];
      group.push(link);
      acc.set(link.expenseId, group);
      return acc;
    }, new Map<string, typeof relevantLinks>());
  };

  const allLinksByExpenseId = groupLinksByExpenseId(expenseLinks || []);
  const relevantLinksByExpenseId = groupLinksByExpenseId(relevantLinks);

  // Get the linked expenses
  const linkedExpenses = (expenses || [])
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

  return (
    <div className={`mt-2 ${className}`}>
      <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
        💰 Linked Expenses ({linkedExpenses.length})
      </div>
      <div className="space-y-1">
        {linkedExpenses.map(expense => {
          const allLinksForExpense = allLinksByExpenseId.get(expense.id) || [];
          const relevantForExpense = relevantLinksByExpenseId.get(expense.id) || [];

          const allocatedAmount = relevantForExpense.reduce(
            (sum, link) => sum + calculateSplitAmount(expense.amount, link, allLinksForExpense),
            0
          );

          const isSplit = allLinksForExpense.length > 1;
          const showTotalHint = isSplit && Math.abs(allocatedAmount - expense.amount) > 0.0001;

          const amountTitle = showTotalHint
            ? `${formatCurrency(allocatedAmount, expense.currency)} of ${formatCurrency(expense.amount, expense.currency)}`
            : undefined;

          return (
            <div key={expense.id} className="flex items-center justify-between text-xs bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 px-2 py-1 rounded">
              <div className="flex items-center gap-2">
                <span>{expense.description}</span>
              </div>
              <div className="flex items-center gap-2">
                <span title={amountTitle}>{formatCurrency(allocatedAmount, expense.currency)}</span>
                <span className="text-gray-500 dark:text-gray-400">{formatDate(expense.date)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
