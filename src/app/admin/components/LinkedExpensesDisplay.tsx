'use client';

import { useState, useEffect } from 'react';
import { formatCurrency, formatDate } from '../../lib/costUtils';

interface LinkedExpense {
  id: string;
  description: string;
  amount: number;
  currency: string;
  date: string;
  category: string;
  travelReference: {
    description?: string;
  };
}

interface LinkedExpensesDisplayProps {
  itemId: string;
  itemType: 'location' | 'route';
  itemName: string;
  className?: string;
}

export default function LinkedExpensesDisplay({ 
  itemId, 
  itemType, 
  className = '' 
}: LinkedExpensesDisplayProps) {
  const [linkedExpenses, setLinkedExpenses] = useState<LinkedExpense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadLinkedExpenses() {
      try {
        // Get all cost tracking data
        const response = await fetch('/api/cost-tracking/list');
        const costEntries = await response.json();
        
        const allLinkedExpenses: LinkedExpense[] = [];
        
        // Search through all cost entries for linked expenses
        for (const entry of costEntries) {
          try {
            const detailResponse = await fetch(`/api/cost-tracking?id=${entry.id}`);
            const costData = await detailResponse.json();
            
            if (costData.expenses) {
              costData.expenses.forEach((expense: any) => {
                if (expense.travelReference) {
                  const ref = expense.travelReference;
                  const matchesLocation = itemType === 'location' && ref.locationId === itemId;
                  const matchesRoute = itemType === 'route' && ref.routeId === itemId;
                  
                  if (matchesLocation || matchesRoute) {
                    allLinkedExpenses.push({
                      id: expense.id,
                      description: expense.description,
                      amount: expense.amount,
                      currency: expense.currency,
                      date: expense.date,
                      category: expense.category,
                      travelReference: ref
                    });
                  }
                }
              });
            }
          } catch (error) {
            console.error(`Error loading cost data for ${entry.id}:`, error);
          }
        }
        
        // Sort by date
        allLinkedExpenses.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        setLinkedExpenses(allLinkedExpenses);
      } catch (error) {
        console.error('Error loading linked expenses:', error);
      } finally {
        setLoading(false);
      }
    }
    
    loadLinkedExpenses();
  }, [itemId, itemType]);

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
              {expense.travelReference.description && (
                <span className="text-green-600 dark:text-green-400">
                  • {expense.travelReference.description}
                </span>
              )}
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