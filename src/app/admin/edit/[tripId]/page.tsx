'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTripEditor } from './hooks/useTripEditor';
import DeleteWarningDialog from '../../components/DeleteWarningDialog';
import ReassignmentDialog from '../../components/ReassignmentDialog';
import TripMetadataForm from './components/TripMetadataForm';
import LocationManager from './components/LocationManager';
import RouteManager from './components/RouteManager';
import AccommodationManager from './components/AccommodationManager';


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

          {/* Main Editor Content - Broken down into smaller components */}
          <div className="space-y-8">
            {/* Basic Info */}
            <TripMetadataForm
              travelData={travelData}
              setTravelData={setTravelData}
              setHasUnsavedChanges={setHasUnsavedChanges}
            />

            {/* Locations */}
            <LocationManager
              travelData={travelData}
              setTravelData={setTravelData}
              setHasUnsavedChanges={setHasUnsavedChanges}
              currentLocation={currentLocation}
              setCurrentLocation={setCurrentLocation}
              editingLocationIndex={editingLocationIndex}
              setEditingLocationIndex={setEditingLocationIndex}
              selectedLocationForPosts={selectedLocationForPosts}
              setSelectedLocationForPosts={setSelectedLocationForPosts}
              newInstagramPost={newInstagramPost}
              setNewInstagramPost={setNewInstagramPost}
              newBlogPost={newBlogPost}
              setNewBlogPost={setNewBlogPost}
              travelLookup={travelLookup}
              costData={costData}
              handleLocationAdded={handleLocationAdded}
              geocodeLocation={geocodeLocation}
              deleteLocation={deleteLocation}
              addInstagramPost={addInstagramPost}
              addBlogPost={addBlogPost}
              calculateSmartDurations={calculateSmartDurations}
            />

            {/* Routes */}
            <RouteManager
              travelData={travelData}
              setTravelData={setTravelData}
              setHasUnsavedChanges={setHasUnsavedChanges}
              currentRoute={currentRoute}
              setCurrentRoute={setCurrentRoute}
              editingRouteIndex={editingRouteIndex}
              setEditingRouteIndex={setEditingRouteIndex}
              travelLookup={travelLookup}
              costData={costData}
              handleRouteAdded={handleRouteAdded}
              geocodeLocation={geocodeLocation}
              deleteRoute={deleteRoute}
              recalculateRoutePoints={recalculateRoutePoints}
              generateMap={generateMap}
            />

            {/* Accommodations */}
            <AccommodationManager
              travelData={travelData}
              setTravelData={setTravelData}
              setHasUnsavedChanges={setHasUnsavedChanges}
              travelLookup={travelLookup}
              costData={costData}
            />
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