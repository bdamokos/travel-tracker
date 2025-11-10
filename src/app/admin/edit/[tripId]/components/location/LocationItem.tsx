'use client';

import React from 'react';
import { Location } from '@/app/types';
import { CostTrackingData } from '@/app/types';
import { ExpenseTravelLookup } from '@/app/lib/expenseTravelLookup';
import { formatUtcDate } from '@/app/lib/dateUtils';
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
  isCollapsed: boolean;
  onToggleCollapse: (isOpen: boolean) => void;
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
  isCollapsed,
  onToggleCollapse,
}: LocationItemProps) {
  const handleAccommodationIdsChange = (newIds: string[]) => {
    const updatedLocation = { ...location, accommodationIds: newIds };
    onLocationUpdate(updatedLocation);
  };

  const formatDate = (date: string | Date) =>
    formatUtcDate(date, 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });

  const getDateRangeLabel = () => {
    if (location.endDate) {
      return `${formatDate(location.date)} - ${formatDate(location.endDate)}`;
    }

    return formatDate(location.date);
  };

  return (
    <details
      open={!isCollapsed}
      onToggle={(event) => onToggleCollapse(event.currentTarget.open)}
      className="border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-shadow"
    >
      <summary className="flex items-center gap-3 cursor-pointer px-4 py-3 select-none [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden="true"
          className={`text-gray-500 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
        >
          ▶
        </span>
        <div className="flex-1 text-left">
          <div className="font-semibold text-gray-900 dark:text-white">{location.name}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">{getDateRangeLabel()}</div>
        </div>
      </summary>

      {!isCollapsed && (
        <div className="border-t border-gray-200 dark:border-gray-700 px-4 pb-4 pt-4">
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
              <div className="space-y-3">
                <LocationDisplay
                  location={location}
                  onEdit={onEdit}
                  onDelete={onLocationDelete}
                  onViewPosts={onViewPosts}
                  showAccommodations={false}
                  linkedExpenses={[]}
                  tripId={tripId}
                  frameless
                  showHeader={false}
                />

                {/* Accommodation Display */}
                {/* Show accommodations using the new system if available, otherwise fallback to legacy */}
                {location.accommodationIds && location.accommodationIds.length > 0 ? (
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
      )}
    </details>
  );
}