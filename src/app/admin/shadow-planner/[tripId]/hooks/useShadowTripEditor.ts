'use client';

import { useState, useEffect, useCallback } from 'react';
import { getMapUrl } from '@/app/lib/domains';
import { Location, InstagramPost, BlogPost, TikTokPost, TravelRoute, TravelData, Accommodation, Transportation } from '@/app/types';
import { cleanupExpenseLinks, reassignExpenseLinks, LinkedExpense } from '@/app/lib/costLinkCleanup';
import { CostTrackingData } from '@/app/types';
import { ExpenseTravelLookup } from '@/app/lib/expenseTravelLookup';
import { geocodeLocation as geocodeLocationService } from '@/app/services/geocoding';
import { generateRoutePoints } from '@/app/lib/routeUtils';
import { REAL_LOCATION_MARKER } from '@/app/lib/shadowConstants'; // Fixed: removed unused SHADOW_LOCATION_PREFIX import
import { getTodayLocalDay, parseDateAsLocalDay } from '@/app/lib/localDateUtils';

type ShadowRoutePayload = {
  id?: string;
  from?: string;
  to?: string;
  type?: TravelRoute['transportType'];
  transportType?: TravelRoute['transportType'];
  departureTime?: string;
  date?: string | Date;
  fromCoords?: [number, number];
  toCoords?: [number, number];
  fromCoordinates?: [number, number];
  toCoordinates?: [number, number];
  subRoutes?: ShadowRoutePayload[];
  routePoints?: [number, number][];
  costTrackingLinks?: Array<{ expenseId: string; description?: string }>;
  privateNotes?: string;
  distanceOverride?: number;
};

export function useShadowTripEditor(tripId: string) {
  const [loading, setLoading] = useState(true);
  const [autoSaving, setAutoSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [travelData, setTravelData] = useState<TravelData | null>(null);
  const [costData, setCostData] = useState<CostTrackingData | null>(null);
  const [travelLookup, setTravelLookup] = useState<ExpenseTravelLookup | null>(null);
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  
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

  const [currentAccommodation, setCurrentAccommodation] = useState<Partial<Accommodation>>({
    name: '',
    locationId: '',
    accommodationData: '',
    isAccommodationPublic: true,
    costTrackingLinks: []
  });

  const [editingLocationIndex, setEditingLocationIndex] = useState<number | null>(null);
  const [editingRouteIndex, setEditingRouteIndex] = useState<number | null>(null);
  const [editingAccommodationIndex, setEditingAccommodationIndex] = useState<number | null>(null);
  const [selectedLocationForPosts, setSelectedLocationForPosts] = useState<string | null>(null);
  
  // New post forms
  const [newInstagramPost, setNewInstagramPost] = useState<Partial<InstagramPost>>({
    url: '',
    caption: ''
  });
  
  const [newTikTokPost, setNewTikTokPost] = useState<Partial<TikTokPost>>({
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
    itemType: 'location' | 'route' | 'accommodation';
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

  // Reassignment dialog for expense links
  const [reassignDialog, setReassignDialog] = useState<{
    isOpen: boolean;
    type: 'location' | 'route' | 'accommodation';
    fromId: string;
    fromName: string;
    linkedExpenses: LinkedExpense[];
  } | null>(null);

  // Show notification function
  const showNotification = (message: string, type: 'success' | 'error' | 'info') => {
    setNotification({ message, type, isVisible: true });
    setTimeout(() => {
      setNotification(null);
    }, 5000);
  };

  // Load shadow trip data
  useEffect(() => {
    if (!tripId) return;

    const loadShadowTripData = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/shadow-trips/${tripId}`);
        
        if (!response.ok) {
          throw new Error('Failed to load shadow trip data');
        }

        const data = await response.json();
        
        // Transform UnifiedTripData to TravelData format
        // Merge real trip data with shadow data for editing
        const realLocations = data.travelData?.locations || [];
        const shadowLocations = data.shadowData?.shadowLocations || [];
        const realRoutes = data.travelData?.routes || [];
        const shadowRoutes = data.shadowData?.shadowRoutes || [];
        
        // Merge real accommodations with shadow accommodations first
        const realAccommodations = data.accommodations || [];
        const shadowAccommodations = data.shadowData?.shadowAccommodations || [];
        
        const mergedAccommodations = [
          ...realAccommodations.map((acc: Accommodation) => ({
            ...acc,
            name: `${REAL_LOCATION_MARKER} ${acc.name}`, // Mark real accommodations with icon
            isReadOnly: true
          })),
          ...shadowAccommodations.map((acc: Accommodation) => ({
            ...acc,
            isReadOnly: false
          }))
        ];
        
        setAccommodations(mergedAccommodations);
        
        const shadowTravelData: TravelData = {
          title: data.title,
          description: data.description,
          startDate: parseDateAsLocalDay(data.startDate) || getTodayLocalDay(),
          endDate: parseDateAsLocalDay(data.endDate) || getTodayLocalDay(),
          // Combine real locations with shadow locations for editing
          // Real locations are shown as read-only context, shadow locations are editable
          locations: [
            ...realLocations.map((loc: Location) => {
              // Find accommodations that belong to this location
              const locationAccommodations = mergedAccommodations.filter(acc => acc.locationId === loc.id);
              const accommodationIds = locationAccommodations.map(acc => acc.id);
              
              return {
                ...loc,
                id: loc.id,
                name: `${REAL_LOCATION_MARKER} ${loc.name}`, // Mark real locations with icon
                date: parseDateAsLocalDay(loc.date) || getTodayLocalDay(),
                // Mark as read-only by adding a flag we can check in the editor
                isReadOnly: true,
                // Include accommodation IDs so AccommodationManager can find them
                accommodationIds: accommodationIds.length > 0 ? accommodationIds : loc.accommodationIds || []
              };
            }),
            ...shadowLocations.map((loc: Location) => {
              // Find accommodations that belong to this location
              const locationAccommodations = mergedAccommodations.filter(acc => acc.locationId === loc.id);
              const accommodationIds = locationAccommodations.map(acc => acc.id);
              
              return {
                ...loc,
                date: parseDateAsLocalDay(loc.date) || getTodayLocalDay(),
                isReadOnly: false,
                // Include accommodation IDs so AccommodationManager can find them
                accommodationIds: accommodationIds.length > 0 ? accommodationIds : loc.accommodationIds || []
              };
            })
          ],
          // Combine real routes with shadow routes  
          routes: [
            ...realRoutes.map((route: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
              ...route,
              transportType: route.type || route.transportType,
              date: parseDateAsLocalDay(route.departureTime || route.date) || getTodayLocalDay(),
              fromCoords: route.fromCoords || [0, 0],
              toCoords: route.toCoords || [0, 0],
              from: `${REAL_LOCATION_MARKER} ${route.from}`, // Mark real routes
              to: `${REAL_LOCATION_MARKER} ${route.to}`,
              distanceOverride: route.distanceOverride,
              isReadOnly: true
            })),
            ...shadowRoutes.map((route: ShadowRoutePayload) => ({
              ...route,
              transportType: route.type || route.transportType,
              date: parseDateAsLocalDay(route.departureTime || route.date) || getTodayLocalDay(),
              fromCoords: route.fromCoords || route.fromCoordinates || [0, 0],
              toCoords: route.toCoords || route.toCoordinates || [0, 0],
              subRoutes: route.subRoutes?.map((segment: ShadowRoutePayload) => ({
                ...segment,
                transportType: segment.type || segment.transportType,
                date: parseDateAsLocalDay(segment.departureTime || segment.date) || getTodayLocalDay(),
                fromCoords: segment.fromCoords || segment.fromCoordinates || [0, 0],
                toCoords: segment.toCoords || segment.toCoordinates || [0, 0],
                distanceOverride: segment.distanceOverride
              })),
              distanceOverride: route.distanceOverride,
              isReadOnly: false
            }))
          ]
        };
        
        setTravelData(shadowTravelData);
        
        // Load cost data for expense linking
        try {
          const costResponse = await fetch(`/api/cost-tracking?tripId=${tripId}`);
          if (costResponse.ok) {
            const costData = await costResponse.json();
            setCostData(costData);
            
            // Create travel lookup for expense linking
            // Convert TravelData to TripData format for the lookup
            const tripData = {
              ...shadowTravelData,
              routes: shadowTravelData.routes.map(route => ({
                ...route,
                type: route.transportType,
                departureTime: route.date?.toISOString(),
                privateNotes: route.privateNotes,
                subRoutes: route.subRoutes?.map(segment => ({
                  ...segment,
                  type: segment.transportType,
                  departureTime: segment.date?.toISOString(),
                  privateNotes: segment.privateNotes,
                  fromCoordinates: segment.fromCoords,
                  toCoordinates: segment.toCoords
                }))
              })),
              costData: {
                expenses: costData.expenses
              }
            };
            const lookup = new ExpenseTravelLookup(tripId, tripData);
            setTravelLookup(lookup);
          }
        } catch {
          console.log('Cost data not available');
        }
        
      } catch (error) {
        console.error('Error loading shadow trip data:', error);
        showNotification('Failed to load shadow trip data', 'error');
      } finally {
        setLoading(false);
      }
    };

    loadShadowTripData();
  }, [tripId]);

  // Auto-save shadow data when it changes
  useEffect(() => {
    if (!hasUnsavedChanges || loading || !travelData) return;

    const timeoutId = setTimeout(async () => {
      try {
        setAutoSaving(true);
        
        // Transform TravelData back to shadow format
        // Only save actual shadow data (exclude read-only real trip data)
        const shadowData = {
          shadowLocations: travelData.locations.filter(loc => !loc.isReadOnly),
          shadowRoutes: travelData.routes
            .filter(route => !route.isReadOnly)
            .map((route: TravelRoute) => ({
              id: route.id,
              from: route.from,
              to: route.to,
              type: route.transportType,
              departureTime: route.date?.toISOString(),
              privateNotes: route.privateNotes,
              fromCoordinates: route.fromCoords,
              toCoordinates: route.toCoords,
              routePoints: route.routePoints,
              costTrackingLinks: route.costTrackingLinks || [],
              distanceOverride: route.distanceOverride,
              subRoutes: route.subRoutes?.map(segment => ({
                id: segment.id,
                from: segment.from,
                to: segment.to,
                type: segment.transportType,
                departureTime: segment.date?.toISOString(),
                privateNotes: segment.privateNotes,
                fromCoordinates: segment.fromCoords,
                toCoordinates: segment.toCoords,
                routePoints: segment.routePoints,
                costTrackingLinks: segment.costTrackingLinks || [],
                distanceOverride: segment.distanceOverride,
                useManualRoutePoints: segment.useManualRoutePoints,
                isReturn: segment.isReturn,
                isReadOnly: segment.isReadOnly
              }))
            })),
          shadowAccommodations: accommodations.filter(acc => !acc.isReadOnly)
        };

        const response = await fetch(`/api/shadow-trips/${tripId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(shadowData),
        });

        if (!response.ok) {
          throw new Error('Failed to save shadow data');
        }

        setHasUnsavedChanges(false);
        showNotification('Shadow data saved successfully', 'success');
        
      } catch (error) {
        console.error('Error saving shadow data:', error);
        showNotification('Failed to save shadow data', 'error');
      } finally {
        setAutoSaving(false);
      }
    }, 1000); // Auto-save after 1 second of inactivity

    return () => clearTimeout(timeoutId);
  }, [travelData, accommodations, hasUnsavedChanges, loading, tripId]);

  // Location management functions
  const handleLocationAdded = useCallback((location: Location) => {
    setTravelData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        locations: [...prev.locations, location]
      };
    });
    setHasUnsavedChanges(true);
    setCurrentLocation({
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
  }, []);

  // Route management functions
  const handleRouteAdded = useCallback((route: TravelRoute) => {
    setTravelData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        routes: [...prev.routes, route]
      };
    });
    setHasUnsavedChanges(true);
    setCurrentRoute({
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
  }, []);

  // Accommodation management functions
  const handleAccommodationAdded = useCallback((accommodation: Accommodation) => {
    setAccommodations(prev => [...prev, accommodation]);
    setHasUnsavedChanges(true);
    setCurrentAccommodation({
      name: '',
      locationId: '',
      accommodationData: '',
      isAccommodationPublic: true,
      costTrackingLinks: []
    });
  }, []);

  // Instagram post functions
  const addInstagramPost = useCallback((locationIndex: number) => {
    if (!newInstagramPost.url) {
      return;
    }

    const post: InstagramPost = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 11),
      url: newInstagramPost.url,
      caption: newInstagramPost.caption || ''
    };

    setTravelData(prev => {
      if (!prev) return prev;
      const newLocations = [...prev.locations];
      newLocations[locationIndex] = {
        ...newLocations[locationIndex],
        instagramPosts: [...(newLocations[locationIndex].instagramPosts || []), post]
      };
      return { ...prev, locations: newLocations };
    });
    setHasUnsavedChanges(true);
    setNewInstagramPost({ url: '', caption: '' });
  }, [newInstagramPost]);

  const addTikTokPost = useCallback((locationIndex: number) => {
    if (!newTikTokPost.url) {
      return;
    }

    const post: TikTokPost = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 11),
      url: newTikTokPost.url,
      caption: newTikTokPost.caption || ''
    };

    setTravelData(prev => {
      if (!prev) return prev;
      const newLocations = [...prev.locations];
      newLocations[locationIndex] = {
        ...newLocations[locationIndex],
        tikTokPosts: [...(newLocations[locationIndex].tikTokPosts || []), post]
      };
      return { ...prev, locations: newLocations };
    });
    setHasUnsavedChanges(true);
    setNewTikTokPost({ url: '', caption: '' });
  }, [newTikTokPost]);

  // Blog post functions
  const addBlogPost = useCallback((locationIndex: number) => {
    if (!newBlogPost.title || !newBlogPost.url) {
      return;
    }

    const post: BlogPost = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 11),
      title: newBlogPost.title,
      url: newBlogPost.url,
      excerpt: newBlogPost.excerpt || ''
    };

    setTravelData(prev => {
      if (!prev) return prev;
      const newLocations = [...prev.locations];
      newLocations[locationIndex] = {
        ...newLocations[locationIndex],
        blogPosts: [...(newLocations[locationIndex].blogPosts || []), post]
      };
      return { ...prev, locations: newLocations };
    });
    setHasUnsavedChanges(true);
    setNewBlogPost({ title: '', url: '', excerpt: '' });
  }, [newBlogPost]);

  // Delete functions
  const deleteLocation = useCallback((index: number) => {
    setTravelData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        locations: prev.locations.filter((_, i) => i !== index)
      };
    });
    setHasUnsavedChanges(true);
    setEditingLocationIndex(null);
  }, []);

  const deleteRoute = useCallback((index: number) => {
    setTravelData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        routes: prev.routes.filter((_, i) => i !== index)
      };
    });
    setHasUnsavedChanges(true);
    setEditingRouteIndex(null);
  }, []);

  const deleteAccommodation = useCallback((index: number) => {
    setAccommodations(prev => prev.filter((_, i) => i !== index));
    setHasUnsavedChanges(true);
    setEditingAccommodationIndex(null);
  }, []);

  // Utility functions
  const recalculateRoutePoints = useCallback(async (index: number) => {
    if (!travelData || !travelData.routes[index]) return;
    
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

        setTravelData(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            routes: prev.routes.map((r, i) =>
              i === index ? { ...r, subRoutes: updatedSubRoutes, routePoints: undefined, useManualRoutePoints: false } : r
            )
          };
        });

        setHasUnsavedChanges(true);
        console.log(`[recalculateRoutePoints] Successfully regenerated ${updatedSubRoutes.length} segment routes`);
        showNotification('Segment route points recalculated successfully', 'success');
      } catch (error) {
        console.error('Failed to recalculate segment route points:', error);
        showNotification('Failed to recalculate segment route points', 'error');
      }
      return;
    }

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
      setTravelData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          routes: prev.routes.map((r, i) => 
            i === index ? { ...r, routePoints, useManualRoutePoints: false } : r
          )
        };
      });
      
      setHasUnsavedChanges(true);
      console.log(`[recalculateRoutePoints] Successfully regenerated ${routePoints.length} route points`);
      
      // Show success notification
      showNotification('Route points recalculated successfully', 'success');
    } catch (error) {
      console.error('Failed to recalculate route points:', error);
      showNotification('Failed to recalculate route points', 'error');
    }
  }, [travelData]);

  const generateMap = useCallback(() => {
    const url = getMapUrl(tripId);
    window.open(url, '_blank');
  }, [tripId]);

  const geocodeLocation = useCallback(async (locationName: string): Promise<[number, number] | null> => {
    try {
      return await geocodeLocationService(locationName);
    } catch (error) {
      console.error('Geocoding error in shadow planner:', error);
      return null;
    }
  }, []);

  const calculateSmartDurations = useCallback(() => {
    showNotification('Duration calculation will be available when trip becomes active', 'info');
  }, []);

  return {
    loading,
    autoSaving,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    travelData,
    setTravelData,
    costData,
    travelLookup,
    accommodations,
    setAccommodations,
    currentLocation,
    setCurrentLocation,
    currentRoute,
    setCurrentRoute,
    currentAccommodation,
    setCurrentAccommodation,
    editingLocationIndex,
    setEditingLocationIndex,
    editingRouteIndex,
    setEditingRouteIndex,
    editingAccommodationIndex,
    setEditingAccommodationIndex,
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
    reassignDialog,
    setReassignDialog,
    handleLocationAdded,
    handleRouteAdded,
    handleAccommodationAdded,
    addInstagramPost,
    addTikTokPost,
    addBlogPost,
    deleteLocation,
    deleteRoute,
    deleteAccommodation,
    recalculateRoutePoints,
    generateMap,
    geocodeLocation,
    calculateSmartDurations,
    cleanupExpenseLinks,
    reassignExpenseLinks,
  };
}
