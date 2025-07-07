'use client';

import React from 'react';
import { parseAccommodationData, PrivacyOptions } from '../lib/privacyUtils';

interface AccommodationDisplayProps {
  accommodationData?: string;
  isAccommodationPublic?: boolean;
  privacyOptions: PrivacyOptions;
  className?: string;
}

export default function AccommodationDisplay({
  accommodationData,
  isAccommodationPublic = false,
  privacyOptions,
  className = ''
}: AccommodationDisplayProps) {
  // Check if accommodation should be displayed based on privacy settings
  const shouldDisplay = privacyOptions.isAdminView || isAccommodationPublic;
  
  if (!accommodationData || !shouldDisplay) {
    return null;
  }

  const parsedData = parseAccommodationData(accommodationData);

  const renderStructuredData = () => {
    if (!parsedData.isStructured || !parsedData.data) {
      return null;
    }

    const data = parsedData.data;
    
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
            <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
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
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <span>📞</span>
              <a href={`tel:${data.phone}`} className="hover:underline">
                {data.phone}
              </a>
            </div>
          )}
          
          {(data.checkin || data.checkout) && (
            <div className="flex gap-4 text-sm text-gray-600 dark:text-gray-400">
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
              <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {data.notes}
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

  return parsedData.isStructured ? renderStructuredData() : renderFreeText();
}