'use client';

import React from 'react';
import { Location } from '@/app/types';
import { CostTrackingData } from '@/app/types';
import { ExpenseTravelLookup } from '@/app/lib/expenseTravelLookup';
import LocationAccommodationsManager from '../../../../components/LocationAccommodationsManager';
import AccommodationDisplay from '../../../../../components/AccommodationDisplay';
import LinkedExpensesDisplay from '../../../../components/LinkedExpensesDisplay';
import InPlaceEditor from '../../../../components/InPlaceEditor';
import LocationDisplay from '../../../../components/LocationDisplay';
import LocationInlineEditor from '../../../../components/LocationInlineEditor';

interface LocationItemProps {
  location: Location;
  tripId: string;
  travelLookup: ExpenseTravelLookup | null;
  costData: CostTrackingData | null;
  onLocationUpdate: (updatedLocation: Location) => void;
  onLocationDelete: () => void;
  onViewPosts: () => void;
  onGeocode: (locationName: string) => Promise<[number, number]>;
}

export default function LocationItem({
  location,
  tripId,
  travelLookup,
  costData,
  onLocationUpdate,
  onLocationDelete,
  onViewPosts,
  onGeocode,
}: LocationItemProps) {
  const handleAccommodationIdsChange = (newIds: string[]) => {
    const updatedLocation = { ...location, accommodationIds: newIds };
    onLocationUpdate(updatedLocation);
  };

  return (
    <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 bg-white dark:bg-gray-800 hover:shadow-md transition-shadow">
      <InPlaceEditor<Location>
        data={location}
        onSave={async (updatedLocation) => {
          onLocationUpdate(updatedLocation);
        }}
        editor={(location, onSave, onCancel) => (
          <LocationInlineEditor
            location={location}
            onSave={onSave}
            onCancel={onCancel}
            onGeocode={async (locationName) => {
              const coords = await onGeocode(locationName);
              return coords;
            }}
            tripId={tripId}
            travelLookup={travelLookup}
            costData={costData}
          />
        )}
      >
        {(location, _isEditing, onEdit) => (
          <div>
            <LocationDisplay
              location={location}
              onEdit={onEdit}
              onDelete={onLocationDelete}
              onViewPosts={onViewPosts}
              showAccommodations={false}
              linkedExpenses={[]}
            />
            
            {/* Accommodation Display */}
            {/* Show accommodations using the new system if available, otherwise fallback to legacy */}
            {location.accommodationIds && location.accommodationIds.length > 0 ? (
              <div className="mt-3">
                <LocationAccommodationsManager
                  tripId={tripId}
                  locationId={location.id}
                  locationName={location.name}
                  accommodationIds={location.accommodationIds}
                  onAccommodationIdsChange={handleAccommodationIdsChange}
                  travelLookup={travelLookup}
                  costData={costData}
                  displayMode={true} // Read-only display mode
                />
              </div>
            ) : location.accommodationData && (
              <div className="mt-3">
                <AccommodationDisplay
                  accommodationData={location.accommodationData}
                  isAccommodationPublic={location.isAccommodationPublic}
                  privacyOptions={{ isAdminView: true }}
                  className="text-sm"
                  travelLookup={travelLookup}
                  costData={costData}
                />
              </div>
            )}
            
            {/* Linked Expenses Display */}
            {travelLookup && costData && (
              <LinkedExpensesDisplay
                items={[
                  { itemType: 'location', itemId: location.id },
                  ...((location.accommodationIds || []).map((accId: string) => ({ itemType: 'accommodation', itemId: accId })) as { itemType: 'accommodation', itemId: string }[])
                ]}
                travelLookup={travelLookup}
                costData={costData}
                tripId={tripId}
              />
            )}
          </div>
        )}
      </InPlaceEditor>
    </div>
  );
}