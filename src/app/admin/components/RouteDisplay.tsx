'use client';

import React from 'react';
import { Transportation, TravelRoute } from '@/app/types';
import { transportationLabels } from '@/app/lib/routeUtils';
import { formatUtcDate } from '@/app/lib/dateUtils';

interface RouteDisplayProps {
  route: TravelRoute;
  onEdit: () => void;
  onDelete?: () => void;
  onRecalculateRoute?: () => void;
  linkedExpenses?: Array<{ description: string; amount: number; currency: string }>;
}

export default function RouteDisplay({
  route,
  onEdit,
  onDelete,
  onRecalculateRoute,
  linkedExpenses = []
}: RouteDisplayProps) {
  const formatDate = (date: Date) => {
    return formatUtcDate(date, 'en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getTransportIcon = (type: Transportation['type']) => {
    const icons: Record<Transportation['type'], string> = {
      plane: '✈️',
      car: '🚗',
      train: '🚂',
      bus: '🚌',
      shuttle: '🚐',
      ferry: '⛴️',
      boat: '🚢',
      bike: '🚴',
      walk: '🚶',
      metro: '🚇',
      other: '🚙'
    };
    return icons[type] || '🚙';
  };

  const hasValidCoords = (coords: [number, number]) => {
    return coords[0] !== 0 || coords[1] !== 0;
  };

  const hasSubRoutes = (route.subRoutes?.length || 0) > 0;
  const hasManualSegments = route.subRoutes?.some(segment => segment.useManualRoutePoints) || false;

  return (
    <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 bg-white dark:bg-gray-800 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-lg">{getTransportIcon(route.transportType)}</span>
            <h4 className="font-semibold text-gray-900 dark:text-white">
              {route.from} {route.isReturn ? '⇆' : '→'} {route.to}
            </h4>
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            <span>{transportationLabels[route.transportType]}</span>
            <span className="mx-2">•</span>
            <span>{formatDate(route.date)}</span>
            {route.duration && (
              <>
                <span className="mx-2">•</span>
                <span>{route.duration}</span>
              </>
            )}
            {hasSubRoutes && (
              <>
                <span className="mx-2">•</span>
                <span>{route.subRoutes?.length} segments</span>
              </>
            )}
            {route.useManualRoutePoints && (
              <>
                <span className="mx-2">•</span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                  Manual route
                </span>
              </>
            )}
            {hasManualSegments && (
              <>
                <span className="mx-2">•</span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                  Manual segments
                </span>
              </>
            )}
          </div>
        </div>
        
        {/* Action Buttons */}
        <div className="flex gap-2 ml-4">
          <button
            onClick={onEdit}
            className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium"
          >
            Edit
          </button>
          {onRecalculateRoute && (
            <button
              onClick={onRecalculateRoute}
              className="text-green-500 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 text-sm font-medium"
              title="Recalculate route points using OSRM"
            >
              🔄 Route
            </button>
          )}
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

      {/* Route Details */}
      <div className="space-y-2">
        {/* Coordinates */}
        {(hasValidCoords(route.fromCoords) || hasValidCoords(route.toCoords)) && (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <span className="font-medium">Coordinates:</span>
            {hasValidCoords(route.fromCoords) && (
              <span className="ml-1">From: {route.fromCoords[0].toFixed(4)}, {route.fromCoords[1].toFixed(4)}</span>
            )}
            {hasValidCoords(route.toCoords) && (
              <span className="ml-3">To: {route.toCoords[0].toFixed(4)}, {route.toCoords[1].toFixed(4)}</span>
            )}
          </div>
        )}

        {/* Public Notes */}
        {route.notes && (
          <div className="text-sm text-gray-700 dark:text-gray-300">
            <span className="font-medium text-gray-600 dark:text-gray-400">Notes:</span> {route.notes}
          </div>
        )}

        {/* Private Notes */}
        {route.privateNotes && (
          <div className="text-sm text-gray-700 dark:text-gray-300">
            <span className="font-medium text-gray-600 dark:text-gray-400">Private Notes:</span>
            <span className="text-xs bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 px-1 py-0.5 rounded ml-1">Private</span>
            <span className="ml-2">{route.privateNotes}</span>
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
      </div>
    </div>
  );
}
