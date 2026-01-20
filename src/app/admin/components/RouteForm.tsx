'use client';

import React, { useState } from 'react';
import { TravelRoute, TravelRouteSegment } from '@/app/types';
import { transportationTypes, transportationLabels } from '@/app/lib/routeUtils';
import CostTrackingLinksManager from './CostTrackingLinksManager';
import AriaSelect from './AriaSelect';
import AriaComboBox from './AriaComboBox';
import AccessibleDatePicker from './AccessibleDatePicker';

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
  tripId?: string; // Add tripId for expense scoping
}

export default function RouteForm({
  currentRoute,
  setCurrentRoute,
  onRouteAdded,
  editingRouteIndex,
  setEditingRouteIndex,
  locationOptions,
  tripId,
  onGeocode
}: RouteFormProps) {
  const [validationError, setValidationError] = useState<string>('');
  const [geocodingInProgress, setGeocodingInProgress] = useState<Record<string, boolean>>({});

  const geocodeSegmentLocation = async (
    locationName: string,
    segmentId: string,
    field: 'from' | 'to'
  ): Promise<[number, number] | null> => {
    if (!onGeocode) return null;

    const location = locationOptions.find(loc => loc.name === locationName);
    if (location) {
      return location.coordinates;
    }

    try {
      setGeocodingInProgress(prev => ({ ...prev, [`${segmentId}-${field}`]: true }));
      const coords = await onGeocode(locationName);
      setGeocodingInProgress(prev => ({ ...prev, [`${segmentId}-${field}`]: false }));
      return coords;
    } catch (error) {
      console.warn(`Failed to geocode ${field} location for segment ${segmentId}:`, error);
      setGeocodingInProgress(prev => ({ ...prev, [`${segmentId}-${field}`]: false }));
      return null;
    }
  };

  // React 19 Action for adding/updating routes
  async function submitRouteAction(formData: FormData) {
    setValidationError('');
    const data = Object.fromEntries(formData);
    const hasSubRoutes = (currentRoute.subRoutes?.length || 0) > 0;

    if (hasSubRoutes) {
      // Validate all segments
      const allSegmentsValid = currentRoute.subRoutes?.every(segment =>
        segment.transportType && segment.from.trim() && segment.to.trim() && segment.date
      );

      if (!allSegmentsValid) {
        setValidationError('Please complete all sub-route fields.');
        return;
      }

      // Validate segment connectivity
      const firstSegment = currentRoute.subRoutes![0];
      const lastSegment = currentRoute.subRoutes![currentRoute.subRoutes!.length - 1];

      for (let i = 0; i < currentRoute.subRoutes!.length; i++) {
        const segment = currentRoute.subRoutes![i];
        if (segment.from === segment.to) {
          setValidationError(`Segment ${i + 1}: From and To locations must be different.`);
          return;
        }
      }

      for (let i = 1; i < currentRoute.subRoutes!.length; i++) {
        const prev = currentRoute.subRoutes![i - 1];
        const curr = currentRoute.subRoutes![i];
        if (prev.to !== curr.from) {
          setValidationError(`Segment ${i + 1} must start where segment ${i} ends (${prev.to}).`);
          return;
        }
      }

      // Create route with subRoutes
      const route: TravelRoute = {
        id: editingRouteIndex !== null ? currentRoute.id! : generateId(),
        transportType: 'plane',
        from: firstSegment.from,
        to: lastSegment.to,
        fromCoords: firstSegment.fromCoords || [0, 0],
        toCoords: lastSegment.toCoords || [0, 0],
        date: firstSegment.date,
        notes: data.notes as string || '',
        privateNotes: data.privateNotes as string || '',
        useManualRoutePoints: false,
        isReturn: data.isReturn === 'on',
        costTrackingLinks: currentRoute.costTrackingLinks || [],
        subRoutes: currentRoute.subRoutes
      };

      await onRouteAdded(route);
      resetForm();
      return;
    }

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
      privateNotes: data.privateNotes as string || '',
      useManualRoutePoints: false,
      isReturn: data.isReturn === 'on',
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
    resetForm();
  }

  function resetForm() {
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
      costTrackingLinks: [],
      useManualRoutePoints: false,
      isReturn: false,
      subRoutes: undefined
    });

    if (editingRouteIndex !== null) {
      setEditingRouteIndex(null);
    }
  }

  const addSubRoute = async () => {
    const existingSubRoutes = currentRoute.subRoutes || [];
    const lastSegment = existingSubRoutes[existingSubRoutes.length - 1];
    const fromName = lastSegment?.to || currentRoute.from || '';
    const toName = currentRoute.to || lastSegment?.to || '';
    
    let fromCoords = locationOptions.find(loc => loc.name === fromName)?.coordinates || currentRoute.fromCoords;
    let toCoords = locationOptions.find(loc => loc.name === toName)?.coordinates || currentRoute.toCoords;

    const newSegmentId = generateId();

    if (!fromCoords || fromCoords[0] === 0 && fromCoords[1] === 0) {
      const geocoded = await geocodeSegmentLocation(fromName, newSegmentId, 'from');
      if (geocoded) fromCoords = geocoded;
    }
    
    if (!toCoords || toCoords[0] === 0 && toCoords[1] === 0) {
      const geocoded = await geocodeSegmentLocation(toName, newSegmentId, 'to');
      if (geocoded) toCoords = geocoded;
    }
    
    const newSegment: TravelRouteSegment = {
      id: newSegmentId,
      from: fromName,
      to: toName,
      fromCoords: fromCoords || [0, 0],
      toCoords: toCoords || [0, 0],
      transportType: currentRoute.transportType || 'plane',
      date: currentRoute.date || new Date(),
      duration: '',
      notes: '',
      privateNotes: '',
      costTrackingLinks: [],
      useManualRoutePoints: false,
      isReturn: false
    };
    
    setCurrentRoute(prev => ({
      ...prev,
      subRoutes: [...existingSubRoutes, newSegment]
    }));
  };

  const updateSubRoute = (index: number, updates: Partial<TravelRouteSegment>) => {
    const subRoutes = [...(currentRoute.subRoutes || [])];
    subRoutes[index] = { ...subRoutes[index], ...updates } as TravelRouteSegment;
    setCurrentRoute(prev => ({
      ...prev,
      subRoutes
    }));
  };

  const removeSubRoute = (index: number) => {
    const subRoutes = currentRoute.subRoutes?.filter((_, i) => i !== index);
    setCurrentRoute(prev => ({
      ...prev,
      subRoutes
    }));
  };

  const moveSubRoute = (index: number, direction: -1 | 1) => {
    const subRoutes = [...(currentRoute.subRoutes || [])];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= subRoutes.length) return;
    const [moved] = subRoutes.splice(index, 1);
    subRoutes.splice(targetIndex, 0, moved);
    setCurrentRoute(prev => ({
      ...prev,
      subRoutes
    }));
  };

  const hasSubRoutes = (currentRoute.subRoutes?.length || 0) > 0;

  const transportOptions = transportationTypes.map(type => ({
    value: type,
    label: transportationLabels[type]
  }));

  return (
    <div className="bg-gray-50 p-4 rounded-md mb-4">
      <h4 className="font-medium mb-3">
        {editingRouteIndex !== null ? 'Edit Route' : 'Add Route'}
      </h4>

      {validationError && (
        <div className="mb-3 p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded text-sm text-red-700 dark:text-red-300">
          {validationError}
        </div>
      )}

      <form
        key={editingRouteIndex !== null ? `edit-${currentRoute.id}` : 'new'}
        action={submitRouteAction}
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        <div>
          <label htmlFor="route-type" className="block text-sm font-medium text-gray-700 mb-1">
            Transportation Type {hasSubRoutes ? '' : '*'}
          </label>
          <AriaSelect
            id="route-type"
            name="type"
            defaultValue={currentRoute.transportType || 'plane'}
            required={!hasSubRoutes}
            options={transportOptions}
            placeholder="Select Transportation"
            disabled={hasSubRoutes}
          />
          {hasSubRoutes && (
            <p className="text-xs text-gray-500 mt-1">Type derived from segments</p>
          )}
        </div>

        <div>
          <label htmlFor="route-date" className="block text-sm font-medium text-gray-700 mb-1">
            Date *
          </label>
          <AccessibleDatePicker
            id="route-date"
            name="date"
            required
            className="w-full"
            defaultValue={currentRoute.date instanceof Date ? currentRoute.date : (currentRoute.date ? new Date(currentRoute.date) : null)}
            data-testid="route-date"
          />
        </div>

        <div>
          <label htmlFor="route-from" className="block text-sm font-medium text-gray-700 mb-1">
            From Location *
          </label>
          {hasSubRoutes ? (
            <input
              id="route-from"
              name="from"
              type="text"
              value={currentRoute.subRoutes?.[0]?.from || ''}
              disabled
              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
            />
          ) : (
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
          )}
        </div>

        <div>
          <label htmlFor="route-to" className="block text-sm font-medium text-gray-700 mb-1">
            To Location *
          </label>
          {hasSubRoutes ? (
            <input
              id="route-to"
              name="to"
              type="text"
              value={currentRoute.subRoutes?.[currentRoute.subRoutes.length - 1]?.to || ''}
              disabled
              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
            />
          ) : (
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
          )}
        </div>

        {hasSubRoutes ? (
          <div className="md:col-span-2">
            <div className="block text-sm font-medium text-gray-700 mb-1">
              Duration
            </div>
            <div className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100">
              {currentRoute.subRoutes?.map(s => s.duration?.trim()).filter(Boolean).join(' + ') || 'Set duration on each segment'}
            </div>
            <p className="text-xs text-gray-500 mt-1">Duration is derived from segments.</p>
          </div>
        ) : (
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
        )}

        <div className="flex items-center mt-6">
          <input
            id="route-is-return"
            name="isReturn"
            type="checkbox"
            defaultChecked={currentRoute.isReturn}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label htmlFor="route-is-return" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">
            Return Route (shown as ⇆)
          </label>
        </div>

        {/* Sub-routes */}
        <div className="md:col-span-2 border border-blue-200 bg-blue-50 rounded p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-blue-800">Sub-routes</div>
              <p className="text-xs text-blue-700">
                Compose this route from segments. Start/end are derived from first/last segment.
              </p>
            </div>
            <button
              type="button"
              onClick={addSubRoute}
              className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
            >
              Add segment
            </button>
          </div>
          {hasSubRoutes ? (
            <div className="space-y-3">
              {currentRoute.subRoutes?.map((segment, index) => (
                <div key={segment.id} className="border border-blue-200 rounded p-3 bg-white">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold text-gray-700">
                      Segment {index + 1}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => moveSubRoute(index, -1)}
                        disabled={index === 0}
                        className="px-2 py-1 text-xs rounded bg-gray-200 text-gray-700 disabled:opacity-50"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSubRoute(index, 1)}
                        disabled={index === (currentRoute.subRoutes?.length || 0) - 1}
                        className="px-2 py-1 text-xs rounded bg-gray-200 text-gray-700 disabled:opacity-50"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSubRoute(index)}
                        className="px-2 py-1 text-xs rounded bg-red-100 text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor={`sub-route-type-${segment.id}`} className="block text-xs font-medium text-gray-700 mb-1">
                        Transportation *
                      </label>
                      <AriaSelect
                        id={`sub-route-type-${segment.id}`}
                        value={segment.transportType}
                        onChange={(value) => updateSubRoute(index, { transportType: value as TravelRoute['transportType'] })}
                        className="w-full px-2 py-1 text-sm"
                        required
                        options={transportOptions}
                        placeholder="Select Transportation"
                      />
                    </div>
                    <div>
                      <label htmlFor={`sub-route-duration-${segment.id}`} className="block text-xs font-medium text-gray-700 mb-1">
                        Duration
                      </label>
                      <input
                        id={`sub-route-duration-${segment.id}`}
                        type="text"
                        value={segment.duration || ''}
                        onChange={(e) => updateSubRoute(index, { duration: e.target.value })}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                        placeholder="e.g., 2h 30m"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span id={`sub-route-date-label-${segment.id}`} className="block text-xs font-medium text-gray-700 mb-1">
                        Date *
                      </span>
                      <AccessibleDatePicker
                        id={`sub-route-date-${segment.id}`}
                        value={segment.date instanceof Date ? segment.date : (segment.date ? new Date(segment.date) : null)}
                        onChange={(d) => d && updateSubRoute(index, { date: d })}
                        required
                        aria-labelledby={`sub-route-date-label-${segment.id}`}
                        className="text-sm"
                      />
                      {geocodingInProgress[`${segment.id}-date`] && (
                        <span className="text-xs text-blue-600 ml-2">Loading...</span>
                      )}
                    </div>
                    <div />
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <label htmlFor={`sub-route-from-${segment.id}`} className="block text-xs font-medium text-gray-700 mb-1">
                        From *
                      </label>
                      <AriaComboBox
                        id={`sub-route-from-${segment.id}`}
                        value={segment.from}
                        onChange={(value) => updateSubRoute(index, { from: value })}
                        className="w-full px-2 py-1 text-sm"
                        options={locationOptions.map(location => ({ value: location.name, label: location.name }))}
                        placeholder="From location"
                        required
                        allowsCustomValue={true}
                      />
                      {geocodingInProgress[`${segment.id}-from`] && (
                        <span className="text-xs text-blue-600 ml-2">Loading...</span>
                      )}
                    </div>
                    <div>
                      <label htmlFor={`sub-route-to-${segment.id}`} className="block text-xs font-medium text-gray-700 mb-1">
                        To *
                      </label>
                      <AriaComboBox
                        id={`sub-route-to-${segment.id}`}
                        value={segment.to}
                        onChange={(value) => updateSubRoute(index, { to: value })}
                        className="w-full px-2 py-1 text-sm"
                        options={locationOptions.map(location => ({ value: location.name, label: location.name }))}
                        placeholder="To location"
                        required
                        allowsCustomValue={true}
                      />
                      {geocodingInProgress[`${segment.id}-to`] && (
                        <span className="text-xs text-blue-600 ml-2">Loading...</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center mt-2">
                    <input
                      id={`sub-route-return-${segment.id}`}
                      type="checkbox"
                      checked={segment.isReturn || false}
                      onChange={(e) => updateSubRoute(index, { isReturn: e.target.checked })}
                      className="h-3.5 w-3.5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor={`sub-route-return-${segment.id}`} className="ml-2 block text-xs text-gray-700">
                      Return Route (shown as ⇆)
                    </label>
                  </div>

                  <div className="mt-2">
                    <label htmlFor={`sub-route-notes-${segment.id}`} className="block text-xs font-medium text-gray-700 mb-1">
                      Public Notes
                    </label>
                    <textarea
                      id={`sub-route-notes-${segment.id}`}
                      value={segment.notes || ''}
                      onChange={(e) => updateSubRoute(index, { notes: e.target.value })}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      rows={2}
                      placeholder="Segment details..."
                    />
                  </div>

                  <div className="mt-2">
                    <label htmlFor={`sub-route-private-notes-${segment.id}`} className="block text-xs font-medium text-gray-700 mb-1">
                      Private Notes <span className="text-xs bg-red-100 text-red-700 px-1 py-0.5 rounded">Private</span>
                    </label>
                    <textarea
                      id={`sub-route-private-notes-${segment.id}`}
                      value={segment.privateNotes || ''}
                      onChange={(e) => updateSubRoute(index, { privateNotes: e.target.value })}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      rows={2}
                      placeholder="Segment private details..."
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-gray-600">
              No segments yet. Add one to compose route.
            </div>
          )}
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
          {tripId ? (
            <CostTrackingLinksManager
              tripId={tripId}
              travelItemId={currentRoute.id || 'temp-route'}
              travelItemType="route"
            />
          ) : (
            <div className="text-sm text-gray-500 dark:text-gray-400 italic p-2 bg-gray-100 dark:bg-gray-600 rounded">
              💡 Expense linking will be available after saving this route
            </div>
          )}
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
                  costTrackingLinks: [],
                  useManualRoutePoints: false,
                  isReturn: false,
                  subRoutes: undefined
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
