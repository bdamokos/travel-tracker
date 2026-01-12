'use client';

import React, { useState, useEffect } from 'react';
import { parseAccommodationData, PrivacyOptions } from '@/app/lib/privacyUtils';
import { ExpenseTravelLookup } from '@/app/lib/expenseTravelLookup';
import { CostTrackingData } from '@/app/types';
import { formatCurrency } from '@/app/lib/costUtils';

interface AccommodationDisplayProps {
  accommodationData?: string;
  isAccommodationPublic?: boolean;
  privacyOptions: PrivacyOptions;
  className?: string;
  travelLookup?: ExpenseTravelLookup | null;
  costData?: CostTrackingData | null;
}

export default function AccommodationDisplay({
  accommodationData,
  isAccommodationPublic = false,
  privacyOptions,
  className = '',
  travelLookup,
  costData
}: AccommodationDisplayProps) {
  const [totalLinkedCost, setTotalLinkedCost] = useState<number | null>(null);
  const [parsedAccommodationData, setParsedAccommodationData] = useState<ReturnType<typeof parseAccommodationData>>({ isStructured: false, data: null, rawText: '' });

  // Effect to parse accommodation data and calculate linked expenses
  useEffect(() => {
    const parsed = parseAccommodationData(accommodationData || '');
    setParsedAccommodationData(parsed);

    if (
      travelLookup &&
      costData &&
      parsed.isStructured &&
      parsed.data &&
      typeof parsed.data === 'object' &&
      'id' in parsed.data
    ) {
      const linkedExpenseIds = travelLookup.getExpensesForTravelItem('accommodation', (parsed.data as { id: string }).id);
      const linkedExpenses = costData.expenses.filter(exp => linkedExpenseIds.includes(exp.id));
      const total = linkedExpenses.reduce((sum, exp) => sum + exp.amount, 0);
      setTotalLinkedCost(total);
    } else {
      setTotalLinkedCost(null);
    }
  }, [travelLookup, costData, accommodationData]);

  const renderStructuredData = () => {
    if (!parsedAccommodationData.isStructured || !parsedAccommodationData.data) {
      return null;
    }

    const data = parsedAccommodationData.data;
    
    return (
      <div className={`space-y-2 ${className}`}>
        <div className="flex items-center gap-2 mb-2">
          <h4 className="font-medium text-gray-900 dark:text-gray-100">🏨 Accommodation</h4>
          {!privacyOptions.isAdminView && (
            <span className="text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-2 py-1 rounded">
              Public
            </span>
          )}
          {privacyOptions.isAdminView && !isAccommodationPublic && (
            <span className="text-xs bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 px-2 py-1 rounded">
              Private
            </span>
          )}
        </div>
        
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
          {data.name && (
            <div className="font-medium text-lg text-gray-900 dark:text-gray-100">
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

          {totalLinkedCost !== null && totalLinkedCost > 0 && (
            <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
              <div className="text-sm text-gray-800 dark:text-gray-100">
                💰 Linked Cost: {formatCurrency(totalLinkedCost, costData?.currency || 'EUR')}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderFreeText = () => {
    return (
      <div className={`space-y-2 ${className}`}>
        <div className="flex items-center gap-2 mb-2">
          <h4 className="font-medium text-gray-900 dark:text-gray-100">🏨 Accommodation</h4>
          {!privacyOptions.isAdminView && (
            <span className="text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-2 py-1 rounded">
              Public
            </span>
          )}
          {privacyOptions.isAdminView && !isAccommodationPublic && (
            <span className="text-xs bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 px-2 py-1 rounded">
              Private
            </span>
          )}
        </div>
        
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
          <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {accommodationData}
          </div>
        </div>
      </div>
    );
  };

  return parsedAccommodationData.isStructured ? renderStructuredData() : renderFreeText();
}