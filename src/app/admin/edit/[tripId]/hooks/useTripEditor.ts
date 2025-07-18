
'use client';

import { useState, useEffect, useCallback } from 'react';
import { getMapUrl } from '@/app/lib/domains';
import { calculateSmartDurations } from '@/app/lib/durationUtils';
import { Location, InstagramPost, BlogPost, TravelRoute, TravelData, Transportation } from '@/app/types';
import { getLinkedExpenses, cleanupExpenseLinks, reassignExpenseLinks, LinkedExpense } from '@/app/lib/costLinkCleanup';
import { CostTrackingData } from '@/app/types';
import { ExpenseTravelLookup } from '@/app/lib/expenseTravelLookup';
import { generateRoutePoints } from '@/app/lib/routeUtils';

interface ExistingTrip {
  id: string;
  title: string;
  description: string;
  startDate: Date;
  endDate: Date;
  createdAt: string;
}

export function useTripEditor(tripId: string | null) {
  const [mode, setMode] = useState<'create' | 'edit' | 'list'>('list');
  const [existingTrips, setExistingTrips] = useState<ExistingTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoSaving, setAutoSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [travelData, setTravelData] = useState<TravelData>({
    title: '',
    description: '',
    startDate: new Date(),
    endDate: new Date(),
    locations: [],
    routes: []
  });
  const [costData, setCostData] = useState<CostTrackingData | null>(null);
  const [travelLookup, setTravelLookup] = useState<ExpenseTravelLookup | null>(null);
  
  const [currentLocation, setCurrentLocation] = useState<Partial<Location>>({
    name: '',
    coordinates: [0, 0],
    date: new Date(),
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
    date: new Date(),
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

  const migrateOldFormat = useCallback((tripData: Partial<TravelData>): TravelData => {
    // Migrate locations to new format if they don't have IDs
    const migratedLocations = tripData.locations?.map((location: Partial<Location>) => ({
      id: location.id || generateId(),
      name: location.name || '',
      coordinates: location.coordinates || [0, 0] as [number, number],
      date: location.date ? (location.date instanceof Date ? location.date : new Date(location.date)) : new Date(),
      endDate: location.endDate ? (location.endDate instanceof Date ? location.endDate : new Date(location.endDate)) : undefined,
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
      date: route.date ? (route.date instanceof Date ? route.date : new Date(route.date)) : new Date(),
      duration: route.duration,
      notes: route.notes || '',
      privateNotes: route.privateNotes,
      costTrackingLinks: route.costTrackingLinks || [],
      routePoints: route.routePoints // Preserve existing routePoints
    })) || [];

    return {
      id: tripData.id,
      title: tripData.title || '',
      description: tripData.description || '',
      startDate: tripData.startDate ? (tripData.startDate instanceof Date ? tripData.startDate : new Date(tripData.startDate)) : new Date(),
      endDate: tripData.endDate ? (tripData.endDate instanceof Date ? tripData.endDate : new Date(tripData.endDate)) : new Date(),
      locations: migratedLocations,
      routes: migratedRoutes
    };
  }, []);

  const loadExistingTrips = useCallback(async () => {
    setLoading(true);
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
    } finally {
        setLoading(false);
    }
  }, []);

  const loadTripForEditing = useCallback(async (tripId: string) => {
    setLoading(true);
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
          
          // Load unified trip data to get accommodations
          let accommodations: any[] = [];
          try {
            const unifiedResponse = await fetch(`/api/travel-data?id=${tripId}`);
            if (unifiedResponse.ok) {
              const unifiedData = await unifiedResponse.json();
              accommodations = unifiedData.accommodations || [];
            }
          } catch (error) {
            console.warn('Could not load accommodations for travel lookup:', error);
          }
          
          // Initialize travel lookup with trip data
          // Convert TravelRoute[] to Transportation[] for compatibility
          const transportationRoutes = tripData.routes.map(route => ({
            id: route.id,
            type: route.transportType,
            from: route.from,
            to: route.to,
            fromCoordinates: route.fromCoords,
            toCoordinates: route.toCoords,
            costTrackingLinks: route.costTrackingLinks
          }));
          
          const lookup = new ExpenseTravelLookup(costData.tripId, {
            title: tripData.title,
            locations: tripData.locations,
            accommodations: accommodations,
            routes: transportationRoutes
          });
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
    } finally {
        setLoading(false);
    }
  }, [migrateOldFormat]);

  useEffect(() => {
    if (tripId) {
        loadTripForEditing(tripId);
    } else {
        loadExistingTrips();
    }
  }, [tripId, loadTripForEditing, loadExistingTrips]);

  const generateId = () => Date.now().toString(36) + Math.random().toString(36).substring(2, 11);

  const autoSaveTravelData = useCallback(async () => {
    try {
      const method = mode === 'edit' ? 'PUT' : 'POST';
      const url = mode === 'edit' ? `/api/travel-data?id=${travelData.id}` : '/api/travel-data';
      
      // Log what we're about to send
      console.log(`[autoSaveTravelData] Saving ${travelData.routes.length} routes`);
      travelData.routes.forEach((route, index) => {
        console.log(`[autoSaveTravelData] Route ${index} (${route.id}): ${route.from} → ${route.to}, routePoints: ${route.routePoints?.length || 'undefined'}`);
      });
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(travelData),
      });
      
      if (response.ok) {
        const result = await response.json();
        // Update ID if creating new trip
        if (mode === 'create' && result.id) {
          setTravelData(prev => ({ ...prev, id: result.id }));
          setMode('edit');
        }
        return true;
      } else {
        console.error('Auto-save failed:', response.status);
        return false;
      }
    } catch (error) {
      console.error('Auto-save error:', error);
      return false;
    }
  }, [mode, travelData]);

  // Auto-save effect for edit mode (debounced)
  useEffect(() => {
    // Only auto-save if we're in edit mode or create mode with sufficient data
    const canAutoSave = (mode === 'edit' && travelData.id) || 
                       (mode === 'create' && travelData.title);
    
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
    // Return undefined cleanup function for other code paths
    return undefined;
  }, [travelData, mode, hasUnsavedChanges, autoSaveTravelData]);

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
    setHasUnsavedChanges(true);
  };

  const handleRouteAdded = async (newRoute: TravelRoute) => {
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

    // Pre-generate route points for better public map performance
    try {
      const transportation: Transportation = {
        id: newRoute.id,
        type: newRoute.transportType,
        from: newRoute.from,
        to: newRoute.to,
        fromCoordinates: newRoute.fromCoords,
        toCoordinates: newRoute.toCoords
      };
      
      console.log(`[handleRouteAdded] Generating route points for ${newRoute.from} → ${newRoute.to}`);
      const routePoints = await generateRoutePoints(transportation);
      newRoute.routePoints = routePoints;
      console.log(`[handleRouteAdded] Generated ${routePoints.length} route points, assigned to newRoute`);
      console.log(`[handleRouteAdded] newRoute.routePoints length:`, newRoute.routePoints?.length);
    } catch (error) {
      console.warn('Failed to pre-generate route points:', error);
      // Don't block route creation if route generation fails
      newRoute.routePoints = [newRoute.fromCoords, newRoute.toCoords];
      console.log(`[handleRouteAdded] Fallback: assigned ${newRoute.routePoints?.length} fallback points`);
    }

    if (editingRouteIndex !== null) {
      // Update existing route
      const updatedRoutes = [...travelData.routes];
      updatedRoutes[editingRouteIndex] = newRoute;
      console.log(`[handleRouteAdded] Updating route at index ${editingRouteIndex}, routePoints: ${newRoute.routePoints?.length}`);
      setTravelData(prev => ({ ...prev, routes: updatedRoutes, locations: updatedLocations }));
      setEditingRouteIndex(null);
    } else {
      // Add new route
      console.log(`[handleRouteAdded] Adding new route, routePoints: ${newRoute.routePoints?.length}`);
      setTravelData(prev => ({
        ...prev,
        routes: [...prev.routes, newRoute],
        locations: updatedLocations
      }));
    }
    setHasUnsavedChanges(true);
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
      setHasUnsavedChanges(true);
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
      setHasUnsavedChanges(true);
    }
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
      setHasUnsavedChanges(true);
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
      setHasUnsavedChanges(true);
    }
  };

  const recalculateRoutePoints = async (index: number) => {
    const route = travelData.routes[index];
    
    try {
      // Create transportation object for route generation
      const transportation: Transportation = {
        id: route.id,
        type: route.transportType,
        from: route.from,
        to: route.to,
        fromCoordinates: route.fromCoords,
        toCoordinates: route.toCoords
      };
      
      console.log(`[recalculateRoutePoints] Regenerating route points for ${route.from} → ${route.to}`);
      const routePoints = await generateRoutePoints(transportation);
      
      // Update the route with new route points
      setTravelData(prev => ({
        ...prev,
        routes: prev.routes.map((r, i) => 
          i === index ? { ...r, routePoints } : r
        )
      }));
      
      setHasUnsavedChanges(true);
      console.log(`[recalculateRoutePoints] Successfully regenerated ${routePoints.length} route points`);
      
      // Show success notification
      showNotification('Route points recalculated successfully', 'success');
    } catch (error) {
      console.error('Failed to recalculate route points:', error);
      showNotification('Failed to recalculate route points', 'error');
    }
  };

  // Note: deleteTrip and confirmTripDeletion are handled by TripList component
  // These are legacy exports that should be removed in future refactoring

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

  // Wrapper functions for imported utilities
  const getMapUrlWrapper = (tripId: string) => getMapUrl(tripId);
  const calculateSmartDurationsWrapper = (locations: Location[], routes: TravelRoute[]) => 
    calculateSmartDurations(locations, routes);
  const cleanupExpenseLinksWrapper = (itemType: 'location' | 'route', itemId: string) => 
    cleanupExpenseLinks(itemType, itemId);
  const reassignExpenseLinksWrapper = (fromItemType: 'location' | 'route', fromItemId: string, toItemType: 'location' | 'route', toItemId: string, toItemName: string) => 
    reassignExpenseLinks(fromItemType, fromItemId, toItemType, toItemId, toItemName);

  return {
    mode,
    setMode,
    existingTrips,
    loading,
    setLoading,
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
    setDeleteDialog,
    notification,
    setNotification,
    showNotification,
    reassignDialog,
    setReassignDialog,
    loadExistingTrips,
    loadTripForEditing,
    handleLocationAdded,
    handleRouteAdded,
    addInstagramPost,
    addBlogPost,
    deleteLocation,
    deleteRoute,
    recalculateRoutePoints,
    generateMap,
    autoSaveTravelData,
    geocodeLocation,
    getMapUrl: getMapUrlWrapper,
    calculateSmartDurations: calculateSmartDurationsWrapper,
    cleanupExpenseLinks: cleanupExpenseLinksWrapper,
    reassignExpenseLinks: reassignExpenseLinksWrapper,
  };
}
