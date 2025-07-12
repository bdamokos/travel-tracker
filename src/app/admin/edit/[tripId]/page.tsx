'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTripEditor } from './hooks/useTripEditor';
import { Location, Transportation, CostTrackingLink } from '@/app/types';
import LocationAccommodationsManager from '../../components/LocationAccommodationsManager';
import LocationForm from '../../components/LocationForm';
import RouteForm from '../../components/RouteForm';
import AccommodationDisplay from '../../../components/AccommodationDisplay';
import LinkedExpensesDisplay from '../../components/LinkedExpensesDisplay';
import DeleteWarningDialog from '../../components/DeleteWarningDialog';
import ReassignmentDialog from '../../components/ReassignmentDialog';
import InPlaceEditor from '../../components/InPlaceEditor';
import LocationDisplay from '../../components/LocationDisplay';
import LocationInlineEditor from '../../components/LocationInlineEditor';
import RouteDisplay from '../../components/RouteDisplay';
import RouteInlineEditor from '../../components/RouteInlineEditor';

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

export default function TripEditorPage() {
  const params = useParams();
  const router = useRouter();
  const tripId = params?.tripId as string;
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);

  // Check admin access
  useEffect(() => {
    const checkAdminAccess = async () => {
      try {
        const response = await fetch('/api/admin-check');
        if (response.ok) {
          setIsAuthorized(true);
        } else {
          router.push('/maps');
        }
      } catch {
        // If we can't check, assume we're on the correct domain for dev
        setIsAuthorized(true);
      } finally {
        setLoading(false);
      }
    };

    checkAdminAccess();
  }, [router]);

  const {
    mode,
    autoSaving,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    travelData,
    setTravelData,
    costData,
    travelLookup,
    currentLocation,
    setCurrentLocation,
    currentRoute,
    setCurrentRoute,
    editingLocationIndex,
    setEditingLocationIndex,
    editingRouteIndex,
    setEditingRouteIndex,
    selectedLocationForPosts,
    setSelectedLocationForPosts,
    newInstagramPost,
    setNewInstagramPost,
    newBlogPost,
    setNewBlogPost,
    deleteDialog,
    notification,
    setNotification,
    reassignDialog,
    setReassignDialog,
    handleLocationAdded,
    handleRouteAdded,
    addInstagramPost,
    addBlogPost,
    deleteLocation,
    deleteRoute,
    recalculateRoutePoints,
    generateMap,
    geocodeLocation,
    calculateSmartDurations,
    cleanupExpenseLinks,
    reassignExpenseLinks,
  } = useTripEditor(tripId === 'new' ? null : tripId);

  // Toast Notification Component
  const ToastNotification: React.FC<{
    notification: { message: string; type: 'success' | 'error' | 'info'; isVisible: boolean };
    onClose: () => void;
  }> = ({ notification, onClose }) => (
    <div className={`fixed top-4 right-4 z-50 transition-all duration-300 transform ${
      notification.isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
    }`}>
      <div className={`max-w-sm w-full shadow-lg rounded-lg pointer-events-auto ring-1 ring-black ring-opacity-5 overflow-hidden ${
        notification.type === 'success' ? 'bg-green-50 dark:bg-green-900' :
        notification.type === 'error' ? 'bg-red-50 dark:bg-red-900' :
        'bg-blue-50 dark:bg-blue-900'
      }`}>
        <div className="p-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              {notification.type === 'success' && (
                <svg className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {notification.type === 'error' && (
                <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {notification.type === 'info' && (
                <svg className="h-6 w-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>
            <div className="ml-3 w-0 flex-1 pt-0.5">
              <p className={`text-sm font-medium ${
                notification.type === 'success' ? 'text-green-800 dark:text-green-200' :
                notification.type === 'error' ? 'text-red-800 dark:text-red-200' :
                'text-blue-800 dark:text-blue-200'
              }`}>
                {notification.message}
              </p>
            </div>
            <div className="ml-4 flex-shrink-0 flex">
              <button
                onClick={onClose}
                className={`rounded-md inline-flex focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  notification.type === 'success' ? 'text-green-500 hover:text-green-600 focus:ring-green-500' :
                  notification.type === 'error' ? 'text-red-500 hover:text-red-600 focus:ring-red-500' :
                  'text-blue-500 hover:text-blue-600 focus:ring-blue-500'
                }`}
              >
                <span className="sr-only">Close</span>
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading admin interface...</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return null; // Will redirect via useEffect
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/admin')}
                className="px-3 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                ← Back to List
              </button>
              <h1 className="text-3xl font-bold text-gray-800 dark:text-white">
                {tripId === 'new' ? 'Create New Travel Map' : 'Edit Travel Map'}
              </h1>
              {autoSaving && (
                <div className="flex items-center gap-2 text-blue-600">
                  <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-sm">Auto-saving...</span>
                </div>
              )}
              {!autoSaving && hasUnsavedChanges && (
                <div className="flex items-center gap-2 text-amber-600">
                  <div className="w-2 h-2 bg-amber-600 rounded-full"></div>
                  <span className="text-sm">Unsaved changes</span>
                </div>
              )}
              {!autoSaving && !hasUnsavedChanges && (tripId !== 'new' || travelData.id) && (
                <div className="flex items-center gap-2 text-green-600">
                  <div className="w-2 h-2 bg-green-600 rounded-full"></div>
                  <span className="text-sm">All changes saved</span>
                </div>
              )}
            </div>
          </div>

          {/* Main Editor Content - Moved from TravelDataForm.tsx */}
          <div className="space-y-8">
            {/* Basic Info */}
            <div>
              <h3 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Journey Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="journey-title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                  <input
                    id="journey-title"
                    type="text"
                    value={travelData.title}
                    onChange={(e) => {
                      setTravelData(prev => ({ ...prev, title: e.target.value }));
                      setHasUnsavedChanges(true);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    placeholder="My Amazing Trip"
                  />
                </div>
                <div>
                  <label htmlFor="journey-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                  <input
                    id="journey-description"
                    type="text"
                    value={travelData.description}
                    onChange={(e) => {
                      setTravelData(prev => ({ ...prev, description: e.target.value }));
                      setHasUnsavedChanges(true);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    placeholder="A wonderful journey across..."
                  />
                </div>
                <div>
                  <label htmlFor="journey-start-date" className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                  <input
                    id="journey-start-date"
                    type="date"
                    value={travelData.startDate instanceof Date ? travelData.startDate.toISOString().split('T')[0] : travelData.startDate}
                    onChange={(e) => {
                      setTravelData(prev => ({ ...prev, startDate: new Date(e.target.value) }));
                      setHasUnsavedChanges(true);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="journey-end-date" className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input
                    id="journey-end-date"
                    type="date"
                    value={travelData.endDate instanceof Date ? travelData.endDate.toISOString().split('T')[0] : travelData.endDate}
                    onChange={(e) => {
                      setTravelData(prev => ({ ...prev, endDate: new Date(e.target.value) }));
                      setHasUnsavedChanges(true);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Locations */}
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

            {/* Routes */}
            <div>
              <h3 className="text-xl font-semibold mb-4">Routes</h3>
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
              />

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
                              <LinkedExpensesDisplay
                                itemId={route.id}
                                itemType="route"
                                itemName={`${route.from} → ${route.to}`}
                                travelLookup={travelLookup}
                                costData={costData}
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
          </div>

          {/* Safe Deletion Dialogs - Moved from TravelDataForm.tsx */}
          {deleteDialog && (
            <DeleteWarningDialog
              isOpen={deleteDialog.isOpen}
              itemType={deleteDialog.itemType}
              itemName={deleteDialog.itemName}
              linkedExpenses={deleteDialog.linkedExpenses}
              onChoice={async (choice) => {
                if (choice === 'cancel') {
                  // Handle this with the hook's logic
                } else if (choice === 'remove') {
                  // Remove links and delete item
                  await cleanupExpenseLinks(deleteDialog.itemType, deleteDialog.itemId);
                  
                  if (deleteDialog.itemType === 'location') {
                    setTravelData(prev => ({
                      ...prev,
                      locations: prev.locations.filter((_, i) => i !== deleteDialog.itemIndex)
                    }));
                  } else {
                    setTravelData(prev => ({
                      ...prev,
                      routes: prev.routes.filter((_, i) => i !== deleteDialog.itemIndex)
                    }));
                  }
                  
                  setHasUnsavedChanges(true);
                } else if (choice === 'reassign') {
                  // Show reassignment dialog
                  const availableItems = deleteDialog.itemType === 'location' 
                    ? travelData.locations
                        .filter(loc => loc.id !== deleteDialog.itemId)
                        .map(loc => ({ id: loc.id, name: loc.name }))
                    : travelData.routes
                        .filter(route => route.id !== deleteDialog.itemId)
                        .map(route => ({ id: route.id, name: `${route.from} → ${route.to}` }));
                  
                  setReassignDialog({
                    isOpen: true,
                    itemType: deleteDialog.itemType,
                    fromItemId: deleteDialog.itemId,
                    fromItemName: deleteDialog.itemName,
                    linkedExpenses: deleteDialog.linkedExpenses,
                    availableItems,
                    onComplete: () => {
                      // Delete the item after reassignment
                      if (deleteDialog.itemType === 'location') {
                        setTravelData(prev => ({
                          ...prev,
                          locations: prev.locations.filter((_, i) => i !== deleteDialog.itemIndex)
                        }));
                      } else {
                        setTravelData(prev => ({
                          ...prev,
                          routes: prev.routes.filter((_, i) => i !== deleteDialog.itemIndex)
                        }));
                      }
                      
                      setHasUnsavedChanges(true);
                    }
                  });
                }
              }}
            />
          )}
          
          {reassignDialog && (
            <ReassignmentDialog
              isOpen={reassignDialog.isOpen}
              itemType={reassignDialog.itemType}
              fromItemName={reassignDialog.fromItemName}
              linkedExpenses={reassignDialog.linkedExpenses}
              availableItems={reassignDialog.availableItems}
              onReassign={async (toItemId, toItemName) => {
                // Reassign the expense links
                await reassignExpenseLinks(
                  reassignDialog.itemType,
                  reassignDialog.fromItemId,
                  reassignDialog.itemType,
                  toItemId,
                  toItemName
                );
                
                setReassignDialog(null);
                reassignDialog.onComplete();
              }}
              onCancel={() => {
                setReassignDialog(null);
              }}
            />
          )}

          {/* Toast Notification - Moved from TravelDataForm.tsx */}
          {notification && (
            <ToastNotification
              notification={notification}
              onClose={() => {
                setNotification(prev => prev ? { ...prev, isVisible: false } : null);
                setTimeout(() => setNotification(null), 300);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}