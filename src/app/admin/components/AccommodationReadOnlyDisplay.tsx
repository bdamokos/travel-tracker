'use client';

import React from 'react';
import { Accommodation } from '../../types';
import { parseAccommodationData } from '../../lib/privacyUtils';
import { ExpenseTravelLookup } from '../../lib/expenseTravelLookup';
import { CostTrackingData } from '../../types';
import { formatCurrency } from '../../lib/costUtils';

interface AccommodationReadOnlyDisplayProps {
  accommodation: Accommodation;
  travelLookup?: ExpenseTravelLookup | null;
  costData?: CostTrackingData | null;
  className?: string;
}

export default function AccommodationReadOnlyDisplay({
  accommodation,
  travelLookup,
  costData,
  className = ''
}: AccommodationReadOnlyDisplayProps) {
  const parsedData = parseAccommodationData(accommodation.accommodationData || '');
  
  // Calculate linked expenses total
  const linkedExpenseIds = travelLookup?.getExpensesForTravelItem('accommodation', accommodation.id) || [];
  const linkedExpenses = costData?.expenses.filter(exp => linkedExpenseIds.includes(exp.id)) || [];
  const totalLinkedCost = linkedExpenses.reduce((sum, exp) => sum + exp.amount, 0);

  const renderStructuredData = () => {
    if (!parsedData.isStructured || !parsedData.data) {
      return null;
    }

    const data = parsedData.data;
    
    return (
      <div className="space-y-2">
        {data.name && (
          <div className="font-medium text-gray-900 dark:text-gray-100">
            {data.name}
          </div>
        )}
        
        {data.address && (
          <div className="flex items-start gap-2 text-sm text-gray-800 dark:text-gray-200">
            <span>📍</span>
            <span>{data.address}</span>
          </div>
        )}
        
        {data.website && (
          <div className="flex items-center gap-2 text-sm">
            <span>🌐</span>
            <a 
              href={data.website} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline"
            >
              {data.website}
            </a>
          </div>
        )}
        
        {data.phone && (
          <div className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
            <span>📞</span>
            <a href={`tel:${data.phone}`} className="hover:underline">
              {data.phone}
            </a>
          </div>
        )}
        
        {(data.checkin || data.checkout) && (
          <div className="flex gap-4 text-sm text-gray-800 dark:text-gray-200">
            {data.checkin && (
              <div className="flex items-center gap-1">
                <span>⬇️</span>
                <span>Check-in: {data.checkin}</span>
              </div>
            )}
            {data.checkout && (
              <div className="flex items-center gap-1">
                <span>⬆️</span>
                <span>Check-out: {data.checkout}</span>
              </div>
            )}
          </div>
        )}
        
        {data.notes && (
          <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
            <div className="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap">
              {data.notes}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderFreeText = () => {
    return (
      <div className="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap">
        {accommodation.accommodationData}
      </div>
    );
  };

  return (
    <div className={`bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-3 space-y-3 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <h5 className="font-medium text-gray-900 dark:text-gray-100">🏨 {accommodation.name}</h5>
        {!accommodation.isAccommodationPublic && (
          <span className="text-xs bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 px-2 py-1 rounded">
            Private
          </span>
        )}
      </div>
      
      {/* Accommodation Details */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-2">
        {parsedData.isStructured ? renderStructuredData() : renderFreeText()}
      </div>

      {/* Linked Expenses */}
      {totalLinkedCost > 0 && (
        <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
          <div className="text-sm text-gray-700 dark:text-gray-300">
            💰 Linked Expenses: {formatCurrency(totalLinkedCost, costData?.currency || 'EUR')}
            {linkedExpenses.length > 1 && (
              <span className="text-xs text-gray-500 ml-2">({linkedExpenses.length} items)</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}