'use client';

import React from 'react';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
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

interface TravelLocation {
  id: string;
  name: string;
  coordinates: [number, number];
  date: string;
  notes?: string;
  instagramPosts?: InstagramPost[];
  blogPosts?: BlogPost[];
}

interface LocationFormProps {
  currentLocation: Partial<TravelLocation>;
  setCurrentLocation: React.Dispatch<React.SetStateAction<Partial<TravelLocation>>>;
  onLocationAdded: (location: TravelLocation) => void;
  editingLocationIndex: number | null;
  setEditingLocationIndex: (index: number | null) => void;
  onGeocode?: (locationName: string) => Promise<void>;
}

export default function LocationForm({
  currentLocation,
  setCurrentLocation,
  onLocationAdded,
  editingLocationIndex,
  setEditingLocationIndex,
  onGeocode
}: LocationFormProps) {

  // React 19 Action for adding/updating locations
  async function submitLocationAction(formData: FormData) {
    const data = Object.fromEntries(formData);
    
    // Parse coordinates
    const lat = parseFloat(data.latitude as string) || 0;
    const lng = parseFloat(data.longitude as string) || 0;
    
    // Create location object
    const location: TravelLocation = {
      id: editingLocationIndex !== null ? currentLocation.id! : generateId(),
      name: data.name as string,
      coordinates: [lat, lng],
      date: data.date as string,
      notes: data.notes as string || '',
      instagramPosts: currentLocation.instagramPosts || [],
      blogPosts: currentLocation.blogPosts || []
    };

    // Validate required fields
    if (!location.name || !location.date) {
      const missing = [];
      if (!location.name) missing.push('Location Name');
      if (!location.date) missing.push('Date');
      throw new Error(`Please fill in the following required fields: ${missing.join(', ')}`);
    }

    // Call the parent handler
    onLocationAdded(location);
    
    // Reset form
    setCurrentLocation({
      name: '',
      coordinates: [0, 0],
      date: '',
      notes: '',
      instagramPosts: [],
      blogPosts: []
    });
    
    if (editingLocationIndex !== null) {
      setEditingLocationIndex(null);
    }
  }

  const handleGeocoding = async () => {
    if (currentLocation.name && onGeocode) {
      await onGeocode(currentLocation.name);
    }
  };

  return (
    <div className="bg-gray-50 p-4 rounded-md mb-4">
      <h4 className="font-medium mb-3">
        {editingLocationIndex !== null ? 'Edit Location' : 'Add Location'}
      </h4>
      
      <form action={submitLocationAction} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="location-name" className="block text-sm font-medium text-gray-700 mb-1">
            Location Name *
          </label>
          <div className="flex gap-2">
            <input
              id="location-name"
              name="name"
              type="text"
              defaultValue={currentLocation.name || ''}
              onChange={(e) => setCurrentLocation((prev: Partial<TravelLocation>) => ({ ...prev, name: e.target.value }))}
              required
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Paris, France"
            />
            <button
              type="button"
              onClick={handleGeocoding}
              className="px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm"
            >
              Get Coordinates
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="location-date" className="block text-sm font-medium text-gray-700 mb-1">
            Date *
          </label>
          <input
            id="location-date"
            name="date"
            type="date"
            defaultValue={currentLocation.date || ''}
            required
            data-testid="location-date"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="md:col-span-2">
          <label htmlFor="location-notes" className="block text-sm font-medium text-gray-700 mb-1">
            Notes (optional)
          </label>
          <textarea
            id="location-notes"
            name="notes"
            defaultValue={currentLocation.notes || ''}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={2}
            placeholder="What you did here..."
          />
        </div>

        <div>
          <label htmlFor="location-latitude" className="block text-sm font-medium text-gray-700 mb-1">
            Coordinates
          </label>
          <div className="flex gap-2">
            <input
              id="location-latitude"
              name="latitude"
              type="number"
              step="any"
              defaultValue={currentLocation.coordinates?.[0] || ''}
              onChange={(e) => setCurrentLocation((prev: Partial<TravelLocation>) => ({ 
                ...prev, 
                coordinates: [parseFloat(e.target.value) || 0, prev.coordinates?.[1] || 0]
              }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Latitude"
            />
            <input
              id="location-longitude"
              name="longitude"
              type="number"
              step="any"
              defaultValue={currentLocation.coordinates?.[1] || ''}
              onChange={(e) => setCurrentLocation((prev: Partial<TravelLocation>) => ({ 
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
            type="submit"
            className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500"
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
              className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              Cancel Edit
            </button>
          )}
        </div>
      </form>
    </div>
  );
}