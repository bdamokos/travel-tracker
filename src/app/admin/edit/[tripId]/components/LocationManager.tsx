'use client';

import React from 'react';
import { Location, Transportation, CostTrackingLink } from '@/app/types';
import { CostTrackingData } from '@/app/types';
import { ExpenseTravelLookup } from '@/app/lib/expenseTravelLookup';
import LocationForm from '../../../components/LocationForm';
import LocationList from './location/LocationList';

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
  tripId: string; // Add tripId for expense scoping
  travelData: TravelData;
  setTravelData: React.Dispatch<React.SetStateAction<TravelData>>;
  setHasUnsavedChanges: (value: boolean) => void;
  currentLocation: Partial<Location>;
  setCurrentLocation: React.Dispatch<React.SetStateAction<Partial<Location>>>;
  editingLocationIndex: number | null;
  setEditingLocationIndex: React.Dispatch<React.SetStateAction<number | null>>;
  selectedLocationForPosts: string | null;
  setSelectedLocationForPosts: React.Dispatch<React.SetStateAction<string | null>>;
  newInstagramPost: Partial<{ url: string; caption: string }>;
  setNewInstagramPost: React.Dispatch<React.SetStateAction<Partial<{ url: string; caption: string }>>>;
  newTikTokPost: Partial<{ url: string; caption: string }>;
  setNewTikTokPost: React.Dispatch<React.SetStateAction<Partial<{ url: string; caption: string }>>>;
  newBlogPost: Partial<{ title: string; url: string; excerpt: string }>;
  setNewBlogPost: React.Dispatch<React.SetStateAction<Partial<{ title: string; url: string; excerpt: string }>>>;
  travelLookup: ExpenseTravelLookup | null;
  costData: CostTrackingData | null;
  handleLocationAdded: (location: Location) => void;
  geocodeLocation: (locationName: string) => Promise<[number, number]>;
  deleteLocation: (index: number) => void;
  addInstagramPost: (index: number) => void;
  addTikTokPost: (index: number) => void;
  addBlogPost: (index: number) => void;
  calculateSmartDurations: (locations: Location[], routes: TravelRoute[]) => Location[];
}

export default function LocationManager({
  tripId,
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
  newTikTokPost,
  setNewTikTokPost,
  newBlogPost,
  setNewBlogPost,
  travelLookup,
  costData,
  handleLocationAdded,
  geocodeLocation,
  deleteLocation,
  addInstagramPost,
  addTikTokPost,
  addBlogPost,
  calculateSmartDurations,
}: LocationManagerProps) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Locations</h3>
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
      
      {/* Add Location Form Section */}
      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600 mb-6">
        <LocationForm
          tripId={tripId}
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
      </div>
      
      <LocationList
        locations={travelData.locations}
        tripId={tripId}
        travelLookup={travelLookup}
        costData={costData}
        selectedLocationForPosts={selectedLocationForPosts}
        newInstagramPost={newInstagramPost}
        setNewInstagramPost={setNewInstagramPost}
        newTikTokPost={newTikTokPost}
        setNewTikTokPost={setNewTikTokPost}
        newBlogPost={newBlogPost}
        setNewBlogPost={setNewBlogPost}
        onLocationUpdate={(locationId, updatedLocation) => {
          setTravelData(prev => ({
            ...prev,
            locations: prev.locations.map(location => (location.id === locationId ? updatedLocation : location))
          }));
          setHasUnsavedChanges(true);
        }}
        onLocationDelete={(locationId) => {
          const index = travelData.locations.findIndex(location => location.id === locationId);
          if (index !== -1) {
            deleteLocation(index);
          }
        }}
        onViewPosts={(locationId) =>
          setSelectedLocationForPosts(selectedLocationForPosts === locationId ? null : locationId)
        }
        onGeocode={geocodeLocation}
        onAddInstagramPost={(locationId) => {
          const index = travelData.locations.findIndex(location => location.id === locationId);
          if (index !== -1) {
            addInstagramPost(index);
          }
        }}
        onAddTikTokPost={(locationId) => {
          const index = travelData.locations.findIndex(location => location.id === locationId);
          if (index !== -1) {
            addTikTokPost(index);
          }
        }}
        onAddBlogPost={(locationId) => {
          const index = travelData.locations.findIndex(location => location.id === locationId);
          if (index !== -1) {
            addBlogPost(index);
          }
        }}
      />
    </div>
  );
}
