'use client';

import React, { useState } from 'react';
import { Transportation, CostTrackingLink } from '../../types';
import { transportationTypes, transportationLabels } from '../../lib/routeUtils';
import CostTrackingLinksManager from './CostTrackingLinksManager';

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

interface RouteInlineEditorProps {
  route: TravelRoute;
  onSave: (route: TravelRoute) => void;
  onCancel: () => void;
  locationOptions: Array<{ name: string; coordinates: [number, number] }>;
  onGeocode?: (locationName: string) => Promise<[number, number]>;
}

export default function RouteInlineEditor({
  route,
  onSave,
  onCancel,
  locationOptions,
  onGeocode
}: RouteInlineEditorProps) {
  const [formData, setFormData] = useState<TravelRoute>({
    ...route
  });

  const transportOptions = transportationTypes.map(type => ({
    value: type,
    label: transportationLabels[type]
  }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    if (!formData.transportType || !formData.from.trim() || !formData.to.trim() || !formData.date) {
      return;
    }

    if (formData.from === formData.to) {
      return;
    }

    // Update coordinates based on location selection or geocode
    let fromCoords = formData.fromCoords;
    let toCoords = formData.toCoords;

    const fromLocation = locationOptions.find(loc => loc.name === formData.from);
    const toLocation = locationOptions.find(loc => loc.name === formData.to);

    if (fromLocation) {
      fromCoords = fromLocation.coordinates;
    } else if (onGeocode) {
      try {
        fromCoords = await onGeocode(formData.from);
      } catch (error) {
        console.warn('Failed to geocode from location:', error);
      }
    }

    if (toLocation) {
      toCoords = toLocation.coordinates;
    } else if (onGeocode) {
      try {
        toCoords = await onGeocode(formData.to);
      } catch (error) {
        console.warn('Failed to geocode to location:', error);
      }
    }

    onSave({
      ...formData,
      fromCoords,
      toCoords
    });
  };

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-4 shadow-sm">
      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Transport Type and Date */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Transportation *
            </label>
            <select
              value={formData.transportType}
              onChange={(e) => setFormData(prev => ({ ...prev, transportType: e.target.value as Transportation['type'] }))}
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              required
            >
              {transportOptions.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Date *
            </label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              required
            />
          </div>
        </div>

        {/* From and To Locations */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              From *
            </label>
            <input
              type="text"
              value={formData.from}
              onChange={(e) => setFormData(prev => ({ ...prev, from: e.target.value }))}
              list="from-locations-inline"
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="Paris"
              required
            />
            <datalist id="from-locations-inline">
              {locationOptions.map(location => (
                <option key={location.name} value={location.name} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              To *
            </label>
            <input
              type="text"
              value={formData.to}
              onChange={(e) => setFormData(prev => ({ ...prev, to: e.target.value }))}
              list="to-locations-inline"
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="London"
              required
            />
            <datalist id="to-locations-inline">
              {locationOptions.map(location => (
                <option key={location.name} value={location.name} />
              ))}
            </datalist>
          </div>
        </div>

        {/* Duration */}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Duration
          </label>
          <input
            type="text"
            value={formData.duration || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, duration: e.target.value }))}
            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            placeholder="e.g., 2h 30m, 1 day"
          />
        </div>

        {/* Public Notes */}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Public Notes
          </label>
          <textarea
            value={formData.notes || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            rows={2}
            placeholder="Flight number, booking details..."
          />
        </div>

        {/* Private Notes */}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Private Notes <span className="text-xs bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 px-1 py-0.5 rounded">Private</span>
          </label>
          <textarea
            value={formData.privateNotes || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, privateNotes: e.target.value }))}
            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            rows={2}
            placeholder="Personal reminders, private details..."
          />
        </div>

        {/* Cost Tracking Links */}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
            Cost Tracking Links
          </label>
          <CostTrackingLinksManager
            currentLinks={formData.costTrackingLinks || []}
            onLinksChange={(links) => 
              setFormData(prev => ({ ...prev, costTrackingLinks: links }))
            }
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
            onClick={onCancel}
            className="px-3 py-1 bg-gray-500 text-white text-sm rounded hover:bg-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-500"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}