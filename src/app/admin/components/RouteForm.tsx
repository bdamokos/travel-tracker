'use client';

import React from 'react';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
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

interface RouteFormProps {
  currentRoute: Partial<TravelRoute>;
  setCurrentRoute: React.Dispatch<React.SetStateAction<Partial<TravelRoute>>>;
  onRouteAdded: (route: TravelRoute) => void;
  editingRouteIndex: number | null;
  setEditingRouteIndex: (index: number | null) => void;
  locationOptions: Array<{ name: string; coordinates: [number, number] }>;
}

export default function RouteForm({
  currentRoute,
  setCurrentRoute,
  onRouteAdded,
  editingRouteIndex,
  setEditingRouteIndex,
  locationOptions
}: RouteFormProps) {

  // React 19 Action for adding/updating routes
  async function submitRouteAction(formData: FormData) {
    const data = Object.fromEntries(formData);
    
    // Find location coordinates based on selected names
    const fromLocation = locationOptions.find(loc => loc.name === data.from);
    const toLocation = locationOptions.find(loc => loc.name === data.to);
    
    // Create route object
    const route: TravelRoute = {
      id: editingRouteIndex !== null ? currentRoute.id! : generateId(),
      transportType: data.type as TravelRoute['transportType'],
      from: data.from as string,
      to: data.to as string,
      fromCoords: fromLocation?.coordinates || [0, 0],
      toCoords: toLocation?.coordinates || [0, 0],
      date: data.date as string,
      notes: data.notes as string || '',
      duration: data.duration as string || ''
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
    onRouteAdded(route);
    
    // Reset form
    setCurrentRoute({
      transportType: 'plane',
      from: '',
      to: '',
      fromCoords: [0, 0],
      toCoords: [0, 0],
      date: '',
      notes: '',
      duration: ''
    });
    
    if (editingRouteIndex !== null) {
      setEditingRouteIndex(null);
    }
  }

  const transportationTypes: { value: TravelRoute['transportType']; label: string }[] = [
    { value: 'plane', label: 'Flight' },
    { value: 'train', label: 'Train' },
    { value: 'bus', label: 'Bus' },
    { value: 'car', label: 'Car' },
    { value: 'ferry', label: 'Ferry' },
    { value: 'bike', label: 'Bike' },
    { value: 'walk', label: 'Walking' },
    { value: 'boat', label: 'Boat' },
    { value: 'metro', label: 'Metro' }
  ];

  return (
    <div className="bg-gray-50 p-4 rounded-md mb-4">
      <h4 className="font-medium mb-3">
        {editingRouteIndex !== null ? 'Edit Route' : 'Add Route'}
      </h4>
      
      <form action={submitRouteAction} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="route-type" className="block text-sm font-medium text-gray-700 mb-1">
            Transportation Type *
          </label>
          <select
            id="route-type"
            name="type"
            defaultValue={currentRoute.transportType || 'plane'}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {transportationTypes.map(type => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="route-date" className="block text-sm font-medium text-gray-700 mb-1">
            Date *
          </label>
          <input
            id="route-date"
            name="date"
            type="date"
            defaultValue={currentRoute.date || ''}
            required
            data-testid="route-date"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="route-from" className="block text-sm font-medium text-gray-700 mb-1">
            From Location *
          </label>
          <select
            id="route-from"
            name="from"
            defaultValue={currentRoute.from || ''}
            onChange={(e) => setCurrentRoute((prev: Partial<TravelRoute>) => ({ ...prev, from: e.target.value }))}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select From Location</option>
            {locationOptions.map(location => (
              <option key={location.name} value={location.name}>{location.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="route-to" className="block text-sm font-medium text-gray-700 mb-1">
            To Location *
          </label>
          <select
            id="route-to"
            name="to"
            defaultValue={currentRoute.to || ''}
            onChange={(e) => setCurrentRoute((prev: Partial<TravelRoute>) => ({ ...prev, to: e.target.value }))}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select To Location</option>
            {locationOptions.map(location => (
              <option key={location.name} value={location.name}>{location.name}</option>
            ))}
          </select>
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
            Notes (optional)
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
                  date: '',
                  notes: '',
                  duration: ''
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