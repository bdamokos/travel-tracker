'use client';

import React from 'react';
import { Location, Transportation, CostTrackingLink } from '@/app/types';
import { CostTrackingData } from '@/app/types';
import { ExpenseTravelLookup } from '@/app/lib/expenseTravelLookup';
import LocationAccommodationsManager from '../../../components/LocationAccommodationsManager';
import LocationForm from '../../../components/LocationForm';
import AccommodationDisplay from '../../../../components/AccommodationDisplay';
import LinkedExpensesDisplay from '../../../components/LinkedExpensesDisplay';
import InPlaceEditor from '../../../components/InPlaceEditor';
import LocationDisplay from '../../../components/LocationDisplay';
import LocationInlineEditor from '../../../components/LocationInlineEditor';
import LocationPosts from './location/LocationPosts';

interface TravelData {
  id?: string;
  title: string;
  description: string;
  startDate: Date;
  endDate: Date;
  locations: Location[];
  routes: TravelRoute[];
}

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

interface LocationManagerProps {
  travelData: TravelData;
  setTravelData: React.Dispatch<React.SetStateAction<TravelData>>;
  setHasUnsavedChanges: (value: boolean) => void;
  currentLocation: Partial<Location>;
  setCurrentLocation: React.Dispatch<React.SetStateAction<Partial<Location>>>;
  editingLocationIndex: number | null;
  setEditingLocationIndex: React.Dispatch<React.SetStateAction<number | null>>;
  selectedLocationForPosts: number | null;
  setSelectedLocationForPosts: React.Dispatch<React.SetStateAction<number | null>>;
  newInstagramPost: Partial<{ url: string; caption: string }>;
  setNewInstagramPost: React.Dispatch<React.SetStateAction<Partial<{ url: string; caption: string }>>>;
  newBlogPost: Partial<{ title: string; url: string; excerpt: string }>;
  setNewBlogPost: React.Dispatch<React.SetStateAction<Partial<{ title: string; url: string; excerpt: string }>>>;
  travelLookup: ExpenseTravelLookup | null;
  costData: CostTrackingData | null;
  handleLocationAdded: (location: Location) => void;
  geocodeLocation: (locationName: string) => Promise<[number, number]>;
  deleteLocation: (index: number) => void;
  addInstagramPost: (index: number) => void;
  addBlogPost: (index: number) => void;
  calculateSmartDurations: (locations: Location[], routes: TravelRoute[]) => Location[];
}

export default function LocationManager({
  travelData,
  setTravelData,
  setHasUnsavedChanges,
  currentLocation,
  setCurrentLocation,
  editingLocationIndex,
  setEditingLocationIndex,
  selectedLocationForPosts,
  setSelectedLocationForPosts,
  newInstagramPost,
  setNewInstagramPost,
  newBlogPost,
  setNewBlogPost,
  travelLookup,
  costData,
  handleLocationAdded,
  geocodeLocation,
  deleteLocation,
  addInstagramPost,
  addBlogPost,
  calculateSmartDurations,
}: LocationManagerProps) {
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold">Locations</h3>
        {travelData.locations.length > 0 && travelData.routes.length > 0 && (
          <button
            onClick={() => {
              const updatedLocations = calculateSmartDurations(travelData.locations, travelData.routes);
              setTravelData(prev => ({ ...prev, locations: updatedLocations }));
              setHasUnsavedChanges(true);
            }}
            className="px-3 py-1 bg-purple-500 dark:bg-purple-600 text-white rounded-sm text-sm hover:bg-purple-600 dark:hover:bg-purple-700"
          >
            🤖 Calculate Durations
          </button>
        )}
      </div>
      <LocationForm
        tripId={travelData.id || ''}
        currentLocation={currentLocation}
        setCurrentLocation={setCurrentLocation}
        onLocationAdded={handleLocationAdded}
        editingLocationIndex={editingLocationIndex}
        setEditingLocationIndex={setEditingLocationIndex}
        onGeocode={async (locationName: string) => {
          const coords = await geocodeLocation(locationName);
          setCurrentLocation(prev => ({ ...prev, coordinates: coords }));
        }}
        travelLookup={travelLookup}
        costData={costData}
      />
      
      {/* Location List */}
      {travelData.locations.length > 0 && (
        <div>
          <h4 className="font-medium mb-2">Added Locations ({travelData.locations.length})</h4>
          <div className="space-y-4">
            {travelData.locations
              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
              .map((location, index) => (
              <div key={location.id}>
                <InPlaceEditor<Location>
                  data={location}
                  onSave={async (updatedLocation) => {
                    const updatedLocations = [...travelData.locations];
                    updatedLocations[index] = updatedLocation;
                    setTravelData(prev => ({ ...prev, locations: updatedLocations }));
                    setHasUnsavedChanges(true);
                  }}
                  editor={(location, onSave, onCancel) => (
                    <LocationInlineEditor
                      location={location}
                      onSave={onSave}
                      onCancel={onCancel}
                      onGeocode={async (locationName) => {
                        const coords = await geocodeLocation(locationName);
                        return coords;
                      }}
                      tripId={travelData.id || ''}
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
                        onDelete={() => deleteLocation(index)}
                        onViewPosts={() => setSelectedLocationForPosts(selectedLocationForPosts === index ? null : index)}
                        showAccommodations={false}
                        linkedExpenses={[]}
                      />
                      
                      {/* Accommodation Display */}
                      {/* Show accommodations using the new system if available, otherwise fallback to legacy */}
                      {location.accommodationIds && location.accommodationIds.length > 0 ? (
                        <div className="mt-3">
                          <LocationAccommodationsManager
                            tripId={travelData.id || ''}
                            locationId={location.id}
                            locationName={location.name}
                            accommodationIds={location.accommodationIds}
                            onAccommodationIdsChange={(newIds) => {
                              const updatedLocations = [...travelData.locations];
                              updatedLocations[index] = { ...location, accommodationIds: newIds };
                              setTravelData(prev => ({ ...prev, locations: updatedLocations }));
                              setHasUnsavedChanges(true);
                            }}
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
                        />
                      )}
                    </div>
                  )}
                </InPlaceEditor>

                <LocationPosts
                  location={location}
                  isVisible={selectedLocationForPosts === index}
                  newInstagramPost={newInstagramPost}
                  setNewInstagramPost={setNewInstagramPost}
                  newBlogPost={newBlogPost}
                  setNewBlogPost={setNewBlogPost}
                  onLocationUpdate={(updatedLocation) => {
                    const updatedLocations = [...travelData.locations];
                    updatedLocations[index] = updatedLocation;
                    setTravelData(prev => ({ ...prev, locations: updatedLocations }));
                    setHasUnsavedChanges(true);
                  }}
                  onAddInstagramPost={() => addInstagramPost(index)}
                  onAddBlogPost={() => addBlogPost(index)}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}