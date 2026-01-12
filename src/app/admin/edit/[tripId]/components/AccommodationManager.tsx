'use client';

import React from 'react';
import { Location, Transportation, CostTrackingLink } from '@/app/types';
import { CostTrackingData } from '@/app/types';
import { ExpenseTravelLookup } from '@/app/lib/expenseTravelLookup';
import LocationAccommodationsManager from '@/app/admin/components/LocationAccommodationsManager';
import AccommodationDisplay from '@/app/components/AccommodationDisplay';

interface TravelRoute {
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

interface AccommodationManagerProps {
  travelData: TravelData;
  setTravelData: React.Dispatch<React.SetStateAction<TravelData>>;
  setHasUnsavedChanges: (value: boolean) => void;
  travelLookup: ExpenseTravelLookup | null;
  costData: CostTrackingData | null;
}

export default function AccommodationManager({
  travelData,
  setTravelData,
  setHasUnsavedChanges,
  travelLookup,
  costData,
}: AccommodationManagerProps) {
  // Get all locations that have accommodations
  const locationsWithAccommodations = travelData.locations.filter(
    location => 
      (location.accommodationIds && location.accommodationIds.length > 0) ||
      location.accommodationData
  );

  if (locationsWithAccommodations.length === 0) {
    return (
      <div>
        <h3 className="text-xl font-semibold mb-4">Accommodations</h3>
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <p>No accommodations added yet.</p>
          <p className="text-sm mt-2">Add accommodations to locations in the Locations section above.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-xl font-semibold mb-4">Accommodations</h3>
      <div className="space-y-6">
        {locationsWithAccommodations.map((location) => {
          const actualIndex = travelData.locations.findIndex(loc => loc.id === location.id);
          
          return (
            <div key={location.id} className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
              <h4 className="font-medium mb-3 text-gray-900 dark:text-white">
                {location.name}
              </h4>
              
              {/* Show accommodations using the new system if available, otherwise fallback to legacy */}
              {location.accommodationIds && location.accommodationIds.length > 0 ? (
                <LocationAccommodationsManager
                  tripId={travelData.id || ''}
                  locationId={location.id}
                  locationName={location.name}
                  accommodationIds={location.accommodationIds}
                  onAccommodationIdsChange={(newIds) => {
                    const updatedLocations = [...travelData.locations];
                    updatedLocations[actualIndex] = { ...location, accommodationIds: newIds };
                    setTravelData(prev => ({ ...prev, locations: updatedLocations }));
                    setHasUnsavedChanges(true);
                  }}
                  travelLookup={travelLookup}
                  costData={costData}
                  displayMode={false} // Full management mode
                />
              ) : location.accommodationData && (
                <AccommodationDisplay
                  accommodationData={location.accommodationData}
                  isAccommodationPublic={location.isAccommodationPublic}
                  privacyOptions={{ isAdminView: true }}
                  className="text-sm"
                  travelLookup={travelLookup}
                  costData={costData}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
