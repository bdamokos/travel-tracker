'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getMapUrl } from '@/app/lib/domains';
import { calculateSmartDurations } from '@/app/lib/durationUtils';
import { Location, InstagramPost, BlogPost, TikTokPost, TravelRoute, TravelRouteSegment, TravelData, Transportation, Accommodation } from '@/app/types';
import { getLinkedExpenses, cleanupExpenseLinks, reassignExpenseLinks, LinkedExpense } from '@/app/lib/costLinkCleanup';
import { CostTrackingData } from '@/app/types';
import { ExpenseTravelLookup } from '@/app/lib/expenseTravelLookup';
import { generateRoutePoints, getCompositeTransportType } from '@/app/lib/routeUtils';
import { generateId } from '@/app/lib/costUtils';
import { geocodeLocation as geocodeLocationService } from '@/app/services/geocoding';
import { getTodayLocalDay, parseDateAsLocalDay } from '@/app/lib/localDateUtils';
import { createTravelDataDelta, isTravelDataDeltaEmpty, snapshotTravelData } from '@/app/lib/travelDataDelta';
import {
  formatOfflineConflictMessage,
  hasPendingOfflineDeltaForTravelId,
  queueTravelDelta,
  syncOfflineDeltaQueue
} from '@/app/lib/offlineDeltaSync';

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
    startDate: getTodayLocalDay(),
    endDate: getTodayLocalDay(),
    instagramUsername: '',
    locations: [],
    routes: [],
    accommodations: []
  });
  const [costData, setCostData] = useState<CostTrackingData | null>(null);
  const [travelLookup, setTravelLookup] = useState<ExpenseTravelLookup | null>(null);
  const lastSavedTravelDataRef = useRef<TravelData | null>(null);
  
  const [currentLocation, setCurrentLocation] = useState<Partial<Location>>({
    name: '',
    coordinates: [0, 0],
    date: getTodayLocalDay(),
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
    date: getTodayLocalDay(),
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
      date: parseDateAsLocalDay(location.date) || getTodayLocalDay(),
      endDate: parseDateAsLocalDay(location.endDate) || undefined,
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
    const migratedRoutes = tripData.routes?.map((route: Partial<TravelRoute>) => {
      const hasSubRoutes = (route.subRoutes?.length || 0) > 0;
      const routeTransportType = hasSubRoutes
        ? getCompositeTransportType(route.subRoutes ?? [], route.transportType || 'car')
        : (route.transportType || 'car');

      return {
        id: route.id || generateId(),
        from: route.from || '',
        to: route.to || '',
        fromCoords: route.fromCoords || [0, 0] as [number, number],
        toCoords: route.toCoords || [0, 0] as [number, number],
        transportType: routeTransportType,
        date: parseDateAsLocalDay(route.date) || getTodayLocalDay(),
        duration: route.duration,
        distanceOverride: route.distanceOverride,
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
          transportType: segment.transportType || (routeTransportType !== 'multimodal' ? routeTransportType : undefined) || 'car',
          date: segment.date
            ? (parseDateAsLocalDay(segment.date) || getTodayLocalDay())
            : (parseDateAsLocalDay(route.date) || getTodayLocalDay()),
          duration: segment.duration,
          distanceOverride: segment.distanceOverride,
          notes: segment.notes || '',
          privateNotes: segment.privateNotes,
          costTrackingLinks: segment.costTrackingLinks || [],
          routePoints: segment.routePoints,
          useManualRoutePoints: segment.useManualRoutePoints,
          isReturn: segment.isReturn,
          isReadOnly: segment.isReadOnly
        }))
      };
    }) || [];

    return {
      id: tripData.id,
      title: tripData.title || '',
      description: tripData.description || '',
      startDate: parseDateAsLocalDay(tripData.startDate) || getTodayLocalDay(),
      endDate: parseDateAsLocalDay(tripData.endDate) || getTodayLocalDay(),
      instagramUsername: tripData.instagramUsername || '',
      locations: migratedLocations,
      routes: migratedRoutes,
      accommodations: tripData.accommodations || []
    };
  }, []);

  const loadExistingTrips = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/travel-data/list', { cache: 'no-store' });
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
      const response = await fetch(`/api/travel-data?id=${tripId}`, { cache: 'no-store' });
      if (response.ok) {
        const rawTripData = await response.json();
        const tripData = migrateOldFormat(rawTripData);
        setTravelData(tripData);
        lastSavedTravelDataRef.current = snapshotTravelData(tripData);

        // Load cost data for this trip
        const costResponse = await fetch(`/api/cost-tracking?id=${tripId}`, { cache: 'no-store' });
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
    type SaveAttemptResult = 'persisted' | 'queued' | 'failed';

    if (
      mode === 'edit' &&
      travelData.id &&
      typeof navigator !== 'undefined' &&
      !navigator.onLine &&
      hasPendingOfflineDeltaForTravelId(travelData.id)
    ) {
      return false;
    }

    const tryQueueOfflineDelta = (): SaveAttemptResult => {
      if (mode !== 'edit' || !travelData.id || !lastSavedTravelDataRef.current) {
        return 'failed';
      }

      const queued = queueTravelDelta({
        id: travelData.id,
        baseSnapshot: lastSavedTravelDataRef.current,
        pendingSnapshot: travelData
      });

      if (queued.queued) {
        console.warn('Auto-save queued offline travel delta for later sync:', travelData.id);
        return 'queued';
      }

      return 'failed';
    };

    const saveFullTravelData = async (): Promise<{ state: SaveAttemptResult; savedId?: string }> => {
      const method = mode === 'edit' ? 'PUT' : 'POST';
      const url = mode === 'edit' ? `/api/travel-data?id=${travelData.id}` : '/api/travel-data';

      let response: Response;
      try {
        response = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(travelData),
        });
      } catch (error) {
        console.warn('Auto-save (full) network failure, queuing offline delta:', error);
        const queuedState = tryQueueOfflineDelta();
        return { state: queuedState, savedId: queuedState === 'queued' ? travelData.id : undefined };
      }

      if (!response.ok) {
        const shouldQueue = response.status === 503 || (typeof navigator !== 'undefined' && !navigator.onLine);
        if (shouldQueue) {
          const queuedState = tryQueueOfflineDelta();
          return { state: queuedState, savedId: queuedState === 'queued' ? travelData.id : undefined };
        }

        let errorDetails = '';
        try {
          const errorBody = await response.text();
          errorDetails = errorBody;
        } catch {
          errorDetails = '';
        }
        console.error('Auto-save (full) failed:', response.status, errorDetails);
        return { state: 'failed' };
      }

      const result = await response.json();
      const savedId: string | undefined = result.id;

      if (mode === 'create' && savedId) {
        setTravelData(prev => ({ ...prev, id: savedId }));
        setMode('edit');
      }

      return { state: 'persisted', savedId };
    };

    const saveDeltaTravelData = async (): Promise<SaveAttemptResult> => {
      if (mode !== 'edit' || !travelData.id || !lastSavedTravelDataRef.current) {
        return 'failed';
      }

      const delta = createTravelDataDelta(lastSavedTravelDataRef.current, travelData);
      if (!delta || isTravelDataDeltaEmpty(delta)) {
        return 'persisted';
      }

      try {
        const response = await fetch(`/api/travel-data?id=${travelData.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ deltaUpdate: delta }),
        });

        if (!response.ok) {
          const shouldQueue = response.status === 503 || (typeof navigator !== 'undefined' && !navigator.onLine);
          if (shouldQueue) {
            return tryQueueOfflineDelta();
          }

          let errorDetails = '';
          try {
            errorDetails = await response.text();
          } catch {
            errorDetails = '';
          }
          console.warn('Auto-save (delta) failed, will fallback to full save:', response.status, errorDetails);
          return 'failed';
        }

        return 'persisted';
      } catch (error) {
        console.warn('Auto-save (delta) network error, queuing offline delta:', error);
        return tryQueueOfflineDelta();
      }
    };

    try {
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

      if (mode === 'edit' && travelData.id && lastSavedTravelDataRef.current) {
        const deltaSaveResult = await saveDeltaTravelData();
        if (deltaSaveResult === 'persisted') {
          lastSavedTravelDataRef.current = snapshotTravelData(travelData);
          return true;
        }
        if (deltaSaveResult === 'queued') {
          return false;
        }
      }

      const fullSave = await saveFullTravelData();
      if (fullSave.state !== 'persisted') {
        return false;
      }

      if (fullSave.savedId && fullSave.savedId !== travelData.id) {
        lastSavedTravelDataRef.current = snapshotTravelData({
          ...travelData,
          id: fullSave.savedId
        });
      } else {
        lastSavedTravelDataRef.current = snapshotTravelData(travelData);
      }

      return true;
    } catch (error) {
      console.error('Auto-save error:', error);
      return false;
    }
  }, [mode, travelData]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const activeTripId = travelData.id || tripId;
    if (!activeTripId) {
      return;
    }

    const handleSync = async () => {
      await syncOfflineDeltaQueue({
        onConflict: (conflict) => {
          if (conflict.kind !== 'travel' || conflict.id !== activeTripId) {
            return;
          }

          alert(formatOfflineConflictMessage(conflict));
        }
      });
    };

    void handleSync();
    window.addEventListener('online', handleSync);

    return () => {
      window.removeEventListener('online', handleSync);
    };
  }, [tripId, travelData.id]);

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
    // Auto-create missing locations for route endpoints only (not intermediate waypoints)
    const updatedLocations = [...travelData.locations];
    const endpointCandidates = newRoute.subRoutes?.length
      ? [
          // Only the first segment's from (route start) and last segment's to (route end)
          { name: newRoute.subRoutes[0].from, coords: newRoute.subRoutes[0].fromCoords, date: newRoute.subRoutes[0].date },
          { name: newRoute.subRoutes[newRoute.subRoutes.length - 1].to, coords: newRoute.subRoutes[newRoute.subRoutes.length - 1].toCoords, date: newRoute.subRoutes[newRoute.subRoutes.length - 1].date }
        ]
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
        const savedId: string | undefined = result.id;
        lastSavedTravelDataRef.current = snapshotTravelData(
          savedId && savedId !== travelData.id ? { ...travelData, id: savedId } : travelData
        );
        
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

  const geocodeLocation = useCallback(async (locationName: string): Promise<[number, number]> => {
    const result = await geocodeLocationService(locationName);
    if (!result) {
      showNotification(`Could not find coordinates for "${locationName}". Please enter them manually.`, 'error');
      return [0, 0];
    }
    return result;
  }, [showNotification]);

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
