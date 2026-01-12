'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useShadowTripEditor, SHADOW_LOCATION_PREFIX } from './hooks/useShadowTripEditor';
// Dialogs will be added later if needed for shadow trips
import TripMetadataForm from '@/app/admin/edit/[tripId]/components/TripMetadataForm';
import LocationManager from '@/app/admin/edit/[tripId]/components/LocationManager';
import RouteManager from '@/app/admin/edit/[tripId]/components/RouteManager';


export default function ShadowPlannerPage() {
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
    autoSaving,
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
    newTikTokPost,
    setNewTikTokPost,
    newBlogPost,
    setNewBlogPost,
    notification,
    setNotification,
    handleLocationAdded,
    handleRouteAdded,
    deleteLocation,
    deleteRoute,
    addInstagramPost,
    addTikTokPost,
    addBlogPost,
    recalculateRoutePoints,
    geocodeLocation,
  } = useShadowTripEditor(tripId);

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
                <svg className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {notification.type === 'error' && (
                <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              )}
              {notification.type === 'info' && (
                <svg className="h-6 w-6 text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
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
                className={`rounded-md inline-flex ${
                  notification.type === 'success' ? 'text-green-400 hover:text-green-500 focus:ring-green-600' :
                  notification.type === 'error' ? 'text-red-400 hover:text-red-500 focus:ring-red-600' :
                  'text-blue-400 hover:text-blue-500 focus:ring-blue-600'
                } focus:outline-none focus:ring-2 focus:ring-offset-2`}
                onClick={onClose}
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
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Access Denied</h1>
          <p className="text-gray-600 dark:text-gray-400">You need admin access to view this page.</p>
        </div>
      </div>
    );
  }

  if (!travelData || loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-gray-600 dark:text-gray-400">Loading shadow trip data...</p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Trip Not Found</h1>
              <p className="text-gray-600 dark:text-gray-400">The requested trip could not be found.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Toast Notification */}
      {notification && (
        <ToastNotification
          notification={notification}
          onClose={() => setNotification(null)}
        />
      )}

      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                {SHADOW_LOCATION_PREFIX} Shadow Trip Planner
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Plan future parts of "{travelData?.title || 'Unknown'}" trip
              </p>
            </div>
            <div className="flex items-center space-x-4">
              {autoSaving && (
                <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving...
                </div>
              )}
              <button
                onClick={() => router.push(`/admin/edit/${tripId}`)}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                Back to Editor
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Shadow Planning Mode Banner */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-8">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200">
                Shadow Planning Mode
              </h3>
              <div className="mt-2 text-sm text-blue-700 dark:text-blue-300">
                <p>
                  You are planning future parts of your trip. These changes are only visible in admin mode and won't affect the public view.
                  Real trip data is shown as read-only for reference.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Content */}
        <div className="space-y-8">
          {/* Trip Metadata */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Trip Information</h2>
            {travelData && (
              <TripMetadataForm
                travelData={travelData}
                setTravelData={(newData) => {
                  if (typeof newData === 'function') {
                    setTravelData(prev => prev ? newData(prev) : prev);
                  } else {
                    setTravelData(newData);
                  }
                }}
                setHasUnsavedChanges={setHasUnsavedChanges}
              />
            )}
          </div>

          {/* Location Manager */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Shadow Locations
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Plan future locations for your trip
              </p>
            </div>
            <div className="p-6">
              {travelData && (
                <LocationManager
                  tripId={tripId}
                  travelData={travelData}
                  setTravelData={(newData) => {
                    if (typeof newData === 'function') {
                      setTravelData(prev => prev ? newData(prev) : prev);
                    } else {
                      setTravelData(newData);
                    }
                  }}
                  setHasUnsavedChanges={setHasUnsavedChanges}
                  currentLocation={currentLocation}
                  setCurrentLocation={setCurrentLocation}
                  editingLocationIndex={editingLocationIndex}
                  setEditingLocationIndex={setEditingLocationIndex}
                  selectedLocationForPosts={selectedLocationForPosts}
                  setSelectedLocationForPosts={setSelectedLocationForPosts}
                  newInstagramPost={newInstagramPost}
                  setNewInstagramPost={setNewInstagramPost}
                  newTikTokPost={newTikTokPost}
                  setNewTikTokPost={setNewTikTokPost}
                  newBlogPost={newBlogPost}
                  setNewBlogPost={setNewBlogPost}
                  travelLookup={travelLookup}
                  costData={costData}
                  handleLocationAdded={handleLocationAdded}
                  geocodeLocation={async (locationName: string) => {
                    const result = await geocodeLocation(locationName);
                    return result || [0, 0] as [number, number];
                  }}
                  deleteLocation={deleteLocation}
                  addInstagramPost={addInstagramPost}
                  addTikTokPost={addTikTokPost}
                  addBlogPost={addBlogPost}
                  calculateSmartDurations={(locations, _routes) => {
                    // For shadow trips, return locations as-is since they're planning data
                    return locations;
                  }}
                />
              )}
            </div>
          </div>

          {/* Route Manager */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Shadow Routes
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Plan future transportation between locations
              </p>
            </div>
            <div className="p-6">
              <RouteManager
                tripId={tripId}
                travelData={travelData}
                setTravelData={(newData) => {
                  if (typeof newData === 'function') {
                    setTravelData(prev => prev ? newData(prev) : prev);
                  } else {
                    setTravelData(newData);
                  }
                }}
                setHasUnsavedChanges={setHasUnsavedChanges}
                currentRoute={currentRoute}
                setCurrentRoute={setCurrentRoute}
                editingRouteIndex={editingRouteIndex}
                setEditingRouteIndex={setEditingRouteIndex}
                handleRouteAdded={async (route) => {
                  handleRouteAdded(route);
                }}
                geocodeLocation={async (locationName: string) => {
                  const result = await geocodeLocation(locationName);
                  return result || [0, 0] as [number, number];
                }}
                deleteRoute={deleteRoute}
                recalculateRoutePoints={(index) => {
                  // Call the actual recalculateRoutePoints with the index
                  recalculateRoutePoints(index);
                }}
                generateMap={() => {
                  // Open map for shadow trips - admin domain will show shadow data automatically
                  const url = `/map/${tripId}`;
                  window.open(url, '_blank');
                }}
              />
            </div>
          </div>


        </div>
      </div>

      {/* TODO: Add dialog components for shadow trips if needed */}
    </div>
  );
}
