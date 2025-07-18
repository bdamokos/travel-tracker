'use client';

import React from 'react';
import { Location, Transportation, CostTrackingLink } from '@/app/types';
import { CostTrackingData } from '@/app/types';
import { ExpenseTravelLookup } from '@/app/lib/expenseTravelLookup';
import RouteForm from '../../../components/RouteForm';
import LinkedExpensesDisplay from '../../../components/LinkedExpensesDisplay';
import InPlaceEditor from '../../../components/InPlaceEditor';
import RouteDisplay from '../../../components/RouteDisplay';
import RouteInlineEditor from '../../../components/RouteInlineEditor';

// Type for travel routes - matches the interface in useTripEditor
type TravelRoute = {
  id: string;
  from: string;
  to: string;
  fromCoords: [number, number];
  toCoords: [number, number];
  transportType: Transportation['type'];
  date: Date;
  duration?: string;
  notes?: string;
  privateNotes?: string;
  costTrackingLinks?: CostTrackingLink[];
};

interface TravelData {
  id?: string;
  title: string;
  description: string;
  startDate: Date;
  endDate: Date;
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
  travelLookup: ExpenseTravelLookup | null;
  costData: CostTrackingData | null;
  handleRouteAdded: (route: TravelRoute) => Promise<void>;
  geocodeLocation: (locationName: string) => Promise<[number, number]>;
  deleteRoute: (index: number) => void;
  recalculateRoutePoints: (index: number) => void;
  generateMap: () => void;
}

export default function RouteManager({
  travelData,
  setTravelData,
  setHasUnsavedChanges,
  currentRoute,
  setCurrentRoute,
  editingRouteIndex,
  setEditingRouteIndex,
  travelLookup,
  costData,
  handleRouteAdded,
  geocodeLocation,
  deleteRoute,
  recalculateRoutePoints,
  generateMap,
}: RouteManagerProps) {
  return (
    <>
      <div>
        <h3 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Routes</h3>
        
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
          tripId={travelData.id}
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
                        tripId={travelData.id}
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
                        {travelLookup && costData && travelLookup.getExpensesForTravelItem('route', route.id).length > 0 && (
                          <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                            <LinkedExpensesDisplay
                              itemId={route.id}
                              itemType="route"
                              itemName={`${route.from} → ${route.to}`}
                              travelLookup={travelLookup}
                              costData={costData}
                              tripId={travelData.id}
                            />
                          </div>
                        )}
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