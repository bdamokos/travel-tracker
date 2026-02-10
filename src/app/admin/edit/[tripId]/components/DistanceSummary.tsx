'use client';

import { useMemo } from 'react';
import { TravelRoute, TransportationType } from '@/app/types';
import { transportationConfig } from '@/app/lib/routeUtils';
import { calculateDistance } from '@/app/services/geocoding';
import { normalizeUtcDateToLocalDay } from '@/app/lib/dateUtils';

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

/**
 * Sums distances between consecutive coordinate points
 * @param points - Array of [lat, lng] coordinate pairs representing a route path
 * @returns Total distance in kilometers by summing each segment
 */
function calculateDistanceFromPoints(points: [number, number][]): number {
  if (points.length < 2) return 0;

  return points.reduce((total, point, index) => {
    if (index === 0) return total;
    return total + calculateDistance(points[index - 1], point);
  }, 0);
}

/**
 * Calculates the distance for a single route segment
 * Prefers distanceOverride if provided, then routePoints, then endpoint calculation
 * @param segment - TravelRouteSegment containing route data
 * @returns Distance in kilometers, doubled if doubleDistance flag is set
 */
function getSegmentDistance(segment: TravelRoute): number {
  let distance = 0;
  const overrideDistance = segment.distanceOverride;

  if (typeof overrideDistance === 'number' && Number.isFinite(overrideDistance)) {
    distance = overrideDistance;
  } else if (segment.routePoints && segment.routePoints.length >= 2) {
    distance = calculateDistanceFromPoints(segment.routePoints);
  } else if (segment.fromCoords && segment.toCoords) {
    distance = calculateDistance(segment.fromCoords, segment.toCoords);
  }

  // Double the distance if the segment has doubleDistance flag set
  return segment.doubleDistance ? distance * 2 : distance;
}

/**
 * Formats distance value for display
 * @param distance - Distance in kilometers
 * @returns Formatted string with "km" suffix (e.g., "100 km" or "99.9 km")
 */
function formatDistance(distance: number): string {
  if (distance >= 100) {
    return Math.round(distance).toLocaleString() + ' km';
  }
  return distance.toFixed(1) + ' km';
}

/**
 * Check if a route (or its sub-routes) contains only future dates
 * Routes on today's date are considered past/in-progress, not future.
 */
function isFutureRoute(route: TravelRoute, today: Date): boolean {
  const checkRouteDate = (date: Date | string | undefined): boolean => {
    const routeDate = normalizeUtcDateToLocalDay(date);
    return routeDate !== null && routeDate > today;
  };

  if (route.subRoutes && route.subRoutes.length > 0) {
    // A multi-segment route is future only if ALL sub-routes are future
    return route.subRoutes.every(subRoute => checkRouteDate(subRoute.date));
  }
  return checkRouteDate(route.date);
}

/**
 * Check if a route (or its sub-routes) contains only past dates
 * Routes on today's date are considered past (already traveled or in progress)
 */
function isPastRoute(route: TravelRoute, today: Date): boolean {
  const checkRouteDate = (date: Date | string | undefined): boolean => {
    const routeDate = normalizeUtcDateToLocalDay(date);
    return routeDate !== null && routeDate <= today;
  };

  if (route.subRoutes && route.subRoutes.length > 0) {
    // A multi-segment route is past only if ALL sub-routes are past
    return route.subRoutes.every(subRoute => checkRouteDate(subRoute.date));
  }
  return checkRouteDate(route.date);
}

export default function DistanceSummary({ routes }: DistanceSummaryProps) {
  const { pastDistance, futureDistance, distanceByType, pastDistanceByType, futureDistanceByType } = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const byType = new Map<TransportationType, { distance: number; count: number }>();
    const pastByType = new Map<TransportationType, { distance: number; count: number }>();
    const futureByType = new Map<TransportationType, { distance: number; count: number }>();

    let totalPastDistance = 0;
    let totalFutureDistance = 0;

    routes.forEach(route => {
      const isPast = isPastRoute(route, today);
      const isFuture = isFutureRoute(route, today);

      // If route has subRoutes, attribute distance to each subRoute's transport type
      if (route.subRoutes && route.subRoutes.length > 0) {
        route.subRoutes.forEach(subRoute => {
          const distance = getSegmentDistance(subRoute);
          if (distance === 0) return;

          const type = subRoute.transportType;
          const existing = byType.get(type) || { distance: 0, count: 0 };
          byType.set(type, {
            distance: existing.distance + distance,
            count: existing.count + 1,
          });

          // Classify by past/future based on sub-route date
          // Routes on today's date are considered past (already traveled or in progress)
          const subRouteDate = normalizeUtcDateToLocalDay(subRoute.date);
          if (subRouteDate) {
            if (subRouteDate <= today) {
              totalPastDistance += distance;
              const pastExisting = pastByType.get(type) || { distance: 0, count: 0 };
              pastByType.set(type, {
                distance: pastExisting.distance + distance,
                count: pastExisting.count + 1,
              });
            } else {
              totalFutureDistance += distance;
              const futureExisting = futureByType.get(type) || { distance: 0, count: 0 };
              futureByType.set(type, {
                distance: futureExisting.distance + distance,
                count: futureExisting.count + 1,
              });
            }
          }
        });
      } else {
        // For simple routes, use the route's transport type
        const routeDistance = getSegmentDistance(route);
        const type = route.transportType;
        const existing = byType.get(type) || { distance: 0, count: 0 };
        byType.set(type, {
          distance: existing.distance + routeDistance,
          count: existing.count + 1,
        });

        if (isPast) {
          totalPastDistance += routeDistance;
          const pastExisting = pastByType.get(type) || { distance: 0, count: 0 };
          pastByType.set(type, {
            distance: pastExisting.distance + routeDistance,
            count: pastExisting.count + 1,
          });
        } else if (isFuture) {
          totalFutureDistance += routeDistance;
          const futureExisting = futureByType.get(type) || { distance: 0, count: 0 };
          futureByType.set(type, {
            distance: futureExisting.distance + routeDistance,
            count: futureExisting.count + 1,
          });
        }
      }
    });

    const buildDistanceByType = (
      typeMap: Map<TransportationType, { distance: number; count: number }>
    ): DistanceByType[] => {
      return Array.from(typeMap.entries())
        .map(([type, data]) => ({
          type,
          distance: data.distance,
          count: data.count,
          label: transportationConfig[type]?.description || type,
          color: transportationConfig[type]?.color || '#607D8B',
        }))
        .sort((a, b) => b.distance - a.distance);
    };

    return {
      pastDistance: totalPastDistance,
      futureDistance: totalFutureDistance,
      distanceByType: buildDistanceByType(byType),
      pastDistanceByType: buildDistanceByType(pastByType),
      futureDistanceByType: buildDistanceByType(futureByType),
    };
  }, [routes]);

  if (routes.length === 0) {
    return null;
  }

  // Calculate total distance from all routes (not just past + future, which would exclude today's routes)
  const totalDistance = distanceByType.reduce((sum, item) => sum + item.distance, 0);

  // Render a single distance breakdown section
  const renderDistanceBreakdown = (
    title: string,
    distance: number,
    items: DistanceByType[],
    colorClass: string
  ) => (
    <div className={`rounded-lg p-3 border ${colorClass}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {title}
        </div>
        <div className="text-lg font-bold text-gray-900 dark:text-white">
          {formatDistance(distance)}
        </div>
      </div>
      {items.length > 0 && (
        <div className="grid gap-1.5">
          {items.map(({ type, distance, count, label, color }) => (
            <div
              key={type}
              className="flex items-center justify-between bg-white dark:bg-gray-800 rounded px-2 py-1 text-xs"
            >
              <div className="flex items-center gap-1.5">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-gray-700 dark:text-gray-300">
                  {label}
                </span>
                <span className="text-gray-500 dark:text-gray-500 text-[10px]">
                  ({count})
                </span>
              </div>
              <span className="font-medium text-gray-900 dark:text-white">
                {formatDistance(distance)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

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

      {(pastDistance > 0 || futureDistance > 0) && (
        <div className="space-y-3">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
            By route status:
          </div>

          {pastDistance > 0 && renderDistanceBreakdown(
            'Past routes',
            pastDistance,
            pastDistanceByType,
            'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
          )}

          {futureDistance > 0 && renderDistanceBreakdown(
            'Future routes',
            futureDistance,
            futureDistanceByType,
            'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
          )}
        </div>
      )}

      {distanceByType.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
            By transportation type (all routes):
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
