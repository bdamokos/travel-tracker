'use client';

import { useState, useEffect, useCallback } from 'react';
import { getMapUrl } from '../../lib/domains';
import { calculateSmartDurations, formatDuration } from '../../lib/durationUtils';
import { Location, InstagramPost, BlogPost, CostTrackingLink, Transportation } from '../../types';
import LocationForm from './LocationForm';
import RouteForm from './RouteForm';
import AccommodationDisplay from '../../components/AccommodationDisplay';
import LinkedExpensesDisplay from './LinkedExpensesDisplay';
import DeleteWarningDialog from './DeleteWarningDialog';
import ReassignmentDialog from './ReassignmentDialog';
import { getLinkedExpenses, cleanupExpenseLinks, reassignExpenseLinks, LinkedExpense } from '../../lib/costLinkCleanup';
import { CostTrackingData } from '../../types';
import { ExpenseTravelLookup, createExpenseTravelLookup } from '../../lib/expenseTravelLookup';

interface TravelRoute {
  id: string;
  from: string;
  to: string;
  fromCoords: [number, number];
  toCoords: [number, number];
  transportType: Transportation['type'];
  date: string;
  duration?: string;
  notes?: string;
  privateNotes?: string;
  costTrackingLinks?: CostTrackingLink[];
}

interface TravelData {
  id?: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  locations: Location[];
  routes: TravelRoute[];
}

interface ExistingTrip {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  createdAt: string;
}

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

interface TravelDataFormProps {
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

export default function TravelDataForm({ tripDeleteDialog, setTripDeleteDialog }: TravelDataFormProps) {
  const [mode, setMode] = useState<'create' | 'edit' | 'list'>('list');
  const [existingTrips, setExistingTrips] = useState<ExistingTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoSaving, setAutoSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [travelData, setTravelData] = useState<TravelData>({
    title: '',
    description: '',
    startDate: '',
    endDate: '',
    locations: [],
    routes: []
  });
  const [costData, setCostData] = useState<CostTrackingData | null>(null);
  const [travelLookup, setTravelLookup] = useState<ExpenseTravelLookup | null>(null);
  
  const [currentLocation, setCurrentLocation] = useState<Partial<Location>>({
    name: '',
    coordinates: [0, 0],
    date: '',
    notes: '',
    instagramPosts: [],
    blogPosts: [],
    accommodationData: '',
    isAccommodationPublic: false,
    accommodationIds: [],
    costTrackingLinks: []
  });
  
  const [currentRoute, setCurrentRoute] = useState<Partial<TravelRoute>>({
    from: '',
    to: '',
    fromCoords: [0, 0],
    toCoords: [0, 0],
    transportType: 'plane',
    date: '',
    duration: '',
    notes: '',
    privateNotes: '',
    costTrackingLinks: []
  });

  const [editingLocationIndex, setEditingLocationIndex] = useState<number | null>(null);
  const [editingRouteIndex, setEditingRouteIndex] = useState<number | null>(null);
  const [selectedLocationForPosts, setSelectedLocationForPosts] = useState<number | null>(null);
  
  // New post forms
  const [newInstagramPost, setNewInstagramPost] = useState<Partial<InstagramPost>>({
    url: '',
    caption: ''
  });
  
  const [newBlogPost, setNewBlogPost] = useState<Partial<BlogPost>>({
    title: '',
    url: '',
    excerpt: ''
  });

  // Safe deletion state
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    itemType: 'location' | 'route';
    itemIndex: number;
    itemId: string;
    itemName: string;
    linkedExpenses: LinkedExpense[];
  } | null>(null);

  // Notification state
  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
    isVisible: boolean;
  } | null>(null);

  // Show notification function
  const showNotification = (message: string, type: 'success' | 'error' | 'info') => {
    setNotification({ message, type, isVisible: true });
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      setNotification(prev => prev ? { ...prev, isVisible: false } : null);
      // Clear after fade animation
      setTimeout(() => setNotification(null), 300);
    }, 5000);
  };
  
  const [reassignDialog, setReassignDialog] = useState<{
    isOpen: boolean;
    itemType: 'location' | 'route';
    fromItemId: string;
    fromItemName: string;
    linkedExpenses: LinkedExpense[];
    availableItems: Array<{ id: string; name: string; }>;
    onComplete: () => void;
  } | null>(null);

  // Load existing trips
  useEffect(() => {
    let mounted = true;
    
    const loadTrips = async () => {
      setLoading(true);
      await loadExistingTrips();
      if (mounted) {
        setLoading(false);
      }
    };
    
    loadTrips();
    
    return () => {
      mounted = false;
    };
  }, []);

  // Silent auto-save function (no alerts, no redirects)
  const autoSaveTravelData = useCallback(async () => {
    // Validation (silent)
    if (!travelData.title || travelData.locations.length === 0) {
      return false; // Invalid data, don't save
    }

    try {
      const method = mode === 'edit' ? 'PUT' : 'POST';
      const url = mode === 'edit' ? `/api/travel-data?id=${travelData.id}` : '/api/travel-data';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(travelData),
      });
      
      if (response.ok) {
        const result = await response.json();
        // For new entries, update the travel data with the returned ID
        if (mode === 'create' && result.id) {
          setTravelData(prev => ({ ...prev, id: result.id }));
          setMode('edit'); // Switch to edit mode after first save
        }
        return true;
      } else {
        console.warn('Auto-save failed:', response.status);
        return false;
      }
    } catch (error) {
      console.warn('Auto-save error:', error);
      return false;
    }
  }, [travelData, mode]);

  // Auto-save effect for edit mode (debounced)
  useEffect(() => {
    // Only auto-save if we're in edit mode or create mode with sufficient data
    const canAutoSave = (mode === 'edit' && travelData.id) || 
                       (mode === 'create' && travelData.title && travelData.locations.length > 0);
    
    if (canAutoSave && hasUnsavedChanges) {
      const timeoutId = setTimeout(async () => {
        try {
          setAutoSaving(true);
          const success = await autoSaveTravelData();
          if (success) {
            setHasUnsavedChanges(false); // Mark as saved
          }
          setAutoSaving(false);
        } catch (error) {
          console.error('Auto-save failed:', error);
          setAutoSaving(false);
        }
      }, 2000); // Auto-save after 2 seconds of inactivity

      return () => clearTimeout(timeoutId);
    }
  }, [travelData, mode, hasUnsavedChanges, autoSaveTravelData]);

  // Track when user makes changes (but not on initial load)
  useEffect(() => {
    if ((mode === 'edit' && travelData.id) || (mode === 'create' && travelData.title)) {
      // Set flag that we have unsaved changes
      setHasUnsavedChanges(true);
    }
  }, [travelData, mode]);

  const loadExistingTrips = async () => {
    try {
      const response = await fetch('/api/travel-data/list');
      if (response.ok) {
        const trips = await response.json();
        setExistingTrips(trips);
      } else {
        console.error('Failed to load trips, status:', response.status);
      }
    } catch (error) {
      console.error('Error loading trips:', error);
    }
  };

  const migrateOldFormat = (tripData: Partial<TravelData>): TravelData => {
    // Migrate locations to new format if they don't have IDs
    const migratedLocations = tripData.locations?.map((location: Partial<Location>) => ({
      id: location.id || generateId(),
      name: location.name || '',
      coordinates: location.coordinates || [0, 0] as [number, number],
      date: location.date || '',
      endDate: location.endDate,
      duration: location.duration,
      arrivalTime: location.arrivalTime,
      departureTime: location.departureTime,
      notes: location.notes || '',
      instagramPosts: location.instagramPosts || [],
      blogPosts: location.blogPosts || [],
      accommodationData: location.accommodationData,
      isAccommodationPublic: location.isAccommodationPublic || false,
      accommodationIds: location.accommodationIds || [],
      costTrackingLinks: location.costTrackingLinks || []
    })) || [];

    // Migrate routes to new format if they don't have IDs
    const migratedRoutes = tripData.routes?.map((route: Partial<TravelRoute>) => ({
      id: route.id || generateId(),
      from: route.from || '',
      to: route.to || '',
      fromCoords: route.fromCoords || [0, 0] as [number, number],
      toCoords: route.toCoords || [0, 0] as [number, number],
      transportType: route.transportType || 'car',
      date: route.date || '',
      duration: route.duration,
      notes: route.notes || '',
      privateNotes: route.privateNotes,
      costTrackingLinks: route.costTrackingLinks || []
    })) || [];

    return {
      id: tripData.id,
      title: tripData.title || '',
      description: tripData.description || '',
      startDate: tripData.startDate || '',
      endDate: tripData.endDate || '',
      locations: migratedLocations,
      routes: migratedRoutes
    };
  };

  const loadTripForEditing = async (tripId: string) => {
    try {
      const response = await fetch(`/api/travel-data?id=${tripId}`);
      if (response.ok) {
        const rawTripData = await response.json();
        const tripData = migrateOldFormat(rawTripData);
        setTravelData(tripData);

        // Load cost data for this trip
        const costResponse = await fetch(`/api/cost-tracking?id=${tripId}`);
        if (costResponse.ok) {
          const costData = await costResponse.json();
          setCostData(costData);
          // Initialize travel lookup
          const lookup = new ExpenseTravelLookup(costData.tripId);
          await lookup.buildIndex();
          setTravelLookup(lookup);
        } else {
          setCostData(null);
          setTravelLookup(null);
        }

        setMode('edit');
        setHasUnsavedChanges(false); // Just loaded, no changes yet
      }
    } catch (error) {
      console.error('Error loading trip:', error);
    }
  };

  const generateId = () => Date.now().toString(36) + Math.random().toString(36).substring(2, 11);

  const handleLocationAdded = (newLocation: Location) => {
    if (editingLocationIndex !== null) {
      // Update existing location
      const updatedLocations = [...travelData.locations];
      updatedLocations[editingLocationIndex] = newLocation;
      setTravelData(prev => ({ ...prev, locations: updatedLocations }));
      setEditingLocationIndex(null);
    } else {
      // Add new location
      setTravelData(prev => ({
        ...prev,
        locations: [...prev.locations, newLocation]
      }));
    }
  };

  const handleRouteAdded = (newRoute: TravelRoute) => {
    // Auto-create missing locations for route endpoints
    const updatedLocations = [...travelData.locations];
    
    // Check if 'from' location exists
    const fromExists = updatedLocations.some(loc => 
      loc.name.toLowerCase().trim() === newRoute.from.toLowerCase().trim()
    );
    
    if (!fromExists && newRoute.fromCoords && (newRoute.fromCoords[0] !== 0 || newRoute.fromCoords[1] !== 0)) {
      const fromLocation: Location = {
        id: generateId(),
        name: newRoute.from,
        coordinates: newRoute.fromCoords,
        date: newRoute.date,
        notes: '',
        instagramPosts: [],
        blogPosts: [],
        accommodationData: '',
        isAccommodationPublic: false,
        costTrackingLinks: []
      };
      updatedLocations.push(fromLocation);
    }
    
    // Check if 'to' location exists
    const toExists = updatedLocations.some(loc => 
      loc.name.toLowerCase().trim() === newRoute.to.toLowerCase().trim()
    );
    
    if (!toExists && newRoute.toCoords && (newRoute.toCoords[0] !== 0 || newRoute.toCoords[1] !== 0)) {
      const toLocation: Location = {
        id: generateId(),
        name: newRoute.to,
        coordinates: newRoute.toCoords,
        date: newRoute.date,
        notes: '',
        instagramPosts: [],
        blogPosts: [],
        accommodationData: '',
        isAccommodationPublic: false,
        costTrackingLinks: []
      };
      updatedLocations.push(toLocation);
    }

    if (editingRouteIndex !== null) {
      // Update existing route
      const updatedRoutes = [...travelData.routes];
      updatedRoutes[editingRouteIndex] = newRoute;
      setTravelData(prev => ({ ...prev, routes: updatedRoutes, locations: updatedLocations }));
      setEditingRouteIndex(null);
    } else {
      // Add new route
      setTravelData(prev => ({
        ...prev,
        routes: [...prev.routes, newRoute],
        locations: updatedLocations
      }));
    }
  };

  const addInstagramPost = (locationIndex: number) => {
    if (newInstagramPost.url) {
      const post: InstagramPost = {
        id: generateId(),
        url: newInstagramPost.url,
        caption: newInstagramPost.caption || ''
      };

      const updatedLocations = [...travelData.locations];
      updatedLocations[locationIndex].instagramPosts = [
        ...(updatedLocations[locationIndex].instagramPosts || []),
        post
      ];
      
      setTravelData(prev => ({ ...prev, locations: updatedLocations }));
      setNewInstagramPost({ url: '', caption: '' });
    }
  };

  const addBlogPost = (locationIndex: number) => {
    if (newBlogPost.title && newBlogPost.url) {
      const post: BlogPost = {
        id: generateId(),
        title: newBlogPost.title,
        url: newBlogPost.url,
        excerpt: newBlogPost.excerpt || ''
      };

      const updatedLocations = [...travelData.locations];
      updatedLocations[locationIndex].blogPosts = [
        ...(updatedLocations[locationIndex].blogPosts || []),
        post
      ];
      
      setTravelData(prev => ({ ...prev, locations: updatedLocations }));
      setNewBlogPost({ title: '', url: '', excerpt: '' });
    }
  };

  const editLocation = (index: number) => {
    const location = travelData.locations[index];
    setCurrentLocation(location);
    setEditingLocationIndex(index);
  };

  const editRoute = (index: number) => {
    const route = travelData.routes[index];
    setCurrentRoute(route);
    setEditingRouteIndex(index);
  };

  const deleteLocation = async (index: number) => {
    const location = travelData.locations[index];
    
    // Check for linked expenses
    const linkedExpenses = await getLinkedExpenses('location', location.id);
    
    if (linkedExpenses.length > 0) {
      // Show safe deletion dialog
      setDeleteDialog({
        isOpen: true,
        itemType: 'location',
        itemIndex: index,
        itemId: location.id,
        itemName: location.name,
        linkedExpenses
      });
    } else {
      // No linked expenses, safe to delete directly
      setTravelData(prev => ({
        ...prev,
        locations: prev.locations.filter((_, i) => i !== index)
      }));
    }
  };

  const deleteRoute = async (index: number) => {
    const route = travelData.routes[index];
    
    // Check for linked expenses
    const linkedExpenses = await getLinkedExpenses('route', route.id);
    
    if (linkedExpenses.length > 0) {
      // Show safe deletion dialog
      setDeleteDialog({
        isOpen: true,
        itemType: 'route',
        itemIndex: index,
        itemId: route.id,
        itemName: `${route.from} → ${route.to}`,
        linkedExpenses
      });
    } else {
      // No linked expenses, safe to delete directly
      setTravelData(prev => ({
        ...prev,
        routes: prev.routes.filter((_, i) => i !== index)
      }));
    }
  };

  const deleteTrip = async (tripId: string, tripTitle: string) => {
    // Show confirmation dialog
    setTripDeleteDialog({
      isOpen: true,
      tripId,
      tripTitle
    });
  };

  const confirmTripDeletion = async () => {
    if (!tripDeleteDialog) return;

    // Set loading state
    setTripDeleteDialog(prev => prev ? { ...prev, isDeleting: true } : null);

    try {
      const response = await fetch(`/api/travel-data?id=${tripDeleteDialog.tripId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        const result = await response.json();
        
        // Show success notification
        showNotification(`✅ ${result.message}`, 'success');
        
        // Refresh the trip list
        await loadExistingTrips();
        
        // Close dialog
        setTripDeleteDialog(null);
      } else {
        const error = await response.json();
        console.error('Delete failed:', error);
        showNotification(`❌ Failed to delete trip: ${error.error}`, 'error');
        
        // Reset loading state but keep dialog open
        setTripDeleteDialog(prev => prev ? { ...prev, isDeleting: false } : null);
      }
    } catch (error) {
      console.error('Delete error:', error);
      showNotification(`❌ Error deleting trip: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      
      // Reset loading state but keep dialog open
      setTripDeleteDialog(prev => prev ? { ...prev, isDeleting: false } : null);
    }
  };


  const generateMap = async () => {
    try {
      const method = mode === 'edit' ? 'PUT' : 'POST';
      const url = mode === 'edit' ? `/api/travel-data?id=${travelData.id}` : '/api/travel-data';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(travelData),
      });
      
      if (response.ok) {
        const result = await response.json();
        setHasUnsavedChanges(false); // Mark as saved
        
        // Use the proper helper function and open the map
        const mapUrl = getMapUrl(result.id);
        window.open(mapUrl, '_blank');
      } else {
        const errorText = await response.text();
        console.error('Save failed:', response.status, errorText);
        alert(`Error saving map: ${response.status} ${errorText}`);
      }
    } catch (error) {
      console.error('Error:', error);
      alert(`Error saving map: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const geocodeLocation = async (locationName: string) => {
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationName)}&limit=1`);
      const data = await response.json();
      if (data && data.length > 0) {
        return [parseFloat(data[0].lat), parseFloat(data[0].lon)] as [number, number];
      }
    } catch (error) {
      console.error('Geocoding error:', error);
    }
    return [0, 0] as [number, number];
  };


  // List view
  if (mode === 'list') {
    return (
      <>
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
                        You are about to delete the trip <strong>"{tripDeleteDialog.tripTitle}"</strong>. 
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
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Travel Maps</h2>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  setLoading(true);
                  await loadExistingTrips();
                  setLoading(false);
                }}
                disabled={loading}
                className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Refresh'}
              </button>
              <button
                onClick={() => {
                  setMode('create');
                  setHasUnsavedChanges(false); // New form, no changes yet
                }}
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
                  onClick={() => {
                    setMode('create');
                    setHasUnsavedChanges(false); // New form, no changes yet
                  }}
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
                      onClick={() => loadTripForEditing(trip.id)}
                      className="flex-1 px-3 py-2 bg-blue-500 dark:bg-blue-600 text-white rounded-sm text-sm hover:bg-blue-600 dark:hover:bg-blue-700"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        const mapUrl = getMapUrl(trip.id);
                        window.open(mapUrl, '_blank');
                      }}
                      className="flex-1 px-3 py-2 bg-green-500 dark:bg-green-600 text-white rounded-sm text-sm hover:bg-green-600 dark:hover:bg-green-700"
                    >
                      View
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

  // Create/Edit form
  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold">
            {mode === 'edit' ? 'Edit Travel Map' : 'Create New Travel Map'}
          </h2>
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
          {!autoSaving && !hasUnsavedChanges && (mode === 'edit' || (mode === 'create' && travelData.id)) && (
            <div className="flex items-center gap-2 text-green-600">
              <div className="w-2 h-2 bg-green-600 rounded-full"></div>
              <span className="text-sm">Saved</span>
            </div>
          )}
        </div>
        <button
          onClick={() => {
            setMode('list');
            setTravelData({
              title: '',
              description: '',
              startDate: '',
              endDate: '',
              locations: [],
              routes: []
            });
            setHasUnsavedChanges(false); // Reset state
          }}
          className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
        >
          ← Back to List
        </button>
      </div>

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
              onChange={(e) => setTravelData(prev => ({ ...prev, title: e.target.value }))}
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
              onChange={(e) => setTravelData(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              placeholder="A wonderful journey across..."
            />
          </div>
          <div>
            <label htmlFor="journey-start-date" className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input
              id="journey-start-date"
              type="date"
              value={travelData.startDate}
              onChange={(e) => setTravelData(prev => ({ ...prev, startDate: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="journey-end-date" className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <input
              id="journey-end-date"
              type="date"
              value={travelData.endDate}
              onChange={(e) => setTravelData(prev => ({ ...prev, endDate: e.target.value }))}
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
                <div key={location.id} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h5 className="font-medium text-gray-900 dark:text-white">{location.name}</h5>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        <p>{new Date(location.date).toLocaleDateString()}</p>
                        {location.endDate && (
                          <p>to {new Date(location.endDate).toLocaleDateString()}</p>
                        )}
                        {location.duration && (
                          <p className="text-blue-600">({formatDuration(location.duration, location.date, location.endDate)})</p>
                        )}
                      </div>
                      {location.notes && (
                        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{location.notes}</p>
                      )}
                      
                      {/* Accommodation Display */}
                      {location.accommodationData && (
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
                      <LinkedExpensesDisplay
                        items={[
                          { itemType: 'location', itemId: location.id },
                          ...((location.accommodationIds || []).map((accId: string) => ({ itemType: 'accommodation', itemId: accId })) as { itemType: 'accommodation', itemId: string }[])
                        ]}
                        travelLookup={travelLookup}
                        costData={costData}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => editLocation(index)}
                        className="text-blue-500 hover:text-blue-700 text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setSelectedLocationForPosts(selectedLocationForPosts === index ? null : index)}
                        className="text-green-500 hover:text-green-700 text-sm"
                      >
                        Posts
                      </button>
                      <button
                        onClick={() => deleteLocation(index)}
                        className="text-red-500 hover:text-red-700 text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

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
            <div className="space-y-2">
              {travelData.routes
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                .map((route, index) => (
                <div key={route.id} className="flex justify-between items-center bg-white dark:bg-gray-800 p-3 rounded-sm border dark:border-gray-700">
                  <div>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {route.transportType === 'plane' && '✈️'}
                      {route.transportType === 'train' && '🚆'}
                      {route.transportType === 'car' && '🚗'}
                      {route.transportType === 'bus' && '🚌'}
                      {route.transportType === 'ferry' && '⛴️'}
                      {route.transportType === 'boat' && '🛥️'}
                      {route.transportType === 'metro' && '🚇'}
                      {route.transportType === 'bike' && '🚴'}
                      {route.transportType === 'walk' && '🚶'}
                      {' '}{route.from} → {route.to}
                    </span>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {new Date(route.date).toLocaleDateString()}
                      {route.duration && ` • ${route.duration}`}
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      From: [{route.fromCoords[0].toFixed(4)}, {route.fromCoords[1].toFixed(4)}] → 
                      To: [{route.toCoords[0].toFixed(4)}, {route.toCoords[1].toFixed(4)}]
                    </div>
                    {route.notes && (
                      <p className="text-sm text-gray-600 dark:text-gray-300 mt-1"><strong>Public:</strong> {route.notes}</p>
                    )}
                    {route.privateNotes && (
                      <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                        <strong>Private:</strong> {route.privateNotes}
                        <span className="text-xs bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 px-2 py-1 rounded ml-2">Admin Only</span>
                      </p>
                    )}
                    
                    {/* Linked Expenses Display */}
                    <LinkedExpensesDisplay
                      itemId={route.id}
                      itemType="route"
                      itemName={`${route.from} → ${route.to}`}
                      travelLookup={travelLookup}
                      costData={costData}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => editRoute(index)}
                      className="text-blue-500 hover:text-blue-700 text-sm"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteRoute(index)}
                      className="text-red-500 hover:text-red-700 text-sm"
                    >
                      Delete
                    </button>
                  </div>
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
      
      {/* Safe Deletion Dialogs */}
      {deleteDialog && (
        <DeleteWarningDialog
          isOpen={deleteDialog.isOpen}
          itemType={deleteDialog.itemType}
          itemName={deleteDialog.itemName}
          linkedExpenses={deleteDialog.linkedExpenses}
          onChoice={async (choice) => {
            if (choice === 'cancel') {
              setDeleteDialog(null);
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
              
              setDeleteDialog(null);
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
                  
                  setDeleteDialog(null);
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
            setDeleteDialog(null);
          }}
        />
      )}

      {/* Toast Notification */}
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
  );
} 