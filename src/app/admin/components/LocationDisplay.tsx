'use client';

import React from 'react';
import { Location } from '../../types';
import { formatDuration } from '../../lib/durationUtils';

interface LocationDisplayProps {
  location: Location;
  onEdit: () => void;
  onDelete?: () => void;
  onViewPosts?: () => void;
  showAccommodations?: boolean;
  linkedExpenses?: Array<{ description: string; amount: number; currency: string }>;
}

export default function LocationDisplay({
  location,
  onEdit,
  onDelete,
  onViewPosts,
  showAccommodations = false,
  linkedExpenses = []
}: LocationDisplayProps) {
  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const hasCoords = location.coordinates[0] !== 0 || location.coordinates[1] !== 0;

  return (
    <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 bg-white dark:bg-gray-800 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1">
          <h4 className="font-semibold text-gray-900 dark:text-white text-lg">
            {location.name}
          </h4>
          <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {location.endDate ? (
              <span>
                {formatDate(location.date)} - {formatDate(location.endDate)}
                {location.duration && (
                  <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">
                    ({formatDuration(location.duration, location.date, location.endDate)})
                  </span>
                )}
              </span>
            ) : (
              formatDate(location.date)
            )}
          </div>
        </div>
        
        {/* Action Buttons */}
        <div className="flex gap-2 ml-4">
          {onViewPosts && (
            <button
              onClick={onViewPosts}
              className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium"
              title="View/Add Posts"
            >
              Posts ({(location.instagramPosts?.length || 0) + (location.blogPosts?.length || 0)})
            </button>
          )}
          <button
            onClick={onEdit}
            className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium"
          >
            Edit
          </button>
          {onDelete && (
            <button
              onClick={onDelete}
              className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-sm font-medium"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Location Details */}
      <div className="space-y-2">
        {/* Coordinates */}
        {hasCoords && (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <span className="font-medium">Coordinates:</span> {location.coordinates[0].toFixed(4)}, {location.coordinates[1].toFixed(4)}
          </div>
        )}

        {/* Notes */}
        {location.notes && (
          <div className="text-sm text-gray-700 dark:text-gray-300">
            <span className="font-medium text-gray-600 dark:text-gray-400">Notes:</span> {location.notes}
          </div>
        )}

        {/* Arrival/Departure Times */}
        {(location.arrivalTime || location.departureTime) && (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {location.arrivalTime && (
              <span className="mr-4">
                <span className="font-medium">Arrival:</span> {location.arrivalTime}
              </span>
            )}
            {location.departureTime && (
              <span>
                <span className="font-medium">Departure:</span> {location.departureTime}
              </span>
            )}
          </div>
        )}

        {/* Linked Expenses */}
        {linkedExpenses.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Linked Expenses ({linkedExpenses.length})
            </div>
            <div className="space-y-1">
              {linkedExpenses.slice(0, 3).map((expense, index) => (
                <div key={index} className="text-sm text-gray-600 dark:text-gray-400">
                  {expense.description} - {expense.amount} {expense.currency}
                </div>
              ))}
              {linkedExpenses.length > 3 && (
                <div className="text-xs text-gray-500 dark:text-gray-500">
                  +{linkedExpenses.length - 3} more...
                </div>
              )}
            </div>
          </div>
        )}

        {/* Accommodations Info */}
        {showAccommodations && location.accommodationIds && location.accommodationIds.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Accommodations ({location.accommodationIds.length})
            </div>
          </div>
        )}

        {/* Posts Summary */}
        {((location.instagramPosts?.length || 0) + (location.blogPosts?.length || 0)) > 0 && (
          <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-500 pt-2">
            {location.blogPosts && location.blogPosts.length > 0 && (
              <span>📝 {location.blogPosts.length} blog post{location.blogPosts.length !== 1 ? 's' : ''}</span>
            )}
            {location.instagramPosts && location.instagramPosts.length > 0 && (
              <span>📸 {location.instagramPosts.length} Instagram post{location.instagramPosts.length !== 1 ? 's' : ''}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}