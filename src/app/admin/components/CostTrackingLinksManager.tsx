'use client';

import { useState } from 'react';
import AriaSelect from './AriaSelect';
import { useExpenses } from '../../hooks/useExpenses';
import { 
  useExpenseLinks,
  useExpenseLinksForTravelItem, 
  useLinkExpense, 
  useUnlinkExpense,
  useMoveExpenseLink 
} from '../../hooks/useExpenseLinks';

interface CostTrackingLinksManagerProps {
  tripId: string;
  travelItemId: string;
  travelItemType: 'location' | 'accommodation' | 'route';
  className?: string;
}

export default function CostTrackingLinksManager({
  tripId,
  travelItemId,
  travelItemType,
  className = ''
}: CostTrackingLinksManagerProps) {
  const [selectedExpenseId, setSelectedExpenseId] = useState('');
  const [linkDescription, setLinkDescription] = useState('');

  // SWR hooks for data
  const { expenses, isLoading: expensesLoading } = useExpenses(tripId);
  const { expenseLinks, isLoading: linksLoading, mutate: mutateLinks } = useExpenseLinksForTravelItem(tripId, travelItemId);
  const { mutate: mutateAllLinks } = useExpenseLinks(tripId); // Global mutate for cache invalidation
  
  // SWR mutation hooks
  const { trigger: linkExpense, isMutating: isLinking } = useLinkExpense();
  const { trigger: unlinkExpense, isMutating: isUnlinking } = useUnlinkExpense();
  const { trigger: moveExpenseLink, isMutating: isMoving } = useMoveExpenseLink();

  const isLoading = expensesLoading || linksLoading;
  const isMutating = isLinking || isUnlinking || isMoving;

  const handleAddLink = async () => {
    if (!selectedExpenseId || isMutating) return;

    try {
      const result = await linkExpense({
        tripId,
        expenseId: selectedExpenseId,
        travelItemId,
        travelItemType,
        description: linkDescription || undefined
      });

      // Check if the result indicates a duplicate link
      if (result.error === 'DUPLICATE_LINK' && result.existingLink) {
        const existingLink = result.existingLink;
        const itemTypeLabel = existingLink.travelItemType === 'location' ? 'location' : 
                             existingLink.travelItemType === 'accommodation' ? 'accommodation' : 'route';
        
        const proceed = confirm(
          `⚠️ DUPLICATE LINK WARNING\n\n` +
          `This expense is already linked to:\n` +
          `${itemTypeLabel.toUpperCase()}: "${existingLink.travelItemName}"\n\n` +
          `Do you want to move the link to this ${travelItemType} instead?\n\n` +
          `(This will remove the link from "${existingLink.travelItemName}" and add it here)`
        );
        
        if (proceed) {
          try {
            await moveExpenseLink({
              tripId,
              expenseId: selectedExpenseId,
              fromTravelItemId: existingLink.travelItemId,
              toTravelItemId: travelItemId,
              toTravelItemType: travelItemType,
              description: linkDescription || undefined
            });

            // Success - clear form and refresh data
            setSelectedExpenseId('');
            setLinkDescription('');
            // Invalidate both local and global caches for move operations
            await Promise.all([mutateLinks(), mutateAllLinks()]);
            
          } catch (moveError) {
            console.error('Error moving expense link:', moveError);
            alert(`Failed to move expense link: ${moveError instanceof Error ? moveError.message : 'Unknown error'}`);
          }
        }
        return; // Exit early for duplicate link case
      }

      // Success - no duplicate, link was created
      if (result.success) {
        setSelectedExpenseId('');
        setLinkDescription('');
        // Invalidate both local and global caches
        await Promise.all([mutateLinks(), mutateAllLinks()]);
      }

    } catch (error: unknown) {
      console.error('Error linking expense:', error);
      alert(`Failed to link expense: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleRemoveLink = async (expenseId: string) => {
    if (isMutating) return;

    try {
      await unlinkExpense({
        tripId,
        expenseId,
        travelItemId
      });

      // Invalidate both local and global caches
      await Promise.all([mutateLinks(), mutateAllLinks()]);
      
    } catch (error) {
      console.error('Error unlinking expense:', error);
      alert(`Failed to unlink expense: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const getExpenseById = (expenseId: string) => {
    return expenses.find(e => e.id === expenseId);
  };

  // Filter out expenses that are already linked to this travel item
  const availableToLink = expenses.filter(expense => 
    !expenseLinks.some(link => link.expenseId === expense.id)
  );

  if (isLoading) {
    return (
      <div className={`text-sm text-gray-500 dark:text-gray-400 ${className}`}>
        Loading expenses...
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          💰 Linked Expenses
          {isMutating && (
            <span className="ml-2 text-xs text-blue-500">🔄 Updating...</span>
          )}
        </label>
        
        {/* Current Links */}
        {expenseLinks.length > 0 && (
          <div className="space-y-2 mb-3">
            {expenseLinks.map(link => {
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
                    disabled={isMutating}
                    className="text-red-500 hover:text-red-700 text-xs ml-2 disabled:opacity-50"
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
                className={`w-full px-2 py-1 text-sm ${isMutating ? 'opacity-50 pointer-events-none' : ''}`}
                options={availableToLink.map(expense => {
                  const baseLabel = `${expense.description} - ${expense.amount} ${expense.currency} (${expense.date})`;
                  return {
                    value: expense.id,
                    label: baseLabel
                  };
                })}
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
                  disabled={isMutating}
                  className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
                />
              </div>
            )}

            <button
              type="button"
              onClick={handleAddLink}
              disabled={!selectedExpenseId || isMutating}
              className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {isMutating ? 'Linking...' : 'Link Expense'}
            </button>
          </div>
        )}

        {availableToLink.length === 0 && expenseLinks.length === 0 && (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            No expenses available to link. Create some expenses in the Cost Tracker first.
          </div>
        )}

        {availableToLink.length === 0 && expenseLinks.length > 0 && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            All available expenses are already linked to this {travelItemType}.
          </div>
        )}
      </div>
    </div>
  );
}