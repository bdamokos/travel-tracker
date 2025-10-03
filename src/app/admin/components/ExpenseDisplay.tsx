'use client';

import React from 'react';
import { Expense } from '../../types';
import { formatUtcDate } from '@/app/lib/dateUtils';

interface ExpenseDisplayProps {
  expense: Expense;
  onEdit: () => void;
  onDelete?: () => void;
  onMarkActual?: () => void;
  showMarkActual?: boolean;
}

export default function ExpenseDisplay({
  expense,
  onEdit,
  onDelete,
  onMarkActual,
  showMarkActual = false
}: ExpenseDisplayProps) {
  const formatDate = (date: string | Date) => {
    return formatUtcDate(date, 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  const getExpenseTypeColor = (type: string) => {
    return type === 'planned' 
      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' 
      : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
  };

  const getAmountColor = (amount: number) => {
    if (amount < 0) {
      return 'text-green-600 dark:text-green-400'; // Refund/income
    }
    return 'text-gray-900 dark:text-white';
  };

  return (
    <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 bg-white dark:bg-gray-800 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold text-gray-900 dark:text-white">
              {expense.description || expense.category}
            </h4>
            <span className={`text-xs px-2 py-1 rounded-full ${getExpenseTypeColor(expense.expenseType)}`}>
              {expense.expenseType}
            </span>
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <span className="font-medium">{expense.category}</span>
            <span className="mx-2">•</span>
            <span>{formatDate(expense.date)}</span>
            {expense.country && (
              <>
                <span className="mx-2">•</span>
                <span>{expense.country}</span>
              </>
            )}
            {expense.isGeneralExpense && (
              <>
                <span className="mx-2">•</span>
                <span className="text-blue-600 dark:text-blue-400">General</span>
              </>
            )}
          </div>
        </div>
        
        {/* Amount */}
        <div className="flex flex-col items-end">
          <span className={`text-lg font-bold ${getAmountColor(expense.amount)}`}>
            {formatAmount(expense.amount, expense.currency)}
          </span>
          
          {/* Action Buttons */}
          <div className="flex gap-2 mt-1">
            {showMarkActual && expense.expenseType === 'planned' && onMarkActual && (
              <button
                onClick={onMarkActual}
                className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-xs font-medium"
              >
                Mark Actual
              </button>
            )}
            <button
              onClick={onEdit}
              className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-xs font-medium"
            >
              Edit
            </button>
            {onDelete && (
              <button
                onClick={onDelete}
                className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-xs font-medium"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="space-y-1">
        {/* Notes */}
        {expense.notes && (
          <div className="text-sm text-gray-700 dark:text-gray-300">
            <span className="font-medium text-gray-600 dark:text-gray-400">Notes:</span> {expense.notes}
          </div>
        )}

        {/* Travel Reference */}
        {expense.travelReference && (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <span className="font-medium">Linked to:</span>
            <span className="ml-1 text-blue-600 dark:text-blue-400">
              {expense.travelReference.type === 'location' && '📍'}
              {expense.travelReference.type === 'accommodation' && '🏨'}
              {expense.travelReference.type === 'route' && '🚗'}
              {' '}
              {expense.travelReference.description}
            </span>
          </div>
        )}

        {/* Amount Note for Refunds */}
        {expense.amount < 0 && (
          <div className="text-xs text-green-600 dark:text-green-400 mt-2">
            💰 This is a refund or income
          </div>
        )}
      </div>
    </div>
  );
}
