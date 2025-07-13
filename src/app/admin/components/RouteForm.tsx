'use client';

import React from 'react';
import { TravelRoute } from '../../types';
import { transportationTypes, transportationLabels } from '../../lib/routeUtils';
import CostTrackingLinksManager from './CostTrackingLinksManager';
import AriaSelect from './AriaSelect';
import AriaComboBox from './AriaComboBox';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

interface RouteFormProps {
  currentRoute: Partial<TravelRoute>;
  setCurrentRoute: React.Dispatch<React.SetStateAction<Partial<TravelRoute>>>;
  onRouteAdded: (route: TravelRoute) => Promise<void>;
  editingRouteIndex: number | null;
  setEditingRouteIndex: (index: number | null) => void;
  locationOptions: Array<{ name: string; coordinates: [number, number] }>;
  onGeocode?: (locationName: string) => Promise<[number, number]>;
}

export default function RouteForm({
  currentRoute,
  setCurrentRoute,
  onRouteAdded,
  editingRouteIndex,
  setEditingRouteIndex,
  locationOptions,
  onGeocode
}: RouteFormProps) {

  // React 19 Action for adding/updating routes
  async function submitRouteAction(formData: FormData) {
    const data = Object.fromEntries(formData);
    
    // Find location coordinates based on selected names or geocode new ones
    const fromLocation = locationOptions.find(loc => loc.name === data.from);
    const toLocation = locationOptions.find(loc => loc.name === data.to);
    
    let fromCoords: [number, number] = fromLocation?.coordinates || [0, 0];
    let toCoords: [number, number] = toLocation?.coordinates || [0, 0];
    
    // Geocode new locations if needed
    if (!fromLocation && onGeocode) {
      try {
        fromCoords = await onGeocode(data.from as string);
      } catch (error) {
        console.warn('Failed to geocode from location:', error);
      }
    }
    
    if (!toLocation && onGeocode) {
      try {
        toCoords = await onGeocode(data.to as string);
      } catch (error) {
        console.warn('Failed to geocode to location:', error);
      }
    }
    
    // Create route object
    const route: TravelRoute = {
      id: editingRouteIndex !== null ? currentRoute.id! : generateId(),
      transportType: data.type as TravelRoute['transportType'],
      from: data.from as string,
      to: data.to as string,
      fromCoords,
      toCoords,
      date: new Date(data.date as string),
      notes: data.notes as string || '',
      duration: data.duration as string || '',
      // Private fields
      privateNotes: data.privateNotes as string || '',
      costTrackingLinks: currentRoute.costTrackingLinks || []
    };

    // Validate required fields
    if (!route.transportType || !route.from || !route.to || !route.date) {
      const missing = [];
      if (!route.transportType) missing.push('Transportation Type');
      if (!route.from) missing.push('From Location');
      if (!route.to) missing.push('To Location');
      if (!route.date) missing.push('Date');
      throw new Error(`Please fill in the following required fields: ${missing.join(', ')}`);
    }

    // Validate that from and to locations are different
    if (route.from === route.to) {
      throw new Error('From and To locations must be different');
    }

    // Call the parent handler
    await onRouteAdded(route);
    
    // Reset form
    setCurrentRoute({
      transportType: 'plane',
      from: '',
      to: '',
      fromCoords: [0, 0],
      toCoords: [0, 0],
      date: new Date(),
      notes: '',
      duration: '',
      privateNotes: '',
      costTrackingLinks: []
    });
    
    if (editingRouteIndex !== null) {
      setEditingRouteIndex(null);
    }
  }

  const transportOptions = transportationTypes.map(type => ({
    value: type,
    label: transportationLabels[type]
  }));

  return (
    <div className="bg-gray-50 p-4 rounded-md mb-4">
      <h4 className="font-medium mb-3">
        {editingRouteIndex !== null ? 'Edit Route' : 'Add Route'}
      </h4>
      
      <form 
        key={editingRouteIndex !== null ? `edit-${currentRoute.id}` : 'new'} 
        action={submitRouteAction} 
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        <div>
          <label htmlFor="route-type" className="block text-sm font-medium text-gray-700 mb-1">
            Transportation Type *
          </label>
          <AriaSelect
            id="route-type"
            name="type"
            defaultValue={currentRoute.transportType || 'plane'}
            required
            options={transportOptions}
            placeholder="Select Transportation"
          />
        </div>

        <div>
          <label htmlFor="route-date" className="block text-sm font-medium text-gray-700 mb-1">
            Date *
          </label>
          <input
            id="route-date"
            name="date"
            type="date"
            defaultValue={currentRoute.date instanceof Date ? currentRoute.date.toISOString().split('T')[0] : (currentRoute.date || '')}
            required
            data-testid="route-date"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="route-from" className="block text-sm font-medium text-gray-700 mb-1">
            From Location *
          </label>
          <AriaComboBox
            id="route-from"
            name="from"
            defaultValue={currentRoute.from || ''}
            onChange={(value) => setCurrentRoute((prev: Partial<TravelRoute>) => ({ ...prev, from: value }))}
            required
            options={locationOptions.map(location => ({ value: location.name, label: location.name }))}
            placeholder="Enter location name (new locations will be created)"
            allowsCustomValue={true}
          />
        </div>

        <div>
          <label htmlFor="route-to" className="block text-sm font-medium text-gray-700 mb-1">
            To Location *
          </label>
          <AriaComboBox
            id="route-to"
            name="to"
            defaultValue={currentRoute.to || ''}
            onChange={(value) => setCurrentRoute((prev: Partial<TravelRoute>) => ({ ...prev, to: value }))}
            required
            options={locationOptions.map(location => ({ value: location.name, label: location.name }))}
            placeholder="Enter location name (new locations will be created)"
            allowsCustomValue={true}
          />
        </div>

        <div>
          <label htmlFor="route-duration" className="block text-sm font-medium text-gray-700 mb-1">
            Duration (optional)
          </label>
          <input
            id="route-duration"
            name="duration"
            type="text"
            defaultValue={currentRoute.duration || ''}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g., 2h 30m, 1 day"
          />
        </div>


        <div className="md:col-span-2">
          <label htmlFor="route-notes" className="block text-sm font-medium text-gray-700 mb-1">
            Public Notes (optional)
          </label>
          <textarea
            id="route-notes"
            name="notes"
            defaultValue={currentRoute.notes || ''}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={2}
            placeholder="Flight number, booking details, etc..."
          />
        </div>

        <div className="md:col-span-2">
          <label htmlFor="route-private-notes" className="block text-sm font-medium text-gray-700 mb-1">
            Private Notes (admin only)
            <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded ml-2">Private</span>
          </label>
          <textarea
            id="route-private-notes"
            name="privateNotes"
            defaultValue={currentRoute.privateNotes || ''}
            onChange={(e) => setCurrentRoute((prev: Partial<TravelRoute>) => ({ ...prev, privateNotes: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={2}
            placeholder="Travel company details, station info, personal reminders..."
          />
        </div>

        {/* Cost Tracking Links */}
        <div className="md:col-span-2">
          <CostTrackingLinksManager
            currentLinks={currentRoute.costTrackingLinks || []}
            onLinksChange={(links) => 
              setCurrentRoute((prev: Partial<TravelRoute>) => ({ ...prev, costTrackingLinks: links }))
            }
          />
        </div>

        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {editingRouteIndex !== null ? 'Update Route' : 'Add Route'}
          </button>
          
          {editingRouteIndex !== null && (
            <button
              type="button"
              onClick={() => {
                setEditingRouteIndex(null);
                setCurrentRoute({
                  transportType: 'plane',
                  from: '',
                  to: '',
                  fromCoords: [0, 0],
                  toCoords: [0, 0],
                  date: new Date(),
                  notes: '',
                  duration: '',
                  privateNotes: '',
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