'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getClientDomainConfig } from '../../lib/domains';
import RoutePreviewMap from './RoutePreviewMap';

interface TravelLocation {
  id: string;
  name: string;
  coordinates: [number, number];
  date: string;
  notes?: string;
  instagramPosts?: InstagramPost[];
  blogPosts?: BlogPost[];
}

interface InstagramPost {
  id: string;
  url: string;
  caption?: string;
}

interface BlogPost {
  id: string;
  title: string;
  url: string;
  excerpt?: string;
}

interface TravelRoute {
  id: string;
  from: string;
  to: string;
  fromCoords: [number, number];
  toCoords: [number, number];
  transportType: 'plane' | 'train' | 'car' | 'bus' | 'boat' | 'walk' | 'ferry' | 'metro' | 'bike';
  date: string;
  duration?: string;
  notes?: string;
}

interface TravelData {
  id?: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  locations: TravelLocation[];
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

export default function TravelDataForm() {
  const router = useRouter();
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
  
  const [currentLocation, setCurrentLocation] = useState<Partial<TravelLocation>>({
    name: '',
    coordinates: [0, 0],
    date: '',
    notes: '',
    instagramPosts: [],
    blogPosts: []
  });
  
  const [currentRoute, setCurrentRoute] = useState<Partial<TravelRoute>>({
    from: '',
    to: '',
    fromCoords: [0, 0],
    toCoords: [0, 0],
    transportType: 'plane',
    date: '',
    duration: '',
    notes: ''
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
  }, [travelData.title, travelData.description, travelData.startDate, travelData.endDate, 
      travelData.locations, travelData.routes, mode, hasUnsavedChanges]);

  // Track when user makes changes (but not on initial load)
  useEffect(() => {
    if ((mode === 'edit' && travelData.id) || (mode === 'create' && travelData.title)) {
      // Set flag that we have unsaved changes
      setHasUnsavedChanges(true);
    }
  }, [travelData.title, travelData.description, travelData.startDate, travelData.endDate, 
      travelData.locations, travelData.routes, mode]);

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

  const migrateOldFormat = (tripData: any): TravelData => {
    // Migrate locations to new format if they don't have IDs
    const migratedLocations = tripData.locations?.map((location: any) => ({
      id: location.id || generateId(),
      name: location.name,
      coordinates: location.coordinates,
      date: location.date,
      notes: location.notes || '',
      instagramPosts: location.instagramPosts || [],
      blogPosts: location.blogPosts || []
    })) || [];

    // Migrate routes to new format if they don't have IDs
    const migratedRoutes = tripData.routes?.map((route: any) => ({
      id: route.id || generateId(),
      from: route.from,
      to: route.to,
      fromCoords: route.fromCoords,
      toCoords: route.toCoords,
      transportType: route.transportType,
      date: route.date,
      duration: route.duration || '',
      notes: route.notes || ''
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
        setMode('edit');
        setHasUnsavedChanges(false); // Just loaded, no changes yet
      }
    } catch (error) {
      console.error('Error loading trip:', error);
    }
  };

  const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 9);

  const addLocation = () => {
    if (currentLocation.name && currentLocation.date) {
      const newLocation: TravelLocation = {
        id: generateId(),
        name: currentLocation.name,
        coordinates: currentLocation.coordinates || [0, 0],
        date: currentLocation.date,
        notes: currentLocation.notes || '',
        instagramPosts: currentLocation.instagramPosts || [],
        blogPosts: currentLocation.blogPosts || []
      };

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

      setCurrentLocation({
        name: '',
        coordinates: [0, 0],
        date: '',
        notes: '',
        instagramPosts: [],
        blogPosts: []
      });
    }
  };

  const addRoute = () => {
    if (currentRoute.from && currentRoute.to && currentRoute.date) {
      const newRoute: TravelRoute = {
        id: generateId(),
        from: currentRoute.from!,
        to: currentRoute.to!,
        fromCoords: currentRoute.fromCoords || [0, 0],
        toCoords: currentRoute.toCoords || [0, 0],
        transportType: currentRoute.transportType || 'plane',
        date: currentRoute.date!,
        duration: currentRoute.duration || '',
        notes: currentRoute.notes || ''
      };

      // Auto-create missing locations for route endpoints
      const updatedLocations = [...travelData.locations];
      
      // Check if 'from' location exists
      const fromExists = updatedLocations.some(loc => 
        loc.name.toLowerCase().trim() === currentRoute.from!.toLowerCase().trim()
      );
      
      if (!fromExists && currentRoute.fromCoords && (currentRoute.fromCoords[0] !== 0 || currentRoute.fromCoords[1] !== 0)) {
        const fromLocation: TravelLocation = {
          id: generateId(),
          name: currentRoute.from!,
          coordinates: currentRoute.fromCoords,
          date: currentRoute.date!,
          notes: '',
          instagramPosts: [],
          blogPosts: []
        };
        updatedLocations.push(fromLocation);
      }
      
      // Check if 'to' location exists
      const toExists = updatedLocations.some(loc => 
        loc.name.toLowerCase().trim() === currentRoute.to!.toLowerCase().trim()
      );
      
      if (!toExists && currentRoute.toCoords && (currentRoute.toCoords[0] !== 0 || currentRoute.toCoords[1] !== 0)) {
        const toLocation: TravelLocation = {
          id: generateId(),
          name: currentRoute.to!,
          coordinates: currentRoute.toCoords,
          date: currentRoute.date!,
          notes: '',
          instagramPosts: [],
          blogPosts: []
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

      setCurrentRoute({
        from: '',
        to: '',
        fromCoords: [0, 0],
        toCoords: [0, 0],
        transportType: 'plane',
        date: '',
        duration: '',
        notes: ''
      });
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

  const deleteLocation = (index: number) => {
    setTravelData(prev => ({
      ...prev,
      locations: prev.locations.filter((_, i) => i !== index)
    }));
  };

  const deleteRoute = (index: number) => {
    setTravelData(prev => ({
      ...prev,
      routes: prev.routes.filter((_, i) => i !== index)
    }));
  };

  // Silent auto-save function (no alerts, no redirects)
  const autoSaveTravelData = async () => {
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
        // Redirect to the generated map page on the public domain
        const domainConfig = getClientDomainConfig();
        window.open(`${domainConfig.embedDomain}/map/${result.id}`, '_blank');
      } else {
        alert('Error saving map');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error saving map');
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

  const handleLocationGeocode = async () => {
    if (currentLocation.name) {
      const coords = await geocodeLocation(currentLocation.name);
      setCurrentLocation(prev => ({ ...prev, coordinates: coords }));
    }
  };

  const handleRouteGeocode = async (field: 'from' | 'to') => {
    const locationName = field === 'from' ? currentRoute.from : currentRoute.to;
    if (locationName) {
      const coords = await geocodeLocation(locationName);
      if (field === 'from') {
        setCurrentRoute(prev => ({ ...prev, fromCoords: coords }));
      } else {
        setCurrentRoute(prev => ({ ...prev, toCoords: coords }));
      }
    }
  };

  // List view
  if (mode === 'list') {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold">Travel Maps</h2>
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
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Create New Trip
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Loading travel maps...</p>
          </div>
        ) : existingTrips.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">No travel maps found.</p>
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
                className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Create Your First Travel Map
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {existingTrips.map((trip) => (
              <div key={trip.id} className="bg-white border rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow">
                <h3 className="font-semibold text-lg mb-2">{trip.title}</h3>
                <p className="text-gray-600 text-sm mb-3">{trip.description}</p>
                <p className="text-gray-500 text-xs mb-4">
                  {new Date(trip.startDate).toLocaleDateString()} - {new Date(trip.endDate).toLocaleDateString()}
                </p>
                
                <div className="flex gap-2">
                  <button
                    onClick={() => loadTripForEditing(trip.id)}
                    className="flex-1 px-3 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      const domainConfig = getClientDomainConfig();
                      window.open(`${domainConfig.embedDomain}/map/${trip.id}`, '_blank');
                    }}
                    className="flex-1 px-3 py-2 bg-green-500 text-white rounded text-sm hover:bg-green-600"
                  >
                    View
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
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
        <h3 className="text-xl font-semibold mb-4">Journey Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={travelData.title}
              onChange={(e) => setTravelData(prev => ({ ...prev, title: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="My Amazing Trip"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              value={travelData.description}
              onChange={(e) => setTravelData(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="A wonderful journey across..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input
              type="date"
              value={travelData.startDate}
              onChange={(e) => setTravelData(prev => ({ ...prev, startDate: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <input
              type="date"
              value={travelData.endDate}
              onChange={(e) => setTravelData(prev => ({ ...prev, endDate: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Locations */}
      <div>
        <h3 className="text-xl font-semibold mb-4">Locations</h3>
        <div className="bg-gray-50 p-4 rounded-md mb-4">
          <h4 className="font-medium mb-3">
            {editingLocationIndex !== null ? 'Edit Location' : 'Add Location'}
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location Name</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={currentLocation.name || ''}
                  onChange={(e) => setCurrentLocation(prev => ({ ...prev, name: e.target.value }))}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Paris, France"
                />
                <button
                  type="button"
                  onClick={handleLocationGeocode}
                  className="px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm"
                >
                  Get Coords
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={currentLocation.date || ''}
                onChange={(e) => setCurrentLocation(prev => ({ ...prev, date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
              <textarea
                value={currentLocation.notes || ''}
                onChange={(e) => setCurrentLocation(prev => ({ ...prev, notes: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={2}
                placeholder="What you did here..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Coordinates</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="any"
                  value={currentLocation.coordinates?.[0] || 0}
                  onChange={(e) => setCurrentLocation(prev => ({ 
                    ...prev, 
                    coordinates: [parseFloat(e.target.value) || 0, prev.coordinates?.[1] || 0]
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Latitude"
                />
                <input
                  type="number"
                  step="any"
                  value={currentLocation.coordinates?.[1] || 0}
                  onChange={(e) => setCurrentLocation(prev => ({ 
                    ...prev, 
                    coordinates: [prev.coordinates?.[0] || 0, parseFloat(e.target.value) || 0]
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Longitude"
                />
              </div>
            </div>
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={addLocation}
                className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600"
              >
                {editingLocationIndex !== null ? 'Update Location' : 'Add Location'}
              </button>
              {editingLocationIndex !== null && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingLocationIndex(null);
                    setCurrentLocation({
                      name: '',
                      coordinates: [0, 0],
                      date: '',
                      notes: '',
                      instagramPosts: [],
                      blogPosts: []
                    });
                  }}
                  className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
        
        {/* Location List */}
        {travelData.locations.length > 0 && (
          <div>
            <h4 className="font-medium mb-2">Added Locations ({travelData.locations.length})</h4>
            <div className="space-y-4">
              {travelData.locations.map((location, index) => (
                <div key={location.id} className="bg-white border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h5 className="font-medium">{location.name}</h5>
                      <p className="text-sm text-gray-500">{new Date(location.date).toLocaleDateString()}</p>
                      {location.notes && (
                        <p className="text-sm text-gray-600 mt-1">{location.notes}</p>
                      )}
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
                    <div className="mt-4 p-3 bg-gray-50 rounded">
                      <h6 className="font-medium mb-3">Instagram & Blog Posts</h6>
                      
                      {/* Instagram Posts */}
                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Instagram Posts</label>
                        <div className="flex gap-2 mb-2">
                          <input
                            type="url"
                            value={newInstagramPost.url || ''}
                            onChange={(e) => setNewInstagramPost(prev => ({ ...prev, url: e.target.value }))}
                            className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                            placeholder="Instagram post URL"
                          />
                          <input
                            type="text"
                            value={newInstagramPost.caption || ''}
                            onChange={(e) => setNewInstagramPost(prev => ({ ...prev, caption: e.target.value }))}
                            className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                            placeholder="Caption (optional)"
                          />
                          <button
                            onClick={() => addInstagramPost(index)}
                            className="px-3 py-1 bg-pink-500 text-white rounded text-sm hover:bg-pink-600"
                          >
                            Add
                          </button>
                        </div>
                        
                        {location.instagramPosts && location.instagramPosts.length > 0 && (
                          <div className="space-y-1">
                            {location.instagramPosts.map((post) => (
                              <div key={post.id} className="flex justify-between items-center bg-white p-2 rounded text-sm">
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
                            className="px-2 py-1 border border-gray-300 rounded text-sm"
                            placeholder="Post title"
                          />
                          <input
                            type="url"
                            value={newBlogPost.url || ''}
                            onChange={(e) => setNewBlogPost(prev => ({ ...prev, url: e.target.value }))}
                            className="px-2 py-1 border border-gray-300 rounded text-sm"
                            placeholder="Blog post URL"
                          />
                          <div className="flex gap-1">
                            <input
                              type="text"
                              value={newBlogPost.excerpt || ''}
                              onChange={(e) => setNewBlogPost(prev => ({ ...prev, excerpt: e.target.value }))}
                              className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                              placeholder="Excerpt (optional)"
                            />
                            <button
                              onClick={() => addBlogPost(index)}
                              className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                        
                        {location.blogPosts && location.blogPosts.length > 0 && (
                          <div className="space-y-1">
                            {location.blogPosts.map((post) => (
                              <div key={post.id} className="flex justify-between items-center bg-white p-2 rounded text-sm">
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
        <div className="bg-gray-50 p-4 rounded-md mb-4">
          <h4 className="font-medium mb-3">
            {editingRouteIndex !== null ? 'Edit Route' : 'Add Route'}
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={currentRoute.from || ''}
                  onChange={(e) => setCurrentRoute(prev => ({ ...prev, from: e.target.value }))}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Paris, France"
                />
                <button
                  type="button"
                  onClick={() => handleRouteGeocode('from')}
                  className="px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm"
                >
                  Coords
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={currentRoute.to || ''}
                  onChange={(e) => setCurrentRoute(prev => ({ ...prev, to: e.target.value }))}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="London, UK"
                />
                <button
                  type="button"
                  onClick={() => handleRouteGeocode('to')}
                  className="px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm"
                >
                  Coords
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Transportation</label>
              <select
                value={currentRoute.transportType || 'plane'}
                onChange={(e) => setCurrentRoute(prev => ({ ...prev, transportType: e.target.value as any }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="plane">✈️ Plane</option>
                <option value="train">🚆 Train</option>
                <option value="car">🚗 Car</option>
                <option value="bus">🚌 Bus</option>
                <option value="ferry">⛴️ Ferry</option>
                <option value="boat">🛥️ Boat</option>
                <option value="metro">🚇 Metro/Subway</option>
                <option value="bike">🚴 Bike</option>
                <option value="walk">🚶 Walk</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={currentRoute.date || ''}
                onChange={(e) => setCurrentRoute(prev => ({ ...prev, date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Duration (optional)</label>
              <input
                type="text"
                value={currentRoute.duration || ''}
                onChange={(e) => setCurrentRoute(prev => ({ ...prev, duration: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="2h 30min"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
              <textarea
                value={currentRoute.notes || ''}
                onChange={(e) => setCurrentRoute(prev => ({ ...prev, notes: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={2}
                placeholder="Flight details, delays, etc."
              />
            </div>
            
            {/* From Coordinates */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From Coordinates</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="any"
                  value={currentRoute.fromCoords?.[0] || 0}
                  onChange={(e) => setCurrentRoute(prev => ({ 
                    ...prev, 
                    fromCoords: [parseFloat(e.target.value) || 0, prev.fromCoords?.[1] || 0]
                  }))}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Latitude"
                />
                <input
                  type="number"
                  step="any"
                  value={currentRoute.fromCoords?.[1] || 0}
                  onChange={(e) => setCurrentRoute(prev => ({ 
                    ...prev, 
                    fromCoords: [prev.fromCoords?.[0] || 0, parseFloat(e.target.value) || 0]
                  }))}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Longitude"
                />
              </div>
            </div>
            
            {/* To Coordinates */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To Coordinates</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="any"
                  value={currentRoute.toCoords?.[0] || 0}
                  onChange={(e) => setCurrentRoute(prev => ({ 
                    ...prev, 
                    toCoords: [parseFloat(e.target.value) || 0, prev.toCoords?.[1] || 0]
                  }))}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Latitude"
                />
                <input
                  type="number"
                  step="any"
                  value={currentRoute.toCoords?.[1] || 0}
                  onChange={(e) => setCurrentRoute(prev => ({ 
                    ...prev, 
                    toCoords: [prev.toCoords?.[0] || 0, parseFloat(e.target.value) || 0]
                  }))}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Longitude"
                />
              </div>
            </div>
            
            <div className="md:col-span-2">
              {/* Route Preview Map */}
              {currentRoute.from && currentRoute.to && (
                <div className="mb-4">
                  <h5 className="text-sm font-medium text-gray-700 mb-2">Route Preview</h5>
                  <RoutePreviewMap
                    from={currentRoute.from}
                    to={currentRoute.to}
                    fromCoords={currentRoute.fromCoords || [0, 0]}
                    toCoords={currentRoute.toCoords || [0, 0]}
                    transportType={currentRoute.transportType || 'plane'}
                  />
                  {(currentRoute.fromCoords?.[0] === 0 && currentRoute.fromCoords?.[1] === 0) || 
                   (currentRoute.toCoords?.[0] === 0 && currentRoute.toCoords?.[1] === 0) ? (
                    <p className="text-xs text-amber-600 mt-1">
                      Warning: Use the "Coords" buttons above to geocode locations for accurate route preview
                    </p>
                  ) : (
                    <p className="text-xs text-green-600 mt-1">
                      Route preview ready! Missing locations will be auto-created when you add this route.
                    </p>
                  )}
                </div>
              )}
              
              <div className="flex gap-2">
              <button
                type="button"
                onClick={addRoute}
                className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600"
              >
                {editingRouteIndex !== null ? 'Update Route' : 'Add Route'}
              </button>
              {editingRouteIndex !== null && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingRouteIndex(null);
                    setCurrentRoute({
                      from: '',
                      to: '',
                      fromCoords: [0, 0],
                      toCoords: [0, 0],
                      transportType: 'plane',
                      date: '',
                      duration: '',
                      notes: ''
                    });
                  }}
                  className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
                >
                  Cancel
                </button>
              )}
              </div>
            </div>
          </div>
        </div>

        {/* Route List */}
        {travelData.routes.length > 0 && (
          <div>
            <h4 className="font-medium mb-2">Added Routes ({travelData.routes.length})</h4>
            <div className="space-y-2">
              {travelData.routes.map((route, index) => (
                <div key={route.id} className="flex justify-between items-center bg-white p-3 rounded border">
                  <div>
                    <span className="font-medium">
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
                    <div className="text-sm text-gray-500">
                      {new Date(route.date).toLocaleDateString()}
                      {route.duration && ` • ${route.duration}`}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      From: [{route.fromCoords[0].toFixed(4)}, {route.fromCoords[1].toFixed(4)}] → 
                      To: [{route.toCoords[0].toFixed(4)}, {route.toCoords[1].toFixed(4)}]
                    </div>
                    {route.notes && (
                      <p className="text-sm text-gray-600 mt-1">{route.notes}</p>
                    )}
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
          className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
        >
          View Travel Map
        </button>
      </div>
    </div>
  );
} 