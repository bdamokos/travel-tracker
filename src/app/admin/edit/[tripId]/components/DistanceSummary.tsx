'use client';

import React, { useMemo } from 'react';
import { TravelRoute, TransportationType } from '@/app/types';
import { transportationConfig } from '@/app/lib/routeUtils';
import { calculateDistance } from '@/app/services/geocoding';

interface DistanceSummaryProps {
  routes: TravelRoute[];
}

interface DistanceByType {
  type: TransportationType;
  distance: number;
  count: number;
  label: string;
  color: string;
}

function getRouteDistance(route: TravelRoute): number {
  // If the route has sub-routes, sum them up
  if (route.subRoutes && route.subRoutes.length > 0) {
    return route.subRoutes.reduce((total, subRoute) => {
      if (subRoute.fromCoords && subRoute.toCoords) {
        return total + calculateDistance(subRoute.fromCoords, subRoute.toCoords);
      }
      return total;
    }, 0);
  }

  // Calculate distance from coordinates
  if (route.fromCoords && route.toCoords) {
    return calculateDistance(route.fromCoords, route.toCoords);
  }

  return 0;
}

function formatDistance(distance: number): string {
  if (distance >= 100) {
    return Math.round(distance).toLocaleString() + ' km';
  }
  return distance.toFixed(1) + ' km';
}

export default function DistanceSummary({ routes }: DistanceSummaryProps) {
  const { totalDistance, distanceByType } = useMemo(() => {
    const byType = new Map<TransportationType, { distance: number; count: number }>();

    routes.forEach(route => {
      // If route has subRoutes, attribute distance to each subRoute's transport type
      if (route.subRoutes && route.subRoutes.length > 0) {
        route.subRoutes.forEach(subRoute => {
          if (subRoute.fromCoords && subRoute.toCoords) {
            const distance = calculateDistance(subRoute.fromCoords, subRoute.toCoords);
            const type = subRoute.transportType;
            const existing = byType.get(type) || { distance: 0, count: 0 };
            byType.set(type, {
              distance: existing.distance + distance,
              count: existing.count + 1,
            });
          }
        });
      } else {
        // For simple routes, use the route's transport type
        const distance = getRouteDistance(route);
        const type = route.transportType;
        const existing = byType.get(type) || { distance: 0, count: 0 };
        byType.set(type, {
          distance: existing.distance + distance,
          count: existing.count + 1,
        });
      }
    });

    const distanceByType: DistanceByType[] = Array.from(byType.entries())
      .map(([type, data]) => ({
        type,
        distance: data.distance,
        count: data.count,
        label: transportationConfig[type]?.description || type,
        color: transportationConfig[type]?.color || '#607D8B',
      }))
      .sort((a, b) => b.distance - a.distance);

    const totalDistance = distanceByType.reduce((sum, item) => sum + item.distance, 0);

    return { totalDistance, distanceByType };
  }, [routes]);

  if (routes.length === 0) {
    return null;
  }

  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
      <h4 className="font-medium text-gray-900 dark:text-white mb-3">
        Distance Summary
      </h4>

      <div className="mb-4">
        <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
          {formatDistance(totalDistance)}
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400">
          Total distance across {routes.length} route{routes.length !== 1 ? 's' : ''}
        </div>
      </div>

      {distanceByType.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
            By transportation type:
          </div>
          <div className="grid gap-2">
            {distanceByType.map(({ type, distance, count, label, color }) => (
              <div
                key={type}
                className="flex items-center justify-between bg-white dark:bg-gray-800 rounded px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-gray-700 dark:text-gray-300">
                    {label}
                  </span>
                  <span className="text-gray-500 dark:text-gray-500 text-xs">
                    ({count} route{count !== 1 ? 's' : ''})
                  </span>
                </div>
                <span className="font-medium text-gray-900 dark:text-white">
                  {formatDistance(distance)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
