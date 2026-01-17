'use client';

import React from 'react';
import { Location, TravelRoute } from '@/app/types';
import RouteForm from '@/app/admin/components/RouteForm';
import LinkedExpensesDisplay from '@/app/admin/components/LinkedExpensesDisplay';
import InPlaceEditor from '@/app/admin/components/InPlaceEditor';
import RouteDisplay from '@/app/admin/components/RouteDisplay';
import RouteInlineEditor from '@/app/admin/components/RouteInlineEditor';
import { useExpenseLinksForTravelItem } from '@/app/hooks/useExpenseLinks';
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
            locationOptions={travelData.locations.map(loc => ({
              name: loc.name,
              coordinates: loc.coordinates
            }))}
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
            <h4 className="font-medium mb-2">Added Routes ({travelData.routes.length})</h4>
            <div className="space-y-4">
              {travelData.routes
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                .map((route, index) => (
                  <div key={route.id}>
                    <InPlaceEditor<TravelRoute>
                      data={route}
                      onSave={async (updatedRoute) => {
                        const updatedRoutes = [...travelData.routes];
                        updatedRoutes[index] = updatedRoute;
                        setTravelData(prev => ({ ...prev, routes: updatedRoutes }));
                        setHasUnsavedChanges(true);
                      }}
                      editor={(route, onSave, onCancel) => (
                        <RouteInlineEditor
                          route={route}
                          onSave={onSave}
                          onCancel={onCancel}
                          locationOptions={travelData.locations.map(loc => ({
                            name: loc.name,
                            coordinates: loc.coordinates
                          }))}
                          onGeocode={async (locationName) => {
                            const coords = await geocodeLocation(locationName);
                            return coords;
                          }}
                          tripId={tripId}
                        />
                      )}
                    >
                      {(route, _isEditing, onEdit) => (
                        <div>
                          <RouteDisplay
                            route={route}
                            onEdit={onEdit}
                            onDelete={() => deleteRoute(index)}
                            onRecalculateRoute={() => recalculateRoutePoints(index)}
                            linkedExpenses={[]}
                          />

                          {/* Linked Expenses Display */}
                          <RouteExpensesDisplay
                            tripId={tripId}
                            routeId={route.id}
                            routeName={`${route.from} → ${route.to}`}
                          />
                        </div>
                      )}
                    </InPlaceEditor>
                  </div>
                ))}
            </div>
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
