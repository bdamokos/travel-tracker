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

                {/* Posts Section */}
                {selectedLocationForPosts === index && (
                  <div className="mt-4 p-3 bg-gray-50 rounded-sm">
                    <h6 className="font-medium mb-3">Instagram & Blog Posts</h6>
                    
                    {/* Instagram Posts */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Instagram Posts</label>
                      <div className="flex gap-2 mb-2">
                        <input
                          type="url"
                          value={newInstagramPost.url || ''}
                          onChange={(e) => setNewInstagramPost(prev => ({ ...prev, url: e.target.value }))}
                          className="flex-1 px-2 py-1 border border-gray-300 rounded-sm text-sm"
                          placeholder="Instagram post URL"
                        />
                        <input
                          type="text"
                          value={newInstagramPost.caption || ''}
                          onChange={(e) => setNewInstagramPost(prev => ({ ...prev, caption: e.target.value }))}
                          className="flex-1 px-2 py-1 border border-gray-300 rounded-sm text-sm"
                          placeholder="Caption (optional)"
                        />
                        <button
                          onClick={() => addInstagramPost(index)}
                          className="px-3 py-1 bg-pink-500 text-white rounded-sm text-sm hover:bg-pink-600"
                        >
                          Add
                        </button>
                      </div>
                      
                      {location.instagramPosts && location.instagramPosts.length > 0 && (
                        <div className="space-y-1">
                          {location.instagramPosts.map((post) => (
                            <div key={post.id} className="flex justify-between items-center bg-white p-2 rounded-sm text-sm">
                              <a href={post.url} target="_blank" rel="noopener" className="text-blue-500 hover:underline truncate">
                                {post.url}
                              </a>
                              <button
                                onClick={() => {
                                  const updatedLocations = [...travelData.locations];
                                  updatedLocations[index].instagramPosts = updatedLocations[index].instagramPosts?.filter(p => p.id !== post.id);
                                  setTravelData(prev => ({ ...prev, locations: updatedLocations }));
                                }}
                                className="text-red-500 hover:text-red-700 ml-2"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Blog Posts */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Blog Posts</label>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
                        <input
                          type="text"
                          value={newBlogPost.title || ''}
                          onChange={(e) => setNewBlogPost(prev => ({ ...prev, title: e.target.value }))}
                          className="px-2 py-1 border border-gray-300 rounded-sm text-sm"
                          placeholder="Post title"
                        />
                        <input
                          type="url"
                          value={newBlogPost.url || ''}
                          onChange={(e) => setNewBlogPost(prev => ({ ...prev, url: e.target.value }))}
                          className="px-2 py-1 border border-gray-300 rounded-sm text-sm"
                          placeholder="Blog post URL"
                        />
                        <div className="flex gap-1">
                          <input
                            type="text"
                            value={newBlogPost.excerpt || ''}
                            onChange={(e) => setNewBlogPost(prev => ({ ...prev, excerpt: e.target.value }))}
                            className="flex-1 px-2 py-1 border border-gray-300 rounded-sm text-sm"
                            placeholder="Excerpt (optional)"
                          />
                          <button
                            onClick={() => addBlogPost(index)}
                            className="px-3 py-1 bg-blue-500 dark:bg-blue-600 text-white rounded-sm text-sm hover:bg-blue-600 dark:hover:bg-blue-700"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                      
                      {location.blogPosts && location.blogPosts.length > 0 && (
                        <div className="space-y-1">
                          {location.blogPosts.map((post) => (
                            <div key={post.id} className="flex justify-between items-center bg-white p-2 rounded-sm text-sm">
                              <div className="flex-1 truncate">
                                <a href={post.url} target="_blank" rel="noopener" className="text-blue-500 hover:underline font-medium">
                                  {post.title}
                                </a>
                                {post.excerpt && <p className="text-gray-600 text-xs">{post.excerpt}</p>}
                              </div>
                              <button
                                onClick={() => {
                                  const updatedLocations = [...travelData.locations];
                                  updatedLocations[index].blogPosts = updatedLocations[index].blogPosts?.filter(p => p.id !== post.id);
                                  setTravelData(prev => ({ ...prev, locations: updatedLocations }));
                                }}
                                className="text-red-500 hover:text-red-700 ml-2"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}