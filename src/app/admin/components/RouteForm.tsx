'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { TravelRoute, TravelRouteSegment } from '@/app/types';
import { transportationTypes, transportationLabels, getCompositeTransportType } from '@/app/lib/routeUtils';
import { coerceValidDate } from '@/app/lib/dateUtils';
import { validateAndNormalizeCompositeRoute } from '@/app/lib/compositeRouteValidation';
import CostTrackingLinksManager from './CostTrackingLinksManager';
import AriaSelect from './AriaSelect';
import AriaComboBox from './AriaComboBox';
import AccessibleDatePicker from './AccessibleDatePicker';

/**
 * Creates a debounced version of a function that delays execution until after wait milliseconds
 * have elapsed since the last call. Returns an object with the debounced function and a cleanup method.
 */
function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
  func: T,
  wait: number
): { fn: (...args: Parameters<T>) => void; cancel: () => void } {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return {
    fn: (...args: Parameters<T>) => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    },
    cancel: () => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
    }
  };
}

/**
 * Generates a unique identifier using timestamp and random string.
 * @returns A unique string identifier.
 */
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

const parseDistanceOverride = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

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
  const [routeCoordOverrides, setRouteCoordOverrides] = useState<{ from: boolean; to: boolean }>({
    from: false,
    to: false
  });

  // Ref to track current subRoutes for updateSubRoute to avoid stale closure
  // and prevent useCallback from being recreated on every subRoutes change
  const subRoutesRef = useRef(currentRoute.subRoutes);
  useEffect(() => {
    subRoutesRef.current = currentRoute.subRoutes;
  }, [currentRoute.subRoutes]);

  useEffect(() => {
    setRouteCoordOverrides({ from: false, to: false });
  }, [editingRouteIndex, currentRoute.id]);

  useEffect(() => {
    setCurrentRoute(prev => {
      const hasSubRoutes = (prev.subRoutes?.length || 0) > 0;
      if (hasSubRoutes) {
        const derivedType = getCompositeTransportType(prev.subRoutes ?? [], prev.transportType || 'plane');
        if (prev.transportType !== derivedType) {
          return { ...prev, transportType: derivedType };
        }
      }
      if (!hasSubRoutes && prev.transportType === 'multimodal') {
        return { ...prev, transportType: 'plane' };
      }
      return prev;
    });
  }, [
    currentRoute.subRoutes?.length,
    currentRoute.subRoutes?.map(segment => segment.transportType).join('|'),
    setCurrentRoute
  ]);

  // Refs to track debounced geocoding functions for each segment
  type GeocodeFn = (locationName: string, field: 'from' | 'to') => Promise<void>;
  type Debouncer = ReturnType<typeof debounce<GeocodeFn>>;
  const geocodingDebouncersRef = useRef<Record<string, Debouncer>>({});

  // Cleanup all debounced functions on unmount
  useEffect(() => {
    return () => {
      Object.values(geocodingDebouncersRef.current).forEach(debouncer => debouncer.cancel());
    };
  }, []);

  /**
   * Geocodes a location name for a sub-route segment.
   * First checks locationOptions for existing coordinates, otherwise calls the geocoding API.
   * @param locationName - The name of the location to geocode
   * @param segmentId - The ID of the segment being geocoded (for loading state tracking)
   * @param field - Whether this is the 'from' or 'to' location
   * @returns The coordinates [longitude, latitude] or null if geocoding fails
   */
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

  const isZeroCoords = (coords?: [number, number]) => !coords || (coords[0] === 0 && coords[1] === 0);

  const handleRouteLocationChange = (field: 'from' | 'to', value: string) => {
    const locationMatch = locationOptions.find(loc => loc.name === value);
    const coords = locationMatch?.coordinates || [0, 0];

    setCurrentRoute((prev: Partial<TravelRoute>) => ({
      ...prev,
      ...(field === 'from' ? { from: value, fromCoords: coords } : { to: value, toCoords: coords })
    }));

    setRouteCoordOverrides(prev => ({ ...prev, [field]: false }));
  };

  const updateRouteCoord = (
    key: 'fromCoords' | 'toCoords',
    axis: 0 | 1,
    value: string
  ) => {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      return;
    }

    setCurrentRoute((prev: Partial<TravelRoute>) => {
      const coords = [...(prev[key] || [0, 0])] as [number, number];
      coords[axis] = parsed;
      return {
        ...prev,
        [key]: coords
      };
    });

    setRouteCoordOverrides(prev => ({
      ...prev,
      [key === 'fromCoords' ? 'from' : 'to']: true
    }));
  };

  /**
   * React 19 Action for adding/updating routes.
   * Validates route data, geocodes locations if needed, and calls onRouteAdded.
   * Supports both single routes and multi-segment routes (subRoutes).
   * @param formData - The form data containing route information
   * @throws Error if validation fails (missing required fields, from/to are same, segments not connected)
   */
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

      const subRoutes = currentRoute.subRoutes!;

      for (let i = 0; i < subRoutes.length; i++) {
        const segment = subRoutes[i];
        if (segment.from === segment.to) {
          setValidationError(`Segment ${i + 1}: From and To locations must be different.`);
          return;
        }
      }

      const validation = validateAndNormalizeCompositeRoute({
        ...currentRoute,
        subRoutes
      });

      if (!validation.ok) {
        if (validation.error.code === 'disconnected_segment') {
          setValidationError(`Sub-route ${validation.error.segmentNumber} must start where the previous segment ends.`);
          return;
        }
        if (validation.error.code === 'from_mismatch' || validation.error.code === 'to_mismatch') {
          setValidationError('Route start/end must match the first and last sub-routes.');
          return;
        }
        if (validation.error.code === 'from_coords_mismatch' || validation.error.code === 'to_coords_mismatch') {
          setValidationError('Sub-route coordinates do not align with route endpoints.');
          return;
        }
        setValidationError('Composite route validation failed.');
        return;
      }

      const normalizedRoute = validation.normalizedRoute;
      const normalizedSubRoutes = normalizedRoute.subRoutes as TravelRouteSegment[];
      const firstSegment = normalizedSubRoutes[0];
      const lastSegment = normalizedSubRoutes[normalizedSubRoutes.length - 1];

      // Derive transport type from segments - use 'multimodal' for multi-segment routes
      // since segments can have different transport types
      const derivedType = getCompositeTransportType(normalizedSubRoutes, 'multimodal');

      const route: TravelRoute = {
        id: editingRouteIndex !== null ? currentRoute.id! : generateId(),
        transportType: derivedType,
        from: firstSegment.from,
        to: lastSegment.to,
        fromCoords: firstSegment.fromCoords || [0, 0],
        toCoords: lastSegment.toCoords || [0, 0],
        date: firstSegment.date,
        notes: data.notes as string || '',
        privateNotes: data.privateNotes as string || '',
        useManualRoutePoints: false,
        isReturn: data.isReturn === 'on',
        doubleDistance: data.doubleDistance === 'on',
        costTrackingLinks: currentRoute.costTrackingLinks || [],
        subRoutes: normalizedSubRoutes
      };

      await onRouteAdded(route);
      resetForm();
      return;
    }

    // Find location coordinates based on selected names or geocode new ones
    const fromLocation = locationOptions.find(loc => loc.name === data.from);
    const toLocation = locationOptions.find(loc => loc.name === data.to);

    const hasManualFrom = routeCoordOverrides.from && !isZeroCoords(currentRoute.fromCoords);
    const hasManualTo = routeCoordOverrides.to && !isZeroCoords(currentRoute.toCoords);

    let fromCoords: [number, number] = hasManualFrom
      ? (currentRoute.fromCoords as [number, number])
      : (fromLocation?.coordinates || currentRoute.fromCoords || [0, 0]);
    let toCoords: [number, number] = hasManualTo
      ? (currentRoute.toCoords as [number, number])
      : (toLocation?.coordinates || currentRoute.toCoords || [0, 0]);

    // Geocode new locations if needed
    if (!hasManualFrom && !fromLocation && onGeocode) {
      try {
        fromCoords = await onGeocode(data.from as string);
      } catch (error) {
        console.warn('Failed to geocode from location:', error);
      }
    }

    if (!hasManualTo && !toLocation && onGeocode) {
      try {
        toCoords = await onGeocode(data.to as string);
      } catch (error) {
        console.warn('Failed to geocode to location:', error);
      }
    }

    // Create route object
    const distanceOverride = parseDistanceOverride((data.distanceOverride as string) || '');
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
      distanceOverride,
      privateNotes: data.privateNotes as string || '',
      useManualRoutePoints: false,
      isReturn: data.isReturn === 'on',
      doubleDistance: data.doubleDistance === 'on',
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

  /**
   * Resets the form to its default empty state.
   * Clears all route fields including subRoutes and exits edit mode.
   */
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
      distanceOverride: undefined,
      privateNotes: '',
      costTrackingLinks: [],
      useManualRoutePoints: false,
      isReturn: false,
      doubleDistance: false,
      subRoutes: undefined
    });

    setRouteCoordOverrides({ from: false, to: false });

    if (editingRouteIndex !== null) {
      setEditingRouteIndex(null);
    }
  }

  /**
   * Adds a new sub-route segment to the current route.
   * The new segment starts from the previous segment's destination (or route from)
   * and goes to the route's destination. Geocodes locations if coordinates are missing.
   */
  const addSubRoute = async () => {
    const existingSubRoutes = currentRoute.subRoutes || [];
    const lastSegment = existingSubRoutes[existingSubRoutes.length - 1];
    const fromName = lastSegment?.to || currentRoute.from || '';
    const toName = currentRoute.to || lastSegment?.to || '';
    const segmentDate = coerceValidDate(lastSegment?.date)
      ?? coerceValidDate(currentRoute.date)
      ?? new Date();
    
    const fromLocationCoords = locationOptions.find(loc => loc.name === fromName)?.coordinates;
    const toLocationCoords = locationOptions.find(loc => loc.name === toName)?.coordinates;

    let fromCoords = fromLocationCoords || (lastSegment ? lastSegment.toCoords : currentRoute.fromCoords);
    let toCoords = toLocationCoords || (toName === lastSegment?.to ? lastSegment?.toCoords : currentRoute.toCoords);

    const newSegmentId = generateId();

    if (!fromCoords || fromCoords[0] === 0 && fromCoords[1] === 0) {
      const geocoded = await geocodeSegmentLocation(fromName, newSegmentId, 'from');
      if (geocoded) fromCoords = geocoded;
    }
    
    if (!toCoords || toCoords[0] === 0 && toCoords[1] === 0) {
      const geocoded = await geocodeSegmentLocation(toName, newSegmentId, 'to');
      if (geocoded) toCoords = geocoded;
    }
    
    const segmentTransportType = lastSegment?.transportType
      || (currentRoute.transportType && currentRoute.transportType !== 'multimodal'
        ? currentRoute.transportType
        : 'plane');

    const newSegment: TravelRouteSegment = {
      id: newSegmentId,
      from: fromName,
      to: toName,
      fromCoords: fromCoords || [0, 0],
      toCoords: toCoords || [0, 0],
      transportType: segmentTransportType,
      date: segmentDate,
      duration: '',
      distanceOverride: undefined,
      notes: '',
      privateNotes: '',
      costTrackingLinks: [],
      useManualRoutePoints: false,
      isReturn: false,
      doubleDistance: false
    };
    
    setCurrentRoute(prev => ({
      ...prev,
      subRoutes: [...existingSubRoutes, newSegment]
    }));
  };

  /**
   * Updates a sub-route segment at the specified index.
   * If the 'from' or 'to' locations are changed, attempts to geocode the new location names
   * to get coordinates. Falls back to locationOptions lookup and defaults to [0, 0] if geocoding fails.
   * Geocoding is debounced to avoid freezing on every keystroke.
   * @param index - The index of the segment to update
   * @param updates - Partial updates to apply to the segment
   */
  const updateSubRoute = useCallback((index: number, updates: Partial<TravelRouteSegment>) => {
    // Capture the segment ID before any state updates - guard against undefined segment
    // Using ref to avoid stale closure and prevent useCallback recreation on every subRoutes change
    const currentSubRoutes = subRoutesRef.current || [];
    const segment = currentSubRoutes[index];
    if (!segment) return; // Guard: invalid index
    const segmentId = segment.id;

    setCurrentRoute(prev => {
      const subRoutes = [...(prev.subRoutes || [])];
      let updatedSegment = { ...subRoutes[index], ...updates } as TravelRouteSegment;

      const applyImmediateCoords = (
        field: 'from' | 'to',
        nextValue: string | undefined,
        previousValue: string
      ) => {
        if (nextValue === undefined || nextValue === previousValue) {
          return;
        }

        const locationMatch = locationOptions.find(loc => loc.name === nextValue);
        if (locationMatch) {
          updatedSegment = {
            ...updatedSegment,
            [`${field}Coords`]: locationMatch.coordinates
          } as TravelRouteSegment;
          return;
        }

        // Clear stale coordinates when switching to an unknown location.
        updatedSegment = {
          ...updatedSegment,
          [`${field}Coords`]: [0, 0]
        } as TravelRouteSegment;
      };

      if ('from' in updates) {
        applyImmediateCoords('from', updates.from, segment.from);
      }

      if ('to' in updates) {
        applyImmediateCoords('to', updates.to, segment.to);
      }

      // Update the state immediately for UI responsiveness
      subRoutes[index] = updatedSegment;
      return {
        ...prev,
        subRoutes
      };
    });

    // Helper function to geocode a location and update the segment by ID only
    // This avoids stale closure issues if segments are reordered
    const geocodeAndUpdate = async (locationName: string, field: 'from' | 'to') => {
      const location = locationOptions.find(loc => loc.name === locationName);
      if (location) {
        // Update with existing coordinates - use ID-only matching
        setCurrentRoute(prev => ({
          ...prev,
          subRoutes: prev.subRoutes?.map((s) =>
            s.id === segmentId
              ? { ...s, [`${field}Coords`]: location.coordinates }
              : s
          )
        }));
      } else if (onGeocode) {
        setGeocodingInProgress(prev => ({ ...prev, [`${segmentId}-${field}`]: true }));
        try {
          const coords = await onGeocode(locationName);
          setCurrentRoute(prev => ({
            ...prev,
            subRoutes: prev.subRoutes?.map((s) =>
              s.id === segmentId
                ? { ...s, [`${field}Coords`]: coords }
                : s
            )
          }));
        } catch {
          setCurrentRoute(prev => ({
            ...prev,
            subRoutes: prev.subRoutes?.map((s) =>
              s.id === segmentId
                ? { ...s, [`${field}Coords`]: [0, 0] }
                : s
            )
          }));
        } finally {
          setGeocodingInProgress(prev => ({ ...prev, [`${segmentId}-${field}`]: false }));
        }
      }
    };

    // Geocode 'from' location if it changed (debounced)
    if ('from' in updates && updates.from && segmentId) {
      const hasMatch = locationOptions.some(loc => loc.name === updates.from);
      if (!hasMatch) {
        const debouncerKey = `${segmentId}-from`;
        if (!geocodingDebouncersRef.current[debouncerKey]) {
          geocodingDebouncersRef.current[debouncerKey] = debounce(geocodeAndUpdate, 800);
        }
        geocodingDebouncersRef.current[debouncerKey].fn(updates.from, 'from');
      }
    }

    // Geocode 'to' location if it changed (debounced)
    if ('to' in updates && updates.to && segmentId) {
      const hasMatch = locationOptions.some(loc => loc.name === updates.to);
      if (!hasMatch) {
        const debouncerKey = `${segmentId}-to`;
        if (!geocodingDebouncersRef.current[debouncerKey]) {
          geocodingDebouncersRef.current[debouncerKey] = debounce(geocodeAndUpdate, 800);
        }
        geocodingDebouncersRef.current[debouncerKey].fn(updates.to, 'to');
      }
    }
  }, [locationOptions, onGeocode, setCurrentRoute]);

  const updateSubRouteCoord = (
    index: number,
    key: 'fromCoords' | 'toCoords',
    axis: 0 | 1,
    value: string
  ) => {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      return;
    }

    const currentSubRoutes = subRoutesRef.current || [];
    const segment = currentSubRoutes[index];
    if (!segment) return;

    const coords = [...(segment[key] || [0, 0])] as [number, number];
    coords[axis] = parsed;
    updateSubRoute(index, { [key]: coords } as Partial<TravelRouteSegment>);
  };

  /**
   * Removes a sub-route segment at the specified index.
   * @param index - The index of the segment to remove
   */
  const removeSubRoute = (index: number) => {
    const subRoutes = currentRoute.subRoutes?.filter((_, i) => i !== index);
    setCurrentRoute(prev => ({
      ...prev,
      subRoutes
    }));
  };

  /**
   * Moves a sub-route segment up or down in the segment order.
   * @param index - The index of the segment to move
   * @param direction - -1 to move up, 1 to move down
   */
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

  const segmentTransportOptions = transportationTypes
    .filter(type => type !== 'multimodal')
    .map(type => ({
      value: type,
      label: transportationLabels[type]
    }));

  const derivedRouteType = hasSubRoutes
    ? getCompositeTransportType(currentRoute.subRoutes ?? [], currentRoute.transportType || 'plane')
    : (currentRoute.transportType || 'plane');

  const routeTransportOptions = hasSubRoutes
    ? [{ value: derivedRouteType, label: transportationLabels[derivedRouteType] }]
    : segmentTransportOptions;

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
            key={`route-type-${hasSubRoutes ? derivedRouteType : 'single'}`}
            id="route-type"
            name="type"
            defaultValue={hasSubRoutes ? derivedRouteType : (currentRoute.transportType || 'plane')}
            required={!hasSubRoutes}
            options={routeTransportOptions}
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
            value={coerceValidDate(currentRoute.date)}
            onChange={(date) => setCurrentRoute(prev => ({ ...prev, date: date ?? undefined }))}
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
              onChange={(value) => handleRouteLocationChange('from', value)}
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
              onChange={(value) => handleRouteLocationChange('to', value)}
              required
              options={locationOptions.map(location => ({ value: location.name, label: location.name }))}
              placeholder="Enter location name (new locations will be created)"
              allowsCustomValue={true}
            />
          )}
        </div>

        {!hasSubRoutes && (
          <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <div className="block text-sm font-medium text-gray-700 mb-1">
                From Coordinates
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  step="any"
                  aria-label="From latitude"
                  value={currentRoute.fromCoords?.[0] ?? 0}
                  onChange={(e) => updateRouteCoord('fromCoords', 0, e.target.value)}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                  placeholder="Lat"
                />
                <input
                  type="number"
                  step="any"
                  aria-label="From longitude"
                  value={currentRoute.fromCoords?.[1] ?? 0}
                  onChange={(e) => updateRouteCoord('fromCoords', 1, e.target.value)}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                  placeholder="Lng"
                />
              </div>
            </div>
            <div>
              <div className="block text-sm font-medium text-gray-700 mb-1">
                To Coordinates
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  step="any"
                  aria-label="To latitude"
                  value={currentRoute.toCoords?.[0] ?? 0}
                  onChange={(e) => updateRouteCoord('toCoords', 0, e.target.value)}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                  placeholder="Lat"
                />
                <input
                  type="number"
                  step="any"
                  aria-label="To longitude"
                  value={currentRoute.toCoords?.[1] ?? 0}
                  onChange={(e) => updateRouteCoord('toCoords', 1, e.target.value)}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                  placeholder="Lng"
                />
              </div>
            </div>
          </div>
        )}

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

        {!hasSubRoutes && (
          <div>
            <label htmlFor="route-distance-override" className="block text-sm font-medium text-gray-700 mb-1">
              Distance override (km)
            </label>
            <input
              id="route-distance-override"
              name="distanceOverride"
              type="number"
              min="0"
              step="any"
              defaultValue={currentRoute.distanceOverride ?? ''}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Optional"
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

        {!hasSubRoutes && (
          <div className="flex items-center">
            <input
              id="route-double-distance"
              name="doubleDistance"
              type="checkbox"
              defaultChecked={currentRoute.doubleDistance}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="route-double-distance" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">
              Count distance twice (for return trips)
            </label>
          </div>
        )}

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
                        options={segmentTransportOptions}
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
                    <div>
                      <label htmlFor={`sub-route-distance-${segment.id}`} className="block text-xs font-medium text-gray-700 mb-1">
                        Distance override (km)
                      </label>
                      <input
                        id={`sub-route-distance-${segment.id}`}
                        type="number"
                        min="0"
                        step="any"
                        value={segment.distanceOverride ?? ''}
                        onChange={(e) => updateSubRoute(index, { distanceOverride: parseDistanceOverride(e.target.value) })}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                        placeholder="Optional"
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

                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <div className="block text-xs font-medium text-gray-700 mb-1">
                        From Coordinates
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          step="any"
                          aria-label="From latitude"
                          value={segment.fromCoords?.[0] ?? 0}
                          onChange={(e) => updateSubRouteCoord(index, 'fromCoords', 0, e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                          placeholder="Lat"
                        />
                        <input
                          type="number"
                          step="any"
                          aria-label="From longitude"
                          value={segment.fromCoords?.[1] ?? 0}
                          onChange={(e) => updateSubRouteCoord(index, 'fromCoords', 1, e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                          placeholder="Lng"
                        />
                      </div>
                    </div>
                    <div>
                      <div className="block text-xs font-medium text-gray-700 mb-1">
                        To Coordinates
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          step="any"
                          aria-label="To latitude"
                          value={segment.toCoords?.[0] ?? 0}
                          onChange={(e) => updateSubRouteCoord(index, 'toCoords', 0, e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                          placeholder="Lat"
                        />
                        <input
                          type="number"
                          step="any"
                          aria-label="To longitude"
                          value={segment.toCoords?.[1] ?? 0}
                          onChange={(e) => updateSubRouteCoord(index, 'toCoords', 1, e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                          placeholder="Lng"
                        />
                      </div>
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

                  <div className="flex items-center mt-2">
                    <input
                      id={`sub-route-double-distance-${segment.id}`}
                      type="checkbox"
                      checked={segment.doubleDistance || false}
                      onChange={(e) => updateSubRoute(index, { doubleDistance: e.target.checked })}
                      className="h-3.5 w-3.5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor={`sub-route-double-distance-${segment.id}`} className="ml-2 block text-xs text-gray-700">
                      Count distance twice (for return trips)
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
                  distanceOverride: undefined,
                  privateNotes: '',
                  costTrackingLinks: [],
                  useManualRoutePoints: false,
                  isReturn: false,
                  doubleDistance: false,
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
