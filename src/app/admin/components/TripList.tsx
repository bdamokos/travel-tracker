'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface ExistingTrip {
  id: string;
  title: string;
  description: string;
  startDate: Date;
  endDate: Date;
}

interface TripListProps {
  tripDeleteDialog: {
    isOpen: boolean;
    tripId: string;
    tripTitle: string;
    isDeleting?: boolean;
  } | null;
  setTripDeleteDialog: React.Dispatch<React.SetStateAction<{
    isOpen: boolean;
    tripId: string;
    tripTitle: string;
    isDeleting?: boolean;
  } | null>>;
}

export default function TripList({ tripDeleteDialog, setTripDeleteDialog }: TripListProps) {
  const router = useRouter();
  const [existingTrips, setExistingTrips] = useState<ExistingTrip[]>([]);
  const [loading, setLoading] = useState(true);

  // Load existing trips
  const loadExistingTrips = async () => {
    try {
      const response = await fetch('/api/travel-data/list');
      if (response.ok) {
        const trips = await response.json();
        setExistingTrips(trips);
      }
    } catch (error) {
      console.error('Error loading trips:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExistingTrips();
  }, []);

  // Delete trip function
  const deleteTrip = (tripId: string, tripTitle: string) => {
    setTripDeleteDialog({
      isOpen: true,
      tripId,
      tripTitle,
      isDeleting: false
    });
  };

  // Confirm trip deletion
  const confirmTripDeletion = async () => {
    if (!tripDeleteDialog) return;

    setTripDeleteDialog(prev => prev ? { ...prev, isDeleting: true } : null);

    try {
      const response = await fetch(`/api/travel-data?id=${tripDeleteDialog.tripId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        // Remove from list
        setExistingTrips(prev => prev.filter(trip => trip.id !== tripDeleteDialog.tripId));
        setTripDeleteDialog(null);
      } else {
        console.error('Failed to delete trip');
        setTripDeleteDialog(prev => prev ? { ...prev, isDeleting: false } : null);
      }
    } catch (error) {
      console.error('Error deleting trip:', error);
      setTripDeleteDialog(prev => prev ? { ...prev, isDeleting: false } : null);
    }
  };

  // Get map URL with planning mode
  const getMapUrl = (tripId: string) => {
    return `/map/${tripId}?planningMode=true`;
  };

  // Get calendar URL with planning mode
  const getCalendarUrl = (tripId: string) => {
    return `/calendars/${tripId}?planningMode=true`;
  };

  return (
    <>
      {/* Delete Confirmation Dialog */}
      {tripDeleteDialog?.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.704-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Delete Trip?
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  This action cannot be undone
                </p>
              </div>
            </div>

            <div className="mb-6">
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.704-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <div>
                    <h4 className="font-medium text-red-800 dark:text-red-200">
                      Complete Trip Deletion
                    </h4>
                    <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                      You are about to delete the trip <strong>&quot;{tripDeleteDialog.tripTitle}&quot;</strong>. 
                      This will permanently remove both the travel data AND any associated cost tracking data.
                    </p>
                    <p className="text-sm text-red-700 dark:text-red-300 mt-2">
                      A backup will be created before deletion for recovery purposes.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setTripDeleteDialog(null)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={confirmTripDeletion}
                disabled={tripDeleteDialog?.isDeleting}
                className="px-4 py-2 bg-red-600 dark:bg-red-700 text-white rounded-md hover:bg-red-700 dark:hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {tripDeleteDialog?.isDeleting && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                )}
                {tripDeleteDialog?.isDeleting ? 'Deleting...' : 'Delete Trip'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trip List */}
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Travel Maps</h2>
          <div className="flex gap-2">
            <button
              onClick={loadExistingTrips}
              disabled={loading}
              className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
            <button
              onClick={() => router.push('/admin/edit/new')}
              className="px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-md hover:bg-blue-700 dark:hover:bg-blue-800"
            >
              Create New Trip
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">Loading travel maps...</p>
          </div>
        ) : existingTrips.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400 mb-4">No travel maps found.</p>
            <div className="space-y-3">
              <button
                onClick={async () => {
                  setLoading(true);
                  await loadExistingTrips();
                  setLoading(false);
                }}
                disabled={loading}
                className="block mx-auto px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Try Refreshing'}
              </button>
              <button
                onClick={() => router.push('/admin/edit/new')}
                className="px-6 py-3 bg-blue-600 dark:bg-blue-700 text-white rounded-md hover:bg-blue-700 dark:hover:bg-blue-800"
              >
                Create Your First Travel Map
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {existingTrips.map((trip) => (
              <div key={trip.id} className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-6 shadow-xs hover:shadow-md transition-shadow relative">
                <button
                  onClick={() => deleteTrip(trip.id, trip.title)}
                  className="absolute top-3 right-3 p-1 text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-600 rounded"
                  title="Delete Trip"
                >
                  🗑️
                </button>
                <h3 className="font-semibold text-lg mb-2 text-gray-900 dark:text-white pr-8">{trip.title}</h3>
                <p className="text-gray-600 dark:text-gray-300 text-sm mb-3">{trip.description}</p>
                <p className="text-gray-500 dark:text-gray-400 text-xs mb-4">
                  {new Date(trip.startDate).toLocaleDateString()} - {new Date(trip.endDate).toLocaleDateString()}
                </p>
                
                <div className="flex gap-2">
                  <button
                    onClick={() => router.push(`/admin/edit/${trip.id}`)}
                    className="flex-1 px-3 py-2 bg-blue-500 dark:bg-blue-600 text-white rounded-sm text-sm hover:bg-blue-600 dark:hover:bg-blue-700"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => router.push(`/admin/shadow-planner/${trip.id}`)}
                    className="flex-1 px-3 py-2 bg-orange-500 dark:bg-orange-600 text-white rounded-sm text-sm hover:bg-orange-600 dark:hover:bg-orange-700"
                    title="Plan future parts of this trip"
                  >
                    Shadow
                  </button>
                  <button
                    onClick={() => {
                      const mapUrl = getMapUrl(trip.id);
                      window.open(mapUrl, '_blank');
                    }}
                    className="flex-1 px-3 py-2 bg-green-500 dark:bg-green-600 text-white rounded-sm text-sm hover:bg-green-600 dark:hover:bg-green-700"
                  >
                    Map
                  </button>
                  <button
                    onClick={() => {
                      window.open(getCalendarUrl(trip.id), '_blank');
                    }}
                    className="flex-1 px-3 py-2 bg-purple-500 dark:bg-purple-600 text-white rounded-sm text-sm hover:bg-purple-600 dark:hover:bg-purple-700"
                  >
                    Calendar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}