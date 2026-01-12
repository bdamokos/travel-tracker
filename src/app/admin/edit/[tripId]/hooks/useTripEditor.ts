'use client';

import { useState, useEffect, useCallback } from 'react';
import { getMapUrl } from '@/app/lib/domains';
import { calculateSmartDurations } from '@/app/lib/durationUtils';
import { Location, InstagramPost, BlogPost, TikTokPost, TravelRoute, TravelRouteSegment, TravelData, Transportation, Accommodation } from '@/app/types';
import { getLinkedExpenses, cleanupExpenseLinks, reassignExpenseLinks, LinkedExpense } from '@/app/lib/costLinkCleanup';
import { CostTrackingData } from '@/app/types';
import { ExpenseTravelLookup } from '@/app/lib/expenseTravelLookup';
import { generateRoutePoints } from '@/app/lib/routeUtils';
import { generateId } from '@/app/lib/costUtils';

interface ExistingTrip {
  id: string;
  title: string;
  description: string;
  startDate: Date;
  endDate: Date;
  createdAt: string;
}

/**
 * Provides state and handlers for creating, editing, and listing travel trips.
 *
 * Initializes and manages travel-related state (trip metadata, locations, routes, accommodations,
 * cost tracking, UI dialogs, and post drafts), performs data migration and loading, and exposes
 * helpers for autosave, map generation, geocoding, and expense-link management.
 *
 * @param tripId - The ID of the trip to load for editing; pass `null` to operate in list/create mode.
 * @returns An object containing current mode and loading flags, travel data and lookup helpers,
 *          setters for UI/dialog state, and handler functions (loadExistingTrips, loadTripForEditing,
 *          handleLocationAdded, handleRouteAdded, addInstagramPost, addTikTokPost, addBlogPost,
 *          deleteLocation, deleteRoute, recalculateRoutePoints, generateMap, autoSaveTravelData,
 *          geocodeLocation, and wrappers for map URL, duration calculation, and expense-link utilities).
 */
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
    instagramUsername: '',
    locations: [],
    routes: [],
    accommodations: []
  });
  const [costData, setCostData] = useState<CostTrackingData | null>(null);
  const [travelLookup, setTravelLookup] = useState<ExpenseTravelLookup | null>(null);
  
  const [currentLocation, setCurrentLocation] = useState<Partial<Location>>({
    name: '',
    coordinates: [0, 0],
    date: new Date(),
    notes: '',
    instagramPosts: [],
    tikTokPosts: [],
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
    costTrackingLinks: [],
    useManualRoutePoints: false
  });

  const [editingLocationIndex, setEditingLocationIndex] = useState<number | null>(null);
  const [editingRouteIndex, setEditingRouteIndex] = useState<number | null>(null);
  const [selectedLocationForPosts, setSelectedLocationForPosts] = useState<string | null>(null);
  
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

  const [newTikTokPost, setNewTikTokPost] = useState<Partial<TikTokPost>>({
    url: '',
    caption: ''
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
      tikTokPosts: location.tikTokPosts || [],
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
      routePoints: route.routePoints, // Preserve existing routePoints
      useManualRoutePoints: route.useManualRoutePoints,
      isReturn: route.isReturn,
      subRoutes: route.subRoutes?.map((segment: Partial<TravelRouteSegment>) => ({
        id: segment.id || generateId(),
        from: segment.from || '',
        to: segment.to || '',
        fromCoords: segment.fromCoords || [0, 0] as [number, number],
        toCoords: segment.toCoords || [0, 0] as [number, number],
        transportType: segment.transportType || route.transportType || 'car',
        date: segment.date
          ? (segment.date instanceof Date ? segment.date : new Date(segment.date))
          : (route.date ? (route.date instanceof Date ? route.date : new Date(route.date)) : new Date()),
        duration: segment.duration,
        notes: segment.notes || '',
        privateNotes: segment.privateNotes,
        costTrackingLinks: segment.costTrackingLinks || [],
        routePoints: segment.routePoints,
        useManualRoutePoints: segment.useManualRoutePoints,
        isReturn: segment.isReturn,
        isReadOnly: segment.isReadOnly
      }))
    })) || [];

    return {
      id: tripData.id,
      title: tripData.title || '',
      description: tripData.description || '',
      startDate: tripData.startDate ? (tripData.startDate instanceof Date ? tripData.startDate : new Date(tripData.startDate)) : new Date(),
      endDate: tripData.endDate ? (tripData.endDate instanceof Date ? tripData.endDate : new Date(tripData.endDate)) : new Date(),
      instagramUsername: tripData.instagramUsername || '',
      locations: migratedLocations,
      routes: migratedRoutes,
      accommodations: tripData.accommodations || []
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
          
          // Use accommodations from the already-fetched raw trip data (available after migration).
          const accommodations: Accommodation[] = rawTripData.accommodations || [];
          
          // Initialize travel lookup with trip data
          // Convert TravelRoute[] to Transportation[] for compatibility
          const transportationRoutes = tripData.routes.map(route => ({
            id: route.id,
            type: route.transportType,
            from: route.from,
            to: route.to,
            fromCoordinates: route.fromCoords,
            toCoordinates: route.toCoords,
            costTrackingLinks: route.costTrackingLinks,
            subRoutes: route.subRoutes?.map(segment => ({
              id: segment.id,
              type: segment.transportType,
              from: segment.from,
              to: segment.to,
              fromCoordinates: segment.fromCoords,
              toCoordinates: segment.toCoords,
              costTrackingLinks: segment.costTrackingLinks
            }))
          }));
          
          const lookup = new ExpenseTravelLookup(costData.tripId, {
            title: tripData.title,
            locations: tripData.locations,
            accommodations: accommodations,
            routes: transportationRoutes,
            costData: {
              expenses: costData.expenses
            }
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

  const autoSaveTravelData = useCallback(async () => {
    try {
      const method = mode === 'edit' ? 'PUT' : 'POST';
      const url = mode === 'edit' ? `/api/travel-data?id=${travelData.id}` : '/api/travel-data';
      
      const debugAutoSave = process.env.NEXT_PUBLIC_DEBUG_AUTOSAVE === 'true';
      if (debugAutoSave) {
        console.log(`[autoSaveTravelData] Saving ${travelData.routes.length} routes`);
        travelData.routes.forEach((route, index) => {
          console.log(
            `[autoSaveTravelData] Route ${index} (${route.id}): ${route.from} → ${route.to}, routePoints: ${
              route.routePoints?.length || 'undefined'
            }`
          );
        });
      }
      
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
    const endpointCandidates = newRoute.subRoutes?.length
      ? newRoute.subRoutes.flatMap(segment => ([
          { name: segment.from, coords: segment.fromCoords, date: segment.date },
          { name: segment.to, coords: segment.toCoords, date: segment.date }
        ]))
      : [
          { name: newRoute.from, coords: newRoute.fromCoords, date: newRoute.date },
          { name: newRoute.to, coords: newRoute.toCoords, date: newRoute.date }
        ];

    endpointCandidates.forEach(endpoint => {
      if (!endpoint.name.trim()) return;
      const exists = updatedLocations.some(loc => 
        loc.name.toLowerCase().trim() === endpoint.name.toLowerCase().trim()
      );

      if (!exists && endpoint.coords && (endpoint.coords[0] !== 0 || endpoint.coords[1] !== 0)) {
        const newLocation: Location = {
          id: generateId(),
          name: endpoint.name,
          coordinates: endpoint.coords,
          date: endpoint.date,
          notes: '',
          instagramPosts: [],
          tikTokPosts: [],
          blogPosts: [],
          accommodationData: '',
          isAccommodationPublic: false,
          costTrackingLinks: []
        };
        updatedLocations.push(newLocation);
      }
    });

    const ensureRoutePoints = async <T extends TravelRouteSegment>(segment: T): Promise<T> => {
      const hasManualSegment = segment.useManualRoutePoints && (segment.routePoints?.length || 0) > 0;
      if (hasManualSegment) {
        return segment;
      }

      try {
        const transportation: Transportation = {
          id: segment.id,
          type: segment.transportType,
          from: segment.from,
          to: segment.to,
          fromCoordinates: segment.fromCoords,
          toCoordinates: segment.toCoords,
          useManualRoutePoints: segment.useManualRoutePoints
        };

        console.log(`[handleRouteAdded] Generating route points for ${segment.from} → ${segment.to}`);
        const routePoints = await generateRoutePoints(transportation);
        return {
          ...segment,
          routePoints,
          useManualRoutePoints: false
        } as T;
      } catch (error) {
        console.warn('Failed to pre-generate route points:', error);
        // Don't block route creation if route generation fails
        return {
          ...segment,
          routePoints: [segment.fromCoords, segment.toCoords],
          useManualRoutePoints: false
        } as T;
      }
    };

    // Pre-generate route points for better public map performance (skip when manual override provided)
    let routeToSave: TravelRoute;
    if (newRoute.subRoutes?.length) {
      const updatedSubRoutes = await Promise.all(newRoute.subRoutes.map(async (segment) => ensureRoutePoints(segment)));
      routeToSave = {
        ...newRoute,
        subRoutes: updatedSubRoutes,
        routePoints: undefined,
        useManualRoutePoints: false
      };
    } else {
      routeToSave = await ensureRoutePoints(newRoute);
    }

    if (editingRouteIndex !== null) {
      // Update existing route
      const updatedRoutes = [...travelData.routes];
      updatedRoutes[editingRouteIndex] = routeToSave;
      console.log(`[handleRouteAdded] Updating route at index ${editingRouteIndex}, routePoints: ${routeToSave.routePoints?.length}`);
      setTravelData(prev => ({ ...prev, routes: updatedRoutes, locations: updatedLocations }));
      setEditingRouteIndex(null);
    } else {
      // Add new route
      console.log(`[handleRouteAdded] Adding new route, routePoints: ${routeToSave.routePoints?.length}`);
      setTravelData(prev => ({
        ...prev,
        routes: [...prev.routes, routeToSave],
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

  const addTikTokPost = (locationIndex: number) => {
    if (newTikTokPost.url) {
      const post: TikTokPost = {
        id: generateId(),
        url: newTikTokPost.url,
        caption: newTikTokPost.caption || ''
      };

      const updatedLocations = [...travelData.locations];
      updatedLocations[locationIndex].tikTokPosts = [
        ...(updatedLocations[locationIndex].tikTokPosts || []),
        post
      ];

      setTravelData(prev => ({ ...prev, locations: updatedLocations }));
      setNewTikTokPost({ url: '', caption: '' });
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
    const subRouteIds = route.subRoutes?.map(segment => segment.id) || [];
    const subRouteExpenseResults = await Promise.all(
      subRouteIds.map(id => getLinkedExpenses('route', id))
    );
    const combinedExpenses = [
      ...linkedExpenses,
      ...subRouteExpenseResults.flat()
    ];
    
    if (combinedExpenses.length > 0) {
      // Show safe deletion dialog
      setDeleteDialog({
        isOpen: true,
        itemType: 'route',
        itemIndex: index,
        itemId: route.id,
        itemName: `${route.from} → ${route.to}`,
        linkedExpenses: combinedExpenses
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

    if (route.subRoutes?.length) {
      const hasManualSegments = route.subRoutes.some(segment =>
        segment.useManualRoutePoints && (segment.routePoints?.length || 0) > 0
      );

      if (hasManualSegments) {
        const proceed = confirm('One or more segments use manually imported coordinates. Recalculating will overwrite them. Continue?');
        if (!proceed) {
          showNotification('Manual segment routes kept. No changes made.', 'info');
          return;
        }
      }

      try {
        const updatedSubRoutes = await Promise.all(route.subRoutes.map(async (segment) => {
          const transportation: Transportation = {
            id: segment.id,
            type: segment.transportType,
            from: segment.from,
            to: segment.to,
            fromCoordinates: segment.fromCoords,
            toCoordinates: segment.toCoords,
            useManualRoutePoints: false
          };

          console.log(`[recalculateRoutePoints] Regenerating segment route points for ${segment.from} → ${segment.to}`);
          const routePoints = await generateRoutePoints(transportation);
          return {
            ...segment,
            routePoints,
            useManualRoutePoints: false
          };
        }));

        setTravelData(prev => ({
          ...prev,
          routes: prev.routes.map((r, i) =>
            i === index ? { ...r, subRoutes: updatedSubRoutes, routePoints: undefined, useManualRoutePoints: false } : r
          )
        }));

        setHasUnsavedChanges(true);
        console.log(`[recalculateRoutePoints] Successfully regenerated ${updatedSubRoutes.length} segment routes`);
        showNotification('Segment route points recalculated successfully', 'success');
      } catch (error) {
        console.error('Failed to recalculate segment route points:', error);
        showNotification('Failed to recalculate segment route points', 'error');
      }
      return;
    }

    // Protect manual imports from silent overwrite
    if (route.useManualRoutePoints && (route.routePoints?.length || 0) > 0) {
      const proceed = confirm('This route uses manually imported coordinates. Recalculating will overwrite them. Continue?');
      if (!proceed) {
        showNotification('Manual route kept. No changes made.', 'info');
        return;
      }
    }
    
    try {
      // Create transportation object for route generation
      const transportation: Transportation = {
        id: route.id,
        type: route.transportType,
        from: route.from,
        to: route.to,
        fromCoordinates: route.fromCoords,
        toCoordinates: route.toCoords,
        useManualRoutePoints: false
      };
      
      console.log(`[recalculateRoutePoints] Regenerating route points for ${route.from} → ${route.to}`);
      const routePoints = await generateRoutePoints(transportation);
      
      // Update the route with new route points
      setTravelData(prev => ({
        ...prev,
        routes: prev.routes.map((r, i) => 
          i === index ? { ...r, routePoints, useManualRoutePoints: false } : r
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
    newTikTokPost,
    setNewTikTokPost,
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
    addTikTokPost,
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
