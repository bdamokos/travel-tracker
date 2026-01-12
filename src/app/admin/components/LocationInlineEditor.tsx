'use client';

import React, { useState } from 'react';
import AccessibleDatePicker from './AccessibleDatePicker';
import CostTrackingLinksManager from '@/app/admin/components/CostTrackingLinksManager';
import LocationAccommodationsManager from '@/app/admin/components/LocationAccommodationsManager';
import { Location, CostTrackingData } from '@/app/types';
import { formatDuration } from '@/app/lib/durationUtils';
import { ExpenseTravelLookup } from '@/app/lib/expenseTravelLookup';

interface LocationInlineEditorProps {
  location: Location;
  onSave: (location: Location) => void;
  onCancel: () => void;
  onGeocode?: (locationName: string) => Promise<[number, number]>;
  tripId: string;
  travelLookup: ExpenseTravelLookup | null;
  costData: CostTrackingData | null;
}

export default function LocationInlineEditor({
  location,
  onSave,
  onCancel,
  onGeocode,
  tripId,
  travelLookup,
  costData
}: LocationInlineEditorProps) {
  const [formData, setFormData] = useState<Location>({
    ...location
  });

  const handleCancel = () => {
    // Accommodations are managed independently of the location "Save" flow (add/delete persists immediately).
    // If the user cancels, keep accommodationIds changes (to avoid reintroducing orphaned IDs in the UI),
    // but discard other unsaved location edits.
    const originalIds = location.accommodationIds || [];
    const currentIds = formData.accommodationIds || [];
    const idsChanged =
      originalIds.length !== currentIds.length ||
      originalIds.some((id, index) => id !== currentIds[index]);

    if (idsChanged) {
      onSave({
        ...location,
        accommodationIds: currentIds
      });
      return;
    }

    onCancel();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    if (!formData.name.trim() || !formData.date) {
      return;
    }

    const wikipediaRef = formData.wikipediaRef?.trim();
    onSave({
      ...formData,
      wikipediaRef: wikipediaRef || undefined
    });
  };

  const handleGeocoding = async () => {
    if (formData.name.trim() && onGeocode) {
      try {
        const coords = await onGeocode(formData.name);
        setFormData(prev => ({ ...prev, coordinates: coords }));
      } catch (error) {
        console.error('Geocoding failed:', error);
      }
    }
  };

  const handleEndDateChange = (endDate: string) => {
    const endDateObj = endDate ? new Date(endDate) : undefined;
    const duration = endDateObj && formData.date ? 
      Math.ceil((endDateObj.getTime() - (formData.date instanceof Date ? formData.date.getTime() : new Date(formData.date).getTime())) / (1000 * 60 * 60 * 24)) + 1 : 
      undefined;
    
    setFormData(prev => ({ ...prev, endDate: endDateObj, duration }));
  };

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-4 shadow-sm">
      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Location Name */}
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Location Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="Paris, France"
              required
            />
          </div>
          <button
            type="button"
            onClick={handleGeocoding}
            className="px-2 py-1 mt-5 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            Coords
          </button>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Arrival Date *
            </label>
            <AccessibleDatePicker
              id="location-inline-date"
              value={formData.date instanceof Date ? formData.date : (formData.date ? new Date(formData.date) : null)}
              onChange={(d) => d && setFormData(prev => ({ ...prev, date: d }))}
              required
              className="text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Departure Date
            </label>
            <AccessibleDatePicker
              id="location-inline-end-date"
              value={formData.endDate instanceof Date ? formData.endDate : (formData.endDate ? new Date(formData.endDate) : null)}
              onChange={(endDate) => handleEndDateChange(endDate ? endDate.toISOString().split('T')[0] : '')}
              className="text-sm"
            />
          </div>
        </div>

        {/* Duration Display */}
        {formData.duration && formData.date && formData.endDate && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Duration: {formatDuration(formData.duration, formData.date, formData.endDate)}
          </p>
        )}

        {/* Coordinates */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Latitude
            </label>
            <input
              type="number"
              step="any"
              value={formData.coordinates[0] || ''}
              onChange={(e) => setFormData(prev => ({ 
                ...prev, 
                coordinates: [parseFloat(e.target.value) || 0, prev.coordinates[1]]
              }))}
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="48.8566"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Longitude
            </label>
            <input
              type="number"
              step="any"
              value={formData.coordinates[1] || ''}
              onChange={(e) => setFormData(prev => ({ 
                ...prev, 
                coordinates: [prev.coordinates[0], parseFloat(e.target.value) || 0]
              }))}
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="2.3522"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Notes
          </label>
          <textarea
            value={formData.notes || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            rows={2}
            placeholder="What you did here..."
          />
        </div>

         <div>
          <label htmlFor="location-inline-wikipedia-ref" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Wikipedia override
          </label>
          <input
            id="location-inline-wikipedia-ref"
            type="text"
            value={formData.wikipediaRef || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, wikipediaRef: e.target.value }))}
            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            placeholder="e.g. Paris or Q90 (leave blank for auto)"
          />
        </div>

        {/* Cost Tracking Links */}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
            Cost Tracking Links
          </label>
          <CostTrackingLinksManager
            tripId={tripId}
            travelItemId={formData.id}
            travelItemType="location"
          />
        </div>

        {/* Location Accommodations */}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
            Accommodations
          </label>
          <LocationAccommodationsManager
            tripId={tripId}
            locationId={formData.id}
            locationName={formData.name}
            accommodationIds={formData.accommodationIds || []}
            onAccommodationIdsChange={(ids) => 
              setFormData(prev => ({ ...prev, accommodationIds: ids }))
            }
            travelLookup={travelLookup}
            costData={costData}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            className="px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600 focus:outline-none focus:ring-1 focus:ring-green-500"
          >
            Save
	          </button>
	          <button
	            type="button"
	            onClick={handleCancel}
	            className="px-3 py-1 bg-gray-500 text-white text-sm rounded hover:bg-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-500"
	          >
	            Cancel
	          </button>
	        </div>
      </form>
    </div>
  );
}
