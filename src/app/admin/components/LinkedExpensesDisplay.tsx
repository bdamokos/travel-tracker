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
  // Optional: explicit trip ID for additional validation
  tripId?: string;
}

export default function LinkedExpensesDisplay({
  items,
  itemId,
  itemType,
  className = '',
  travelLookup,
  costData,
  tripId
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
        // VALIDATION: Ensure travelLookup is properly scoped to the current trip
        if (tripId && travelLookup && process.env.NODE_ENV === 'development') {
          // Check if the travel lookup service has any mappings
          const allMappings = travelLookup.getAllTravelLinks();
          console.log(`LinkedExpensesDisplay: TravelLookup has ${allMappings.size} mappings for trip ${tripId}`);
          
          // Validate that all mappings belong to the expected trip
          let crossTripMappings = 0;
          for (const [expenseId, linkInfo] of Array.from(allMappings.entries())) {
            if (linkInfo.tripTitle && costData.tripTitle && linkInfo.tripTitle !== costData.tripTitle) {
              crossTripMappings++;
              console.warn(`LinkedExpensesDisplay: Cross-trip mapping detected - expense ${expenseId} linked to trip "${linkInfo.tripTitle}" but costData is for trip "${costData.tripTitle}"`);
            }
          }
          
          if (crossTripMappings > 0) {
            console.error(`LinkedExpensesDisplay: Found ${crossTripMappings} cross-trip mappings! This indicates a data integrity issue.`);
          }
        }
        
        // Get expense IDs from travel lookup
        let expenseIds: string[] = [];
        if (items && items.length > 0) {
          for (const item of items) {
            const ids = travelLookup.getExpensesForTravelItem(item.itemType, item.itemId);
            expenseIds.push(...ids);
            
            // VALIDATION: Log what we're getting for each item (development only)
            if (process.env.NODE_ENV === 'development') {
              console.log(`LinkedExpensesDisplay: Item ${item.itemType}:${item.itemId} has ${ids.length} linked expenses:`, ids);
            }
          }
        } else if (itemType && itemId) {
          expenseIds = travelLookup.getExpensesForTravelItem(itemType, itemId);
          if (process.env.NODE_ENV === 'development') {
            console.log(`LinkedExpensesDisplay: Item ${itemType}:${itemId} has ${expenseIds.length} linked expenses:`, expenseIds);
          }
        }
        // Deduplicate
        expenseIds = Array.from(new Set(expenseIds));
        
        // STRICT TRIP BOUNDARY VALIDATION
        // First, validate that costData belongs to the expected trip
        if (tripId && costData.tripId && tripId !== costData.tripId) {
          console.warn(`LinkedExpensesDisplay: Trip ID mismatch. Expected: ${tripId}, Got: ${costData.tripId}`);
          setLinkedExpenses([]); // Clear expenses if trip IDs don't match
          return;
        }
        
        // Filter expenses by the expense IDs from travel lookup
        let expenses = costData.expenses.filter(exp => expenseIds.includes(exp.id));
        
        // STRICT WHITELIST VALIDATION: Only show expenses that we can definitively prove belong to this trip
        const expectedTripId = tripId || costData.tripId;
        if (expectedTripId) {
          expenses = expenses.filter(expense => {
            // Validate that this expense is actually linked to a travel item in the current trip
            const travelLink = travelLookup.getTravelLinkForExpense(expense.id);
            
            if (!travelLink) {
              console.warn(`LinkedExpensesDisplay: Expense ${expense.id} has no travel link - excluding from display`);
              return false;
            }
            
            // Validate that the travel link belongs to the expected trip
            if (travelLink.tripTitle && costData.tripTitle && travelLink.tripTitle !== costData.tripTitle) {
              console.warn(`LinkedExpensesDisplay: Expense ${expense.id} belongs to trip "${travelLink.tripTitle}" but we're displaying trip "${costData.tripTitle}" - excluding from display`);
              return false;
            }
            
            return true;
          });
        }
        
        // Debug logging (can be removed in production)
        if (process.env.NODE_ENV === 'development') {
          console.log('LinkedExpensesDisplay Debug:', {
            tripId,
            costDataTripId: costData.tripId,
            expenseIdsFromLookup: expenseIds,
            totalExpensesInCostData: costData.expenses.length,
            expenseIdsInCostData: costData.expenses.map(e => e.id),
            filteredExpenseCount: expenses.length,
            filteredExpenseIds: expenses.map(e => e.id)
          });
        }
        
        // VALIDATION: Log any suspicious activity for debugging
        if (expenses.length > 0 && expenseIds.length > 0) {
          const foundExpenseIds = expenses.map(e => e.id);
          const missingExpenseIds = expenseIds.filter(id => !foundExpenseIds.includes(id));
          if (missingExpenseIds.length > 0) {
            console.warn(`LinkedExpensesDisplay: Some expense IDs from travel lookup not found in costData:`, missingExpenseIds);
          }
        }
        
        // CROSS-TRIP DETECTION: Check if any expenses seem to belong to other trips
        const suspiciousExpenses = expenses.filter((_expense) => {
          // This is a heuristic - if we have tripId and the expense description contains other trip names
          // or if there are other indicators that this expense doesn't belong to this trip
          return false; // For now, trust the data but this could be enhanced
        });
        
        if (suspiciousExpenses.length > 0) {
          console.warn(`LinkedExpensesDisplay: Detected potentially cross-trip expenses:`, suspiciousExpenses);
        }
        
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
  }, [items, itemId, itemType, travelLookup, costData, tripId]);

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