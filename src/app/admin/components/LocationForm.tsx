'use client';

import React, { useState } from 'react';
import { formatDuration } from '../../lib/durationUtils';
import { Location } from '../../types';
import LocationAccommodationsManager from './LocationAccommodationsManager';
import CostTrackingLinksManager from './CostTrackingLinksManager';
import { CostTrackingData } from '../../types';
import { ExpenseTravelLookup } from '../../lib/expenseTravelLookup';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

interface LocationFormProps {
  tripId: string;
  currentLocation: Partial<Location>;
  setCurrentLocation: React.Dispatch<React.SetStateAction<Partial<Location>>>;
  onLocationAdded: (location: Location) => void;
  editingLocationIndex: number | null;
  setEditingLocationIndex: (index: number | null) => void;
  onGeocode?: (locationName: string) => Promise<void>;
  travelLookup: ExpenseTravelLookup | null;
  costData: CostTrackingData | null;
}

export default function LocationForm({
  tripId,
  currentLocation,
  setCurrentLocation,
  onLocationAdded,
  editingLocationIndex,
  setEditingLocationIndex,
  onGeocode,
  travelLookup,
  costData
}: LocationFormProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // React 19 Action for adding/updating locations
  async function submitLocationAction(formData: FormData) {
    console.log('LocationForm: submitLocationAction called');
    setSubmitError(null);
    setIsSubmitting(true);
    
    try {
    const data = Object.fromEntries(formData);
    console.log('LocationForm: form data', data);
    
    // Parse coordinates
    const lat = parseFloat(data.latitude as string) || 0;
    const lng = parseFloat(data.longitude as string) || 0;
    
    // Handle end date and calculate duration
    const startDateStr = data.date as string;
    const endDateStr = data.endDate as string || undefined;
    const startDate = new Date(startDateStr);
    const endDate = endDateStr ? new Date(endDateStr) : undefined;
    const duration = endDate && startDate ? 
      Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1 : 
      undefined;
    
    // Create location object
    const location: Location = {
      id: editingLocationIndex !== null ? currentLocation.id! : generateId(),
      name: data.name as string,
      coordinates: [lat, lng],
      date: startDate,
      endDate: endDate,
      duration: duration,
      arrivalTime: currentLocation.arrivalTime,
      departureTime: currentLocation.departureTime,
      notes: data.notes as string || '',
      instagramPosts: currentLocation.instagramPosts || [],
      blogPosts: currentLocation.blogPosts || [],
      // Multiple accommodations support
      accommodationIds: currentLocation.accommodationIds || [],
      // Backward compatibility
      accommodationData: currentLocation.accommodationData,
      isAccommodationPublic: currentLocation.isAccommodationPublic || false,
      costTrackingLinks: currentLocation.costTrackingLinks || []
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
        date: new Date(),
        notes: '',
        instagramPosts: [],
        blogPosts: [],
        accommodationIds: [],
        accommodationData: '',
        isAccommodationPublic: false,
        costTrackingLinks: []
      });
      
      if (editingLocationIndex !== null) {
        setEditingLocationIndex(null);
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to save location');
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleGeocoding = async () => {
    if (currentLocation.name && onGeocode) {
      await onGeocode(currentLocation.name);
    }
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-md mb-4">
      <h4 className="font-medium mb-3">
        {editingLocationIndex !== null ? 'Edit Location' : 'Add Location'}
      </h4>
      
      {submitError && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 rounded">
          {submitError}
        </div>
      )}
      
      <form 
        key={editingLocationIndex !== null ? `edit-${currentLocation.id}` : 'new'} 
        action={submitLocationAction} 
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        <div>
          <label htmlFor="location-name" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            Location Name *
          </label>
          <div className="flex gap-2">
            <input
              id="location-name"
              name="name"
              type="text"
              defaultValue={currentLocation.name || ''}
              onChange={(e) => setCurrentLocation((prev: Partial<Location>) => ({ ...prev, name: e.target.value }))}
              required
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
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
          <label htmlFor="location-date" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            Arrival Date *
          </label>
          <input
            id="location-date"
            name="date"
            type="date"
            defaultValue={currentLocation.date instanceof Date ? currentLocation.date.toISOString().split('T')[0] : (currentLocation.date || '')}
            onChange={(e) => setCurrentLocation((prev: Partial<Location>) => ({ ...prev, date: new Date(e.target.value) }))}
            required
            data-testid="location-date"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
          />
        </div>

        <div>
          <label htmlFor="location-end-date" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            Departure Date (optional)
          </label>
          <input
            id="location-end-date"
            name="endDate"
            type="date"
            defaultValue={currentLocation.endDate instanceof Date ? currentLocation.endDate.toISOString().split('T')[0] : (currentLocation.endDate || '')}
            onChange={(e) => {
              const endDateStr = e.target.value;
              const endDate = endDateStr ? new Date(endDateStr) : undefined;
              setCurrentLocation((prev: Partial<Location>) => {
                const duration = endDate && prev.date ? 
                  Math.ceil((endDate.getTime() - (prev.date instanceof Date ? prev.date.getTime() : new Date(prev.date).getTime())) / (1000 * 60 * 60 * 24)) + 1 : 
                  undefined;
                return { ...prev, endDate, duration };
              });
            }}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
          />
          {currentLocation.duration && currentLocation.date && currentLocation.endDate && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Duration: {formatDuration(currentLocation.duration, currentLocation.date, currentLocation.endDate)}
            </p>
          )}
        </div>

        <div className="md:col-span-2">
          <label htmlFor="location-notes" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            Notes (optional)
          </label>
          <textarea
            id="location-notes"
            name="notes"
            defaultValue={currentLocation.notes || ''}
            onChange={(e) => setCurrentLocation((prev: Partial<Location>) => ({ ...prev, notes: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            rows={2}
            placeholder="What you did here..."
          />
        </div>

        <div>
          <label htmlFor="location-latitude" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            Coordinates
          </label>
          <div className="flex gap-2">
            <input
              id="location-latitude"
              name="latitude"
              type="number"
              step="any"
              defaultValue={currentLocation.coordinates?.[0] || ''}
              onChange={(e) => setCurrentLocation((prev: Partial<Location>) => ({ 
                ...prev, 
                coordinates: [parseFloat(e.target.value) || 0, prev.coordinates?.[1] || 0]
              }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="Latitude"
            />
            <input
              id="location-longitude"
              name="longitude"
              type="number"
              step="any"
              defaultValue={currentLocation.coordinates?.[1] || ''}
              onChange={(e) => setCurrentLocation((prev: Partial<Location>) => ({ 
                ...prev, 
                coordinates: [prev.coordinates?.[0] || 0, parseFloat(e.target.value) || 0]
              }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="Longitude"
            />
          </div>
        </div>

        {/* Location-Level Cost Tracking Links */}
        <div className="md:col-span-2">
          <CostTrackingLinksManager
            tripId={tripId}
            travelItemId={currentLocation.id || 'temp-location'}
            travelItemType="location"
          />
        </div>

        {/* Location Accommodations Manager */}
        <div className="md:col-span-2">
          <LocationAccommodationsManager
            tripId={tripId}
            locationId={currentLocation.id || 'temp-location'}
            locationName={currentLocation.name || 'New Location'}
            accommodationIds={currentLocation.accommodationIds || []}
            onAccommodationIdsChange={(ids) => 
              setCurrentLocation((prev: Partial<Location>) => ({ ...prev, accommodationIds: ids }))
            }
            travelLookup={travelLookup}
            costData={costData}
          />
        </div>



        <div className="flex items-end gap-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Saving...' : editingLocationIndex !== null ? 'Update Location' : 'Add Location'}
          </button>
          
          {editingLocationIndex !== null && (
            <button
              type="button"
              onClick={() => {
                setEditingLocationIndex(null);
                setCurrentLocation({
                  name: '',
                  coordinates: [0, 0],
                  date: new Date(),
                  notes: '',
                  instagramPosts: [],
                  blogPosts: [],
                  accommodationIds: [],
                  accommodationData: '',
                  isAccommodationPublic: false,
                  costTrackingLinks: []
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