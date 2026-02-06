'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Location, Transportation, TravelRoute } from '@/app/types';
import RouteForm from '@/app/admin/components/RouteForm';
import LinkedExpensesDisplay from '@/app/admin/components/LinkedExpensesDisplay';
import InPlaceEditor from '@/app/admin/components/InPlaceEditor';
import RouteDisplay from '@/app/admin/components/RouteDisplay';
import RouteInlineEditor from '@/app/admin/components/RouteInlineEditor';
import { useExpenseLinksForTravelItem } from '@/app/hooks/useExpenseLinks';
import { formatUtcDate } from '@/app/lib/dateUtils';
import {
  getCompositeTransportType,
  getMultiSegmentEmoji,
  getTransportIcon,
  transportationLabels,
  transportationTypes
} from '@/app/lib/routeUtils';
import DistanceSummary from './DistanceSummary';

// Component to conditionally show LinkedExpensesDisplay using SWR hook
function RouteExpensesDisplay({ tripId, routeId, routeName }: { tripId: string; routeId: string; routeName: string }) {
  const { expenseLinks, isLoading } = useExpenseLinksForTravelItem(tripId, routeId);

  if (isLoading) {
    return null; // Don't show anything while loading
  }

  if (expenseLinks.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
      <LinkedExpensesDisplay
        itemId={routeId}
        itemType="route"
        itemName={routeName}
        tripId={tripId}
      />
    </div>
  );
}

interface TravelData {
  id?: string;
  title: string;
  description: string;
  startDate: Date;
  endDate: Date;
  instagramUsername?: string;
  locations: Location[];
  routes: TravelRoute[];
}

interface RouteManagerProps {
  travelData: TravelData;
  setTravelData: React.Dispatch<React.SetStateAction<TravelData>>;
  setHasUnsavedChanges: (value: boolean) => void;
  currentRoute: Partial<TravelRoute>;
  setCurrentRoute: React.Dispatch<React.SetStateAction<Partial<TravelRoute>>>;
  editingRouteIndex: number | null;
  setEditingRouteIndex: React.Dispatch<React.SetStateAction<number | null>>;
  handleRouteAdded: (route: TravelRoute) => Promise<void>;
  geocodeLocation: (locationName: string) => Promise<[number, number]>;
  deleteRoute: (index: number) => void;
  recalculateRoutePoints: (index: number) => void;
  generateMap: () => void;
  tripId: string; // Add tripId for expense scoping
}

interface RouteListItem {
  route: TravelRoute;
  originalIndex: number;
  effectiveTransportType: Transportation['type'];
  hasSubRoutes: boolean;
  hasManualRoute: boolean;
  searchableText: string;
}

export default function RouteManager({
  travelData,
  setTravelData,
  setHasUnsavedChanges,
  currentRoute,
  setCurrentRoute,
  editingRouteIndex,
  setEditingRouteIndex,
  handleRouteAdded,
  geocodeLocation,
  deleteRoute,
  recalculateRoutePoints,
  generateMap,
  tripId,
}: RouteManagerProps) {
  const [routeQuery, setRouteQuery] = useState('');
  const [transportFilter, setTransportFilter] = useState<'all' | Transportation['type']>('all');
  const [showSegmentedOnly, setShowSegmentedOnly] = useState(false);
  const [showManualOnly, setShowManualOnly] = useState(false);
  const [collapsedRoutes, setCollapsedRoutes] = useState<Record<string, boolean>>({});

  const locationOptions = useMemo(
    () => travelData.locations.map(loc => ({
      name: loc.name,
      coordinates: loc.coordinates
    })),
    [travelData.locations]
  );

  useEffect(() => {
    setCollapsedRoutes(prev => {
      const next: Record<string, boolean> = {};
      let changed = false;

      travelData.routes.forEach(route => {
        if (Object.prototype.hasOwnProperty.call(prev, route.id)) {
          next[route.id] = prev[route.id];
        } else {
          next[route.id] = true;
          changed = true;
        }
      });

      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (!changed) {
        if (prevKeys.length !== nextKeys.length) {
          changed = true;
        } else if (prevKeys.some(id => !Object.prototype.hasOwnProperty.call(next, id))) {
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [travelData.routes]);

  const sortedRouteItems = useMemo<RouteListItem[]>(
    () =>
      travelData.routes
        .map((route, originalIndex) => {
          const hasSubRoutes = (route.subRoutes?.length || 0) > 0;
          const hasManualRoute = route.useManualRoutePoints
            || (route.subRoutes?.some(segment =>
              segment.useManualRoutePoints && (segment.routePoints?.length || 0) > 0
            ) ?? false);

          const effectiveTransportType = hasSubRoutes
            ? getCompositeTransportType(route.subRoutes ?? [], route.transportType)
            : route.transportType;

          const segmentSearchText = route.subRoutes
            ?.map(segment => `${segment.from} ${segment.to} ${segment.notes || ''} ${segment.privateNotes || ''}`)
            .join(' ') || '';

          const searchableText = `${route.from} ${route.to} ${route.notes || ''} ${route.privateNotes || ''} ${route.duration || ''} ${segmentSearchText}`.toLowerCase();

          return {
            route,
            originalIndex,
            effectiveTransportType,
            hasSubRoutes,
            hasManualRoute,
            searchableText
          };
        })
        .sort((a, b) => new Date(a.route.date).getTime() - new Date(b.route.date).getTime()),
    [travelData.routes]
  );

  const normalizedQuery = routeQuery.trim().toLowerCase();

  const filteredRouteItems = useMemo(
    () =>
      sortedRouteItems.filter(item => {
        if (normalizedQuery && !item.searchableText.includes(normalizedQuery)) {
          return false;
        }

        if (transportFilter !== 'all' && item.effectiveTransportType !== transportFilter) {
          return false;
        }

        if (showSegmentedOnly && !item.hasSubRoutes) {
          return false;
        }

        if (showManualOnly && !item.hasManualRoute) {
          return false;
        }

        return true;
      }),
    [normalizedQuery, showManualOnly, showSegmentedOnly, sortedRouteItems, transportFilter]
  );

  const hasActiveFilters = normalizedQuery.length > 0 || transportFilter !== 'all' || showSegmentedOnly || showManualOnly;

  const expandVisibleRoutes = () => {
    setCollapsedRoutes(prev => {
      const next = { ...prev };
      filteredRouteItems.forEach(item => {
        next[item.route.id] = false;
      });
      return next;
    });
  };

  const collapseVisibleRoutes = () => {
    setCollapsedRoutes(prev => {
      const next = { ...prev };
      filteredRouteItems.forEach(item => {
        next[item.route.id] = true;
      });
      return next;
    });
  };

  const clearFilters = () => {
    setRouteQuery('');
    setTransportFilter('all');
    setShowSegmentedOnly(false);
    setShowManualOnly(false);
  };

  const formatRouteDate = (date: Date | string): string =>
    formatUtcDate(date, 'en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

  const handleRouteCollapseToggle = (routeId: string, isOpen: boolean) => {
    setCollapsedRoutes(prev => {
      const nextValue = !isOpen;
      if (prev[routeId] === nextValue) {
        return prev;
      }
      return { ...prev, [routeId]: nextValue };
    });
  };

  return (
    <>
      <div>
        <h3 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Routes</h3>

        {/* Distance Summary */}
        {travelData.routes.length > 0 && (
          <div className="mb-6">
            <DistanceSummary routes={travelData.routes} />
          </div>
        )}

        {/* Add Route Form Section */}
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600 mb-6">
          <RouteForm
            currentRoute={currentRoute}
            setCurrentRoute={setCurrentRoute}
            onRouteAdded={handleRouteAdded}
            editingRouteIndex={editingRouteIndex}
            setEditingRouteIndex={setEditingRouteIndex}
            locationOptions={locationOptions}
            onGeocode={async (locationName: string) => {
              const coords = await geocodeLocation(locationName);
              return coords;
            }}
            tripId={tripId}
          />
        </div>

        {/* Route List */}
        {travelData.routes.length > 0 && (
          <div>
            <div className="mb-4 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Showing {filteredRouteItems.length} of {travelData.routes.length} routes
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={expandVisibleRoutes}
                    className="px-2.5 py-1 text-xs rounded border border-gray-300 dark:border-gray-500 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    Expand visible
                  </button>
                  <button
                    type="button"
                    onClick={collapseVisibleRoutes}
                    className="px-2.5 py-1 text-xs rounded border border-gray-300 dark:border-gray-500 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    Collapse visible
                  </button>
                  <button
                    type="button"
                    onClick={clearFilters}
                    disabled={!hasActiveFilters}
                    className="px-2.5 py-1 text-xs rounded border border-gray-300 dark:border-gray-500 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Clear filters
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="route-search" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Search
                  </label>
                  <input
                    id="route-search"
                    type="text"
                    value={routeQuery}
                    onChange={(event) => setRouteQuery(event.target.value)}
                    placeholder="From, to, notes, duration, segment..."
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <div>
                  <label htmlFor="route-transport-filter" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Transport type
                  </label>
                  <select
                    id="route-transport-filter"
                    value={transportFilter}
                    onChange={(event) => setTransportFilter(event.target.value as 'all' | Transportation['type'])}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  >
                    <option value="all">All transport types</option>
                    {transportationTypes.map(type => (
                      <option key={type} value={type}>
                        {transportationLabels[type]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <label className="inline-flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={showSegmentedOnly}
                    onChange={(event) => setShowSegmentedOnly(event.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-700"
                  />
                  Segmented routes only
                </label>
                <label className="inline-flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={showManualOnly}
                    onChange={(event) => setShowManualOnly(event.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-700"
                  />
                  Manual GeoJSON only
                </label>
              </div>
            </div>

            <h4 className="font-medium mb-2">Added Routes ({travelData.routes.length})</h4>
            {filteredRouteItems.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 p-4 text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700">
                No routes match the current filters.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredRouteItems.map(({ route, originalIndex }) => (
                  <div key={route.id}>
                    <InPlaceEditor<TravelRoute>
                      data={route}
                      onSave={async (updatedRoute) => {
                        const updatedRoutes = [...travelData.routes];
                        updatedRoutes[originalIndex] = updatedRoute;
                        setTravelData(prev => ({ ...prev, routes: updatedRoutes }));
                        setHasUnsavedChanges(true);
                      }}
                      editor={(routeData, onSave, onCancel) => (
                        <RouteInlineEditor
                          route={routeData}
                          onSave={onSave}
                          onCancel={onCancel}
                          locationOptions={locationOptions}
                          onGeocode={async (locationName) => {
                            const coords = await geocodeLocation(locationName);
                            return coords;
                          }}
                          tripId={tripId}
                        />
                      )}
                    >
                      {(routeData, _isEditing, onEdit) => {
                        const hasSubRoutes = (routeData.subRoutes?.length || 0) > 0;
                        const hasManualRoute = routeData.useManualRoutePoints
                          || (routeData.subRoutes?.some(segment =>
                            segment.useManualRoutePoints && (segment.routePoints?.length || 0) > 0
                          ) ?? false);
                        const effectiveTransportType = hasSubRoutes
                          ? getCompositeTransportType(routeData.subRoutes ?? [], routeData.transportType)
                          : routeData.transportType;
                        const summaryIcon = hasSubRoutes && routeData.subRoutes
                          ? getMultiSegmentEmoji(routeData.subRoutes)
                          : getTransportIcon(routeData.transportType);
                        const isCollapsed = collapsedRoutes[routeData.id] ?? true;

                        return (
                          <details
                            open={!isCollapsed}
                            onToggle={(event) => handleRouteCollapseToggle(routeData.id, event.currentTarget.open)}
                            className="border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-shadow"
                          >
                            <summary className="flex items-center gap-3 cursor-pointer px-4 py-3 select-none [&::-webkit-details-marker]:hidden">
                              <span
                                aria-hidden="true"
                                className={`text-gray-500 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                              >
                                ▶
                              </span>
                              <span className="text-lg" aria-label={transportationLabels[effectiveTransportType]}>
                                {summaryIcon}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold text-gray-900 dark:text-white truncate">
                                  {routeData.from} {routeData.isReturn ? '⇆' : '→'} {routeData.to}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                  {transportationLabels[effectiveTransportType]} • {formatRouteDate(routeData.date)}
                                  {routeData.duration ? ` • ${routeData.duration}` : ''}
                                </div>
                              </div>
                              <div className="hidden sm:flex items-center gap-2">
                                {hasSubRoutes && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                    {routeData.subRoutes?.length} segments
                                  </span>
                                )}
                                {hasManualRoute && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                                    Manual route
                                  </span>
                                )}
                              </div>
                            </summary>

                            {!isCollapsed && (
                              <div className="border-t border-gray-200 dark:border-gray-700 px-4 pb-4 pt-4">
                                <RouteDisplay
                                  route={routeData}
                                  onEdit={onEdit}
                                  onDelete={() => deleteRoute(originalIndex)}
                                  onRecalculateRoute={() => recalculateRoutePoints(originalIndex)}
                                  linkedExpenses={[]}
                                />

                                <RouteExpensesDisplay
                                  tripId={tripId}
                                  routeId={routeData.id}
                                  routeName={`${routeData.from} → ${routeData.to}`}
                                />
                              </div>
                            )}
                          </details>
                        );
                      }}
                    </InPlaceEditor>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Generate Button */}
      <div className="flex justify-end space-x-4">
        <button
          onClick={generateMap}
          disabled={!travelData.title || travelData.locations.length === 0}
          className="px-6 py-3 bg-blue-600 dark:bg-blue-700 text-white rounded-md hover:bg-blue-700 dark:hover:bg-blue-800 disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed font-medium"
        >
          View Travel Map
        </button>
      </div>
    </>
  );
}
