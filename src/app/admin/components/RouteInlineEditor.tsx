'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { Transportation, TravelRoute, TravelRouteSegment } from '@/app/types';
import { transportationTypes, transportationLabels, getCompositeTransportType } from '@/app/lib/routeUtils';
import { coerceValidDate } from '@/app/lib/dateUtils';
import { generateId } from '@/app/lib/costUtils';
import CostTrackingLinksManager from './CostTrackingLinksManager';
import AriaSelect from './AriaSelect';
import AriaComboBox from './AriaComboBox';
import AccessibleDatePicker from './AccessibleDatePicker';

interface RouteInlineEditorProps {
  route: TravelRoute;
  onSave: (route: TravelRoute) => void;
  onCancel: () => void;
  locationOptions: Array<{ name: string; coordinates: [number, number] }>;
  onGeocode?: (locationName: string) => Promise<[number, number]>;
  tripId?: string; // Add tripId for expense scoping
}

/**
 * Render an inline editor form for a TravelRoute, allowing edits to transport type, dates, locations, notes, optional manual GeoJSON route import, and expense-linking.
 *
 * @param route - Initial TravelRoute data used to populate the form fields.
 * @param onSave - Callback invoked with the updated TravelRoute when the form is saved.
 * @param onCancel - Callback invoked when the user cancels editing.
 * @param locationOptions - Available named locations with coordinates used for suggestions and coordinate resolution.
 * @param onGeocode - Optional function to resolve a freeform location name to `[lng, lat]` coordinates when a named location is not selected.
 * @param tripId - Optional trip identifier; when present enables linking the route to trip expense tracking.
 * @returns A JSX element containing the inline route editor UI.
 */
export default function RouteInlineEditor({
  route,
  onSave,
  onCancel,
  locationOptions,
  onGeocode,
  tripId
}: RouteInlineEditorProps) {
  const idPrefix = `route-inline-${useId().replace(/:/g, '')}`;
  const [formData, setFormData] = useState<TravelRoute>({
    ...route
  });
  const [importStatus, setImportStatus] = useState<string>('');
  const [importError, setImportError] = useState<string>('');
  const [segmentImportStatus, setSegmentImportStatus] = useState<Record<string, string>>({});
  const [segmentImportError, setSegmentImportError] = useState<Record<string, string>>({});
  const [validationError, setValidationError] = useState<string>('');
  const [segmentRefreshStatus, setSegmentRefreshStatus] = useState<Record<string, string>>({});
  const [routeCoordOverrides, setRouteCoordOverrides] = useState<{ from: boolean; to: boolean }>({
    from: false,
    to: false
  });
  const refreshTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const transportSelectId = `${idPrefix}-transport-type`;
  const dateLabelId = `${idPrefix}-date-label`;
  const datePickerId = `${idPrefix}-date`;
  const fromInputId = `${idPrefix}-from`;
  const toInputId = `${idPrefix}-to`;
  const durationInputId = `${idPrefix}-duration`;
  const returnCheckboxId = `${idPrefix}-is-return`;
  const doubleDistanceCheckboxId = `${idPrefix}-double-distance`;
  const publicNotesId = `${idPrefix}-notes`;
  const privateNotesId = `${idPrefix}-private-notes`;

  useEffect(() => {
    return () => {
      Object.values(refreshTimeouts.current).forEach(timeoutId => clearTimeout(timeoutId));
      refreshTimeouts.current = {};
    };
  }, []);

  useEffect(() => {
    setFormData(prev => {
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
    formData.subRoutes?.length,
    formData.subRoutes?.map(segment => segment.transportType).join('|')
  ]);

  const scheduleRefreshStatusClear = (statusKey: string, delay: number) => {
    const existingTimeout = refreshTimeouts.current[statusKey];
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    refreshTimeouts.current[statusKey] = setTimeout(() => {
      setSegmentRefreshStatus(prev => ({ ...prev, [statusKey]: '' }));
      delete refreshTimeouts.current[statusKey];
    }, delay);
  };

  const resolveLocationCoords = async (
    locationName: string,
    fallback?: [number, number],
    preferFallback: boolean = false
  ) => {
    if (preferFallback && fallback && (fallback[0] !== 0 || fallback[1] !== 0)) {
      return fallback;
    }

    const location = locationOptions.find(loc => loc.name === locationName);
    if (location) {
      return location.coordinates;
    }
    if (onGeocode) {
      try {
        return await onGeocode(locationName);
      } catch (error) {
        console.warn('Failed to geocode location:', error);
      }
    }
    return fallback || [0, 0];
  };

  const isZeroCoords = (coords?: [number, number]) => !coords || (coords[0] === 0 && coords[1] === 0);

  // Accept tiny coordinate drift from serialization/geocoding differences.
  const COORD_EPSILON = 1e-6;

  const isSamePoint = (left?: [number, number], right?: [number, number]) => {
    if (!left || !right) return false;
    return Math.abs(left[0] - right[0]) < COORD_EPSILON && Math.abs(left[1] - right[1]) < COORD_EPSILON;
  };

  const isSameLocationName = (left?: string, right?: string) => {
    if (!left || !right) return false;
    return left.trim().toLowerCase() === right.trim().toLowerCase();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');

    const hasSubRoutes = (formData.subRoutes?.length || 0) > 0;
    
    // Validate required fields
    if (!hasSubRoutes) {
      if (!formData.transportType || !formData.from.trim() || !formData.to.trim() || !formData.date) {
        setValidationError('Please fill in all required fields.');
        return;
      }

      if (formData.from === formData.to) {
        setValidationError('From and To locations must be different.');
        return;
      }
    } else {
      const allSegmentsValid = formData.subRoutes?.every(segment =>
        segment.transportType && segment.from.trim() && segment.to.trim() && segment.date
      );

      if (!allSegmentsValid) {
        setValidationError('Please complete all sub-route fields.');
        return;
      }
    }

    const updatedSubRoutes = formData.subRoutes
      ? await Promise.all(
          formData.subRoutes.map(async (segment) => {
            const fromCoords = await resolveLocationCoords(segment.from, segment.fromCoords, true);
            const toCoords = await resolveLocationCoords(segment.to, segment.toCoords, true);
            return {
              ...segment,
              fromCoords,
              toCoords
            };
          })
        )
      : undefined;

    if (updatedSubRoutes && updatedSubRoutes.length > 0) {
      const invalidSegment = updatedSubRoutes.find(segment => segment.from === segment.to);
      if (invalidSegment) {
        setValidationError('Sub-route From and To locations must be different.');
        return;
      }

      const disconnectedIndex = updatedSubRoutes.findIndex((segment, index) => {
        if (index === 0) return false;
        const previous = updatedSubRoutes[index - 1];
        const namesMatch = isSameLocationName(previous.to, segment.from);
        if (previous.to && segment.from && !namesMatch) {
          return true;
        }
        // If names match, allow minor coordinate drift.
        if (!namesMatch && previous.toCoords && segment.fromCoords && !isSamePoint(previous.toCoords, segment.fromCoords)) {
          return true;
        }
        return false;
      });

      if (disconnectedIndex > 0) {
        setValidationError(`Sub-route ${disconnectedIndex + 1} must start where the previous segment ends.`);
        return;
      }

      const first = updatedSubRoutes[0];
      const last = updatedSubRoutes[updatedSubRoutes.length - 1];

      const derivedType = getCompositeTransportType(updatedSubRoutes, formData.transportType || 'multimodal');

      onSave({
        ...formData,
        transportType: derivedType,
        subRoutes: updatedSubRoutes,
        from: first.from,
        to: last.to,
        fromCoords: first.fromCoords,
        toCoords: last.toCoords,
        routePoints: undefined,
        useManualRoutePoints: false
      });
      return;
    }

    // Update coordinates based on location selection or geocode (unless user overrode them)
    const fromCoords = routeCoordOverrides.from && !isZeroCoords(formData.fromCoords)
      ? (formData.fromCoords as [number, number])
      : await resolveLocationCoords(formData.from, formData.fromCoords);
    const toCoords = routeCoordOverrides.to && !isZeroCoords(formData.toCoords)
      ? (formData.toCoords as [number, number])
      : await resolveLocationCoords(formData.to, formData.toCoords);

    onSave({
      ...formData,
      fromCoords,
      toCoords
    });
  };

  const updateSubRoute = (index: number, updates: Partial<TravelRouteSegment>) => {
    setFormData(prev => {
      const subRoutes = [...(prev.subRoutes || [])];
      subRoutes[index] = { ...subRoutes[index], ...updates } as TravelRouteSegment;
      return {
        ...prev,
        subRoutes
      };
    });
  };

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

    setFormData(prev => {
      const subRoutes = [...(prev.subRoutes || [])];
      const existing = subRoutes[index];
      const coords = [...(existing[key] || [0, 0])] as [number, number];
      coords[axis] = parsed;
      subRoutes[index] = { ...existing, [key]: coords } as TravelRouteSegment;
      return {
        ...prev,
        subRoutes
      };
    });
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

    setFormData(prev => {
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

  const handleRouteLocationChange = (field: 'from' | 'to', value: string) => {
    const locationMatch = locationOptions.find(loc => loc.name === value);
    const coords = locationMatch?.coordinates || [0, 0];

    setFormData(prev => ({
      ...prev,
      ...(field === 'from' ? { from: value, fromCoords: coords } : { to: value, toCoords: coords })
    }));

    setRouteCoordOverrides(prev => ({ ...prev, [field]: false }));
  };

  const addSubRoute = () => {
    setFormData(prev => {
      const existingSubRoutes = prev.subRoutes || [];
      const lastSegment = existingSubRoutes[existingSubRoutes.length - 1];
      const fromName = lastSegment?.to || prev.from;
      const toName = prev.to || lastSegment?.to || '';
      const fromLocationCoords = locationOptions.find(loc => loc.name === fromName)?.coordinates;
      const toLocationCoords = locationOptions.find(loc => loc.name === toName)?.coordinates;

      const fromCoords = fromLocationCoords || (lastSegment ? lastSegment.toCoords : prev.fromCoords);
      const toCoords = toLocationCoords || (toName === lastSegment?.to ? lastSegment?.toCoords : prev.toCoords);
      const segmentDate = coerceValidDate(lastSegment?.date)
        ?? coerceValidDate(prev.date)
        ?? new Date();

      const segmentTransportType = lastSegment?.transportType
        || (prev.transportType && prev.transportType !== 'multimodal'
          ? prev.transportType
          : 'plane');

      const newSegment: TravelRouteSegment = {
        id: generateId(),
        from: fromName,
        to: toName,
        fromCoords: fromCoords || [0, 0],
        toCoords: toCoords || [0, 0],
        transportType: segmentTransportType,
        date: segmentDate,
        duration: '',
        notes: '',
        privateNotes: '',
        costTrackingLinks: [],
        useManualRoutePoints: false,
        isReturn: false,
        doubleDistance: false
      };

      return {
        ...prev,
        subRoutes: [...existingSubRoutes, newSegment]
      };
    });
  };

  const removeSubRoute = (index: number) => {
    setFormData(prev => {
      const subRoutes = prev.subRoutes?.filter((_, i) => i !== index);
      return {
        ...prev,
        subRoutes
      };
    });
  };

  const moveSubRoute = (index: number, direction: -1 | 1) => {
    setFormData(prev => {
      const subRoutes = [...(prev.subRoutes || [])];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= subRoutes.length) return prev;
      const [moved] = subRoutes.splice(index, 1);
      subRoutes.splice(targetIndex, 0, moved);
      return {
        ...prev,
        subRoutes
      };
    });
  };

  const extractCoordinates = (geojson: unknown): [number, number][] | null => {
    const toLatLng = (pair: unknown): [number, number] | null => {
      if (!Array.isArray(pair) || pair.length < 2) return null;
      const [lng, lat] = pair;
      if (typeof lat !== 'number' || typeof lng !== 'number') return null;
      return [lat, lng];
    };

    const pickLine = (geometry: unknown): unknown[] | null => {
      if (!geometry || typeof geometry !== 'object') return null;
      const geom = geometry as { type?: unknown; coordinates?: unknown };
      if (geom.type === 'LineString' && Array.isArray(geom.coordinates)) {
        return geom.coordinates;
      }
      if (
        geom.type === 'MultiLineString' &&
        Array.isArray(geom.coordinates) &&
        Array.isArray((geom.coordinates as unknown[])[0])
      ) {
        return (geom.coordinates as unknown[])[0] as unknown[];
      }
      return null;
    };

    if (
      geojson &&
      typeof geojson === 'object' &&
      (geojson as { type?: unknown }).type === 'FeatureCollection'
    ) {
      const features = (geojson as { features?: unknown }).features;
      if (Array.isArray(features)) {
        for (const feature of features) {
          const geometry = (feature as { geometry?: unknown }).geometry;
          const coords = pickLine(geometry);
          if (coords) {
            const normalized = coords.map(toLatLng).filter((val): val is [number, number] => Boolean(val));
            if (normalized.length) return normalized;
          }
        }
      }
    }

    if (geojson && typeof geojson === 'object' && (geojson as { type?: unknown }).type === 'Feature') {
      const geometry = (geojson as { geometry?: unknown }).geometry;
      const coords = pickLine(geometry);
      if (coords) return coords.map(toLatLng).filter((val): val is [number, number] => Boolean(val));
    }

    if (geojson && typeof geojson === 'object') {
      const type = (geojson as { type?: unknown }).type;
      if (type === 'LineString' || type === 'MultiLineString') {
        const coords = pickLine(geojson);
        if (coords) return coords.map(toLatLng).filter((val): val is [number, number] => Boolean(val));
      }
    }

    return null;
  };

  const handleGeoJSONImport = async (file: File) => {
    setImportError('');
    setImportStatus('Importing...');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const rawCoords = extractCoordinates(parsed);

      if (!rawCoords || rawCoords.length === 0) {
        throw new Error('No LineString coordinates found in GeoJSON');
      }

      setFormData(prev => ({
        ...prev,
        routePoints: rawCoords,
        useManualRoutePoints: true
      }));
      setImportStatus(`Imported ${rawCoords.length} points from ${file.name}`);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to import GeoJSON');
      setImportStatus('');
    }
  };

  const handleSubRouteGeoJSONImport = async (segmentId: string, file: File) => {
    setSegmentImportError(prev => ({ ...prev, [segmentId]: '' }));
    setSegmentImportStatus(prev => ({ ...prev, [segmentId]: 'Importing...' }));

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const rawCoords = extractCoordinates(parsed);

      if (!rawCoords || rawCoords.length === 0) {
        throw new Error('No LineString coordinates found in GeoJSON');
      }

      setFormData(prev => {
        const subRoutes = prev.subRoutes?.map(segment =>
          segment.id === segmentId
            ? { ...segment, routePoints: rawCoords, useManualRoutePoints: true }
            : segment
        );
        return {
          ...prev,
          subRoutes
        };
      });

      setSegmentImportStatus(prev => ({
        ...prev,
        [segmentId]: `Imported ${rawCoords.length} points from ${file.name}`
      }));
    } catch (err) {
      setSegmentImportError(prev => ({
        ...prev,
        [segmentId]: err instanceof Error ? err.message : 'Failed to import GeoJSON'
      }));
      setSegmentImportStatus(prev => ({ ...prev, [segmentId]: '' }));
    }
  };

  const clearSubRouteManualRoute = (segmentId: string) => {
    setFormData(prev => {
      const subRoutes = prev.subRoutes?.map(segment =>
        segment.id === segmentId
          ? { ...segment, routePoints: undefined, useManualRoutePoints: false }
          : segment
      );
      return {
        ...prev,
        subRoutes
      };
    });
    setSegmentImportStatus(prev => ({ ...prev, [segmentId]: '' }));
    setSegmentImportError(prev => ({ ...prev, [segmentId]: '' }));
  };

  const clearManualRoute = () => {
    setFormData(prev => ({
      ...prev,
      routePoints: undefined,
      useManualRoutePoints: false
    }));
    setImportStatus('');
    setImportError('');
  };

  const refreshSegmentCoords = async (index: number, key: 'fromCoords' | 'toCoords') => {
    const segment = formData.subRoutes?.[index];
    if (!segment) return;

    const statusKey = `${segment.id}-${key}`;
    const locationName = key === 'fromCoords' ? segment.from : segment.to;
    const existingCoords = segment[key];

    try {
      setSegmentRefreshStatus(prev => ({ ...prev, [statusKey]: 'Refreshing...' }));
      const coords = await resolveLocationCoords(locationName, existingCoords, false);

      // Only update if we got valid coordinates (not fallback [0,0])
      if (coords[0] !== 0 || coords[1] !== 0 || (existingCoords && existingCoords[0] === 0 && existingCoords[1] === 0)) {
        setFormData(prev => {
          const subRoutes = [...(prev.subRoutes || [])];
          subRoutes[index] = { ...subRoutes[index], [key]: coords } as TravelRouteSegment;
          return {
            ...prev,
            subRoutes
          };
        });
        setSegmentRefreshStatus(prev => ({ ...prev, [statusKey]: 'Updated' }));
      } else {
        setSegmentRefreshStatus(prev => ({ ...prev, [statusKey]: 'Not found' }));
      }

      scheduleRefreshStatusClear(statusKey, 2000);
    } catch (error) {
      console.warn('Failed to refresh coordinates:', error);
      setSegmentRefreshStatus(prev => ({
        ...prev,
        [statusKey]: 'Failed'
      }));
      scheduleRefreshStatusClear(statusKey, 3000);
    }
  };

  const hasSubRoutes = (formData.subRoutes?.length || 0) > 0;

  const segmentTransportOptions = transportationTypes
    .filter(type => type !== 'multimodal')
    .map(type => ({
      value: type,
      label: transportationLabels[type]
    }));

  const derivedRouteType = hasSubRoutes
    ? getCompositeTransportType(formData.subRoutes ?? [], formData.transportType || 'plane')
    : (formData.transportType || 'plane');

  const routeTransportOptions = hasSubRoutes
    ? [{ value: derivedRouteType, label: transportationLabels[derivedRouteType] }]
    : segmentTransportOptions;

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-4 shadow-sm">
      <form onSubmit={handleSubmit} className="space-y-3">
        {validationError && (
          <div className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded p-2">
            {validationError}
          </div>
        )}
        {/* Transport Type and Date */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor={transportSelectId} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Transportation *
            </label>
            <AriaSelect
              id={transportSelectId}
              value={hasSubRoutes ? derivedRouteType : formData.transportType}
              onChange={(value) => setFormData(prev => ({ ...prev, transportType: value as Transportation['type'] }))}
              className="w-full px-2 py-1 text-sm"
              required
              options={routeTransportOptions}
              placeholder="Select Transportation"
              disabled={hasSubRoutes}
            />
          </div>
          <div>
            <span id={dateLabelId} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Date *
            </span>
            <AccessibleDatePicker
              id={datePickerId}
              value={formData.date instanceof Date ? formData.date : (formData.date ? new Date(formData.date) : null)}
              onChange={(d) => d && setFormData(prev => ({ ...prev, date: d }))}
              required
              aria-labelledby={dateLabelId}
              className="text-sm"
            />
          </div>
        </div>

        {/* From and To Locations */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor={fromInputId} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              From *
            </label>
            {hasSubRoutes ? (
              <input
                id={fromInputId}
                type="text"
                value={formData.from}
                disabled
                className="w-full px-2 py-1 text-sm border border-gray-200 dark:border-gray-700 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
              />
            ) : (
              <AriaComboBox
                id={fromInputId}
                value={formData.from}
                onChange={(value) => handleRouteLocationChange('from', value)}
                className="w-full px-2 py-1 text-sm"
                options={locationOptions.map(location => ({ value: location.name, label: location.name }))}
                placeholder="Paris"
                required
                allowsCustomValue={true}
              />
            )}
          </div>
          <div>
            <label htmlFor={toInputId} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              To *
            </label>
            {hasSubRoutes ? (
              <input
                id={toInputId}
                type="text"
                value={formData.to}
                disabled
                className="w-full px-2 py-1 text-sm border border-gray-200 dark:border-gray-700 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
              />
            ) : (
              <AriaComboBox
                id={toInputId}
                value={formData.to}
                onChange={(value) => handleRouteLocationChange('to', value)}
                className="w-full px-2 py-1 text-sm"
                options={locationOptions.map(location => ({ value: location.name, label: location.name }))}
                placeholder="London"
                required
                allowsCustomValue={true}
              />
            )}
          </div>
        </div>
        {!hasSubRoutes && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                From Coordinates
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  step="any"
                  aria-label="From latitude"
                  value={formData.fromCoords?.[0] ?? 0}
                  onChange={(e) => updateRouteCoord('fromCoords', 0, e.target.value)}
                  className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="Lat"
                />
                <input
                  type="number"
                  step="any"
                  aria-label="From longitude"
                  value={formData.fromCoords?.[1] ?? 0}
                  onChange={(e) => updateRouteCoord('fromCoords', 1, e.target.value)}
                  className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="Lng"
                />
              </div>
            </div>
            <div>
              <div className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                To Coordinates
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  step="any"
                  aria-label="To latitude"
                  value={formData.toCoords?.[0] ?? 0}
                  onChange={(e) => updateRouteCoord('toCoords', 0, e.target.value)}
                  className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="Lat"
                />
                <input
                  type="number"
                  step="any"
                  aria-label="To longitude"
                  value={formData.toCoords?.[1] ?? 0}
                  onChange={(e) => updateRouteCoord('toCoords', 1, e.target.value)}
                  className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="Lng"
                />
              </div>
            </div>
          </div>
        )}
        {hasSubRoutes && (
          <p className="text-xs text-gray-500 dark:text-gray-400">From/To are derived from first and last segments.</p>
        )}

        {/* Sub-routes */}
        <div className="border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 rounded p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-blue-800 dark:text-blue-200">Sub-routes</div>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Compose this route from segments. Start/end are derived from the first/last segment.
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
              {formData.subRoutes?.map((segment, index) => (
                <div key={segment.id} className="border border-blue-200 dark:border-blue-600 rounded p-3 bg-white dark:bg-gray-800">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                      Segment {index + 1}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => moveSubRoute(index, -1)}
                        disabled={index === 0}
                        className="px-2 py-1 text-xs rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 disabled:opacity-50"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSubRoute(index, 1)}
                        disabled={index === (formData.subRoutes?.length || 0) - 1}
                        className="px-2 py-1 text-xs rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 disabled:opacity-50"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSubRoute(index)}
                        className="px-2 py-1 text-xs rounded bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

	                  <div className="grid grid-cols-2 gap-2 mt-2">
	                    <div>
	                      <label htmlFor={`sub-route-type-${segment.id}`} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
	                        Transportation *
	                      </label>
                      <AriaSelect
                        id={`sub-route-type-${segment.id}`}
                        value={segment.transportType}
                        onChange={(value) => updateSubRoute(index, { transportType: value as Transportation['type'] })}
                        className="w-full px-2 py-1 text-sm"
                        required
                        options={segmentTransportOptions}
                        placeholder="Select Transportation"
                      />
	                    </div>
	                    <div>
	                      <span id={`sub-route-date-label-${segment.id}`} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
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
	                    </div>
	                  </div>

	                  <div className="grid grid-cols-2 gap-2 mt-2">
	                    <div>
	                      <label htmlFor={`sub-route-from-${segment.id}`} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
	                        From *
	                      </label>
	                      <AriaComboBox
	                        id={`sub-route-from-${segment.id}`}
                        value={segment.from}
                        onChange={(value) => updateSubRoute(index, { from: value })}
                        className="w-full px-2 py-1 text-sm"
                        options={locationOptions.map(location => ({ value: location.name, label: location.name }))}
                        placeholder="Paris"
                        required
                        allowsCustomValue={true}
	                      />
	                    </div>
	                    <div>
	                      <label htmlFor={`sub-route-to-${segment.id}`} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
	                        To *
	                      </label>
	                      <AriaComboBox
	                        id={`sub-route-to-${segment.id}`}
                        value={segment.to}
                        onChange={(value) => updateSubRoute(index, { to: value })}
                        className="w-full px-2 py-1 text-sm"
                        options={locationOptions.map(location => ({ value: location.name, label: location.name }))}
                        placeholder="London"
                        required
                        allowsCustomValue={true}
                      />
                    </div>
                  </div>

	                  <div className="grid grid-cols-2 gap-2 mt-2">
	                    <div>
	                      <div className="flex items-center justify-between mb-1">
	                        <div className="block text-xs font-medium text-gray-700 dark:text-gray-300">
	                          From Coordinates
	                        </div>
	                        <div className="flex items-center gap-1">
	                          {segmentRefreshStatus[`${segment.id}-fromCoords`] && (
	                            <span className={`text-[10px] ${
	                              segmentRefreshStatus[`${segment.id}-fromCoords`] === 'Updated' ? 'text-green-600 dark:text-green-400' :
                              segmentRefreshStatus[`${segment.id}-fromCoords`] === 'Refreshing...' ? 'text-blue-600 dark:text-blue-400' :
                              'text-amber-600 dark:text-amber-400'
                            }`}>
                              {segmentRefreshStatus[`${segment.id}-fromCoords`]}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => void refreshSegmentCoords(index, 'fromCoords')}
                            disabled={segmentRefreshStatus[`${segment.id}-fromCoords`] === 'Refreshing...'}
                            className="px-1.5 py-0.5 text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800/50 disabled:opacity-50"
                            title="Refresh coordinates from location name"
                          >
                            Refresh
                          </button>
                        </div>
	                      </div>
	                      <div className="grid grid-cols-2 gap-2">
	                        <input
	                          type="number"
	                          step="any"
                            aria-label="From latitude"
	                          value={segment.fromCoords?.[0] ?? 0}
	                          onChange={(e) => updateSubRouteCoord(index, 'fromCoords', 0, e.target.value)}
	                          className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
	                          placeholder="Lat"
	                        />
	                        <input
	                          type="number"
	                          step="any"
                            aria-label="From longitude"
	                          value={segment.fromCoords?.[1] ?? 0}
	                          onChange={(e) => updateSubRouteCoord(index, 'fromCoords', 1, e.target.value)}
	                          className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
	                          placeholder="Lng"
	                        />
	                      </div>
	                    </div>
	                    <div>
	                      <div className="flex items-center justify-between mb-1">
	                        <div className="block text-xs font-medium text-gray-700 dark:text-gray-300">
	                          To Coordinates
	                        </div>
	                        <div className="flex items-center gap-1">
	                          {segmentRefreshStatus[`${segment.id}-toCoords`] && (
	                            <span className={`text-[10px] ${
	                              segmentRefreshStatus[`${segment.id}-toCoords`] === 'Updated' ? 'text-green-600 dark:text-green-400' :
                              segmentRefreshStatus[`${segment.id}-toCoords`] === 'Refreshing...' ? 'text-blue-600 dark:text-blue-400' :
                              'text-amber-600 dark:text-amber-400'
                            }`}>
                              {segmentRefreshStatus[`${segment.id}-toCoords`]}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => void refreshSegmentCoords(index, 'toCoords')}
                            disabled={segmentRefreshStatus[`${segment.id}-toCoords`] === 'Refreshing...'}
                            className="px-1.5 py-0.5 text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800/50 disabled:opacity-50"
                            title="Refresh coordinates from location name"
                          >
                            Refresh
                          </button>
                        </div>
                      </div>
	                      <div className="grid grid-cols-2 gap-2">
	                        <input
	                          type="number"
	                          step="any"
                            aria-label="To latitude"
	                          value={segment.toCoords?.[0] ?? 0}
	                          onChange={(e) => updateSubRouteCoord(index, 'toCoords', 0, e.target.value)}
	                          className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
	                          placeholder="Lat"
	                        />
	                        <input
	                          type="number"
	                          step="any"
                            aria-label="To longitude"
	                          value={segment.toCoords?.[1] ?? 0}
	                          onChange={(e) => updateSubRouteCoord(index, 'toCoords', 1, e.target.value)}
	                          className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
	                          placeholder="Lng"
	                        />
	                      </div>
	                    </div>
	                  </div>

	                  <div className="mt-2">
	                    <label htmlFor={`sub-route-duration-${segment.id}`} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
	                      Duration
	                    </label>
	                    <input
	                      id={`sub-route-duration-${segment.id}`}
	                      type="text"
	                      value={segment.duration || ''}
	                      onChange={(e) => updateSubRoute(index, { duration: e.target.value })}
	                      className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      placeholder="e.g., 2h 30m, 1 day"
                    />
                  </div>

                  <div className="flex items-center mt-2">
                    <input
                      id={`sub-route-return-${segment.id}`}
                      type="checkbox"
                      checked={segment.isReturn || false}
                      onChange={(e) => updateSubRoute(index, { isReturn: e.target.checked })}
                      className="h-3.5 w-3.5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor={`sub-route-return-${segment.id}`} className="ml-2 block text-xs text-gray-700 dark:text-gray-300">
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
                    <label htmlFor={`sub-route-double-distance-${segment.id}`} className="ml-2 block text-xs text-gray-700 dark:text-gray-300">
                      Count distance twice (for return trips)
                    </label>
	                  </div>

	                  <div className="mt-2">
	                    <label htmlFor={`sub-route-notes-${segment.id}`} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
	                      Public Notes
	                    </label>
	                    <textarea
	                      id={`sub-route-notes-${segment.id}`}
	                      value={segment.notes || ''}
	                      onChange={(e) => updateSubRoute(index, { notes: e.target.value })}
	                      className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
	                      rows={2}
                      placeholder="Segment details..."
                    />
	                  </div>

	                  <div className="mt-2">
	                    <label htmlFor={`sub-route-private-notes-${segment.id}`} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
	                      Private Notes <span className="text-xs bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 px-1 py-0.5 rounded">Private</span>
	                    </label>
	                    <textarea
	                      id={`sub-route-private-notes-${segment.id}`}
	                      value={segment.privateNotes || ''}
	                      onChange={(e) => updateSubRoute(index, { privateNotes: e.target.value })}
	                      className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
	                      rows={2}
                      placeholder="Segment private details..."
                    />
                  </div>

                  <div className="border border-amber-200 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/30 rounded p-3 space-y-2 mt-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-amber-800 dark:text-amber-200">
                          Manual segment route (GeoJSON)
                        </div>
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          Import a GeoJSON LineString to override this segment.
                        </p>
                      </div>
                      {segment.useManualRoutePoints && (
                        <span className="text-[11px] px-2 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-800 dark:text-amber-100">
                          Active
                        </span>
                      )}
                    </div>
                    <input
                      type="file"
                      accept=".geojson,application/geo+json,application/json"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          void handleSubRouteGeoJSONImport(segment.id, file);
                        }
                      }}
                      className="text-xs text-gray-700 dark:text-gray-200"
                    />
                    {segmentImportStatus[segment.id] && (
                      <div className="text-xs text-green-700 dark:text-green-300">
                        {segmentImportStatus[segment.id]}
                        {segment.routePoints?.length ? ` (${segment.routePoints.length} points)` : ''}
                      </div>
                    )}
                    {segmentImportError[segment.id] && (
                      <div className="text-xs text-red-700 dark:text-red-300">
                        {segmentImportError[segment.id]}
                      </div>
                    )}
                    {(segment.useManualRoutePoints && segment.routePoints?.length) ? (
                      <div className="flex items-center justify-between text-xs text-gray-700 dark:text-gray-200">
                        <span>Manual route locked in; recalculation won&apos;t overwrite it unless you clear it.</span>
                        <button
                          type="button"
                          onClick={() => clearSubRouteManualRoute(segment.id)}
                          className="px-2 py-1 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                        >
                          Clear manual route
                        </button>
                      </div>
                    ) : (
                      <div className="text-xs text-gray-600 dark:text-gray-300">
                        Tip: first feature with LineString is used; coordinates should be [lng, lat].
                      </div>
                    )}
	                  </div>

	                  <div className="mt-3">
	                    <div className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
	                      Cost Tracking Links
	                    </div>
	                    {tripId ? (
	                      <CostTrackingLinksManager
	                        tripId={tripId}
	                        travelItemId={segment.id}
                        travelItemType="route"
                      />
                    ) : (
                      <div className="text-sm text-gray-500 dark:text-gray-400 italic p-2 bg-gray-100 dark:bg-gray-600 rounded">
                        💡 Expense linking will be available with valid trip ID
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-gray-600 dark:text-gray-300">
              No segments yet. Add one to compose the route.
            </div>
          )}
        </div>

        {/* Duration */}
	        {hasSubRoutes ? (
	          <div>
	            <div className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
	              Duration
	            </div>
	            <div className="w-full px-2 py-1 text-sm border border-gray-200 dark:border-gray-700 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
	              {formData.subRoutes?.map(s => s.duration?.trim()).filter(Boolean).join(' + ') || 'Set duration on each segment'}
	            </div>
	            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Duration is derived from segments.</p>
	          </div>
	        ) : (
	          <div>
	            <label htmlFor={durationInputId} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
	              Duration
	            </label>
	            <input
	              id={durationInputId}
	              type="text"
	              value={formData.duration || ''}
	              onChange={(e) => setFormData(prev => ({ ...prev, duration: e.target.value }))}
	              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="e.g., 2h 30m, 1 day"
            />
          </div>
        )}

	        {/* Return Route Checkbox */}
	        <div className="flex items-center">
	          <input
	            id={returnCheckboxId}
	            type="checkbox"
	            checked={formData.isReturn || false}
	            onChange={(e) => setFormData(prev => ({ ...prev, isReturn: e.target.checked }))}
	            className="h-3.5 w-3.5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
	          />
	          <label htmlFor={returnCheckboxId} className="ml-2 block text-xs text-gray-700 dark:text-gray-300">
	            Return Route (shown as ⇆)
	          </label>
	        </div>

	        {/* Double Distance Checkbox - only show for simple routes (not sub-routes) */}
	        {!hasSubRoutes && (
	          <div className="flex items-center">
	            <input
	              id={doubleDistanceCheckboxId}
	              type="checkbox"
	              checked={formData.doubleDistance || false}
	              onChange={(e) => setFormData(prev => ({ ...prev, doubleDistance: e.target.checked }))}
	              className="h-3.5 w-3.5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
	            />
	            <label htmlFor={doubleDistanceCheckboxId} className="ml-2 block text-xs text-gray-700 dark:text-gray-300">
	              Count distance twice (for return trips)
	            </label>
	          </div>
	        )}

	        {/* Public Notes */}
	        <div>
	          <label htmlFor={publicNotesId} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
	            Public Notes
	          </label>
	          <textarea
	            id={publicNotesId}
	            value={formData.notes || ''}
	            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
	            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
	            rows={2}
            placeholder="Flight number, booking details..."
          />
        </div>

	        {/* Private Notes */}
	        <div>
	          <label htmlFor={privateNotesId} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
	            Private Notes <span className="text-xs bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 px-1 py-0.5 rounded">Private</span>
	          </label>
	          <textarea
	            id={privateNotesId}
	            value={formData.privateNotes || ''}
	            onChange={(e) => setFormData(prev => ({ ...prev, privateNotes: e.target.value }))}
	            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
	            rows={2}
            placeholder="Personal reminders, private details..."
          />
        </div>

        {/* Manual route import (only shown when no sub-routes) */}
        {!hasSubRoutes && (
          <div className="border border-amber-200 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/30 rounded p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  Manual route (GeoJSON)
                </div>
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Import a GeoJSON LineString to override the route for any transport type. Imported routes are kept until you clear them.
                </p>
              </div>
              {formData.useManualRoutePoints && (
                <span className="text-[11px] px-2 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-800 dark:text-amber-100">
                  Active
                </span>
              )}
            </div>
            <input
              type="file"
              accept=".geojson,application/geo+json,application/json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  void handleGeoJSONImport(file);
                }
              }}
              className="text-xs text-gray-700 dark:text-gray-200"
            />
            {importStatus && (
              <div className="text-xs text-green-700 dark:text-green-300">
                {importStatus}
                {formData.routePoints?.length ? ` (${formData.routePoints.length} points)` : ''}
              </div>
            )}
            {importError && (
              <div className="text-xs text-red-700 dark:text-red-300">
                {importError}
              </div>
            )}
            {(formData.useManualRoutePoints && formData.routePoints?.length) ? (
              <div className="flex items-center justify-between text-xs text-gray-700 dark:text-gray-200">
                <span>Manual route locked in; recalculation won&apos;t overwrite it unless you clear it.</span>
                <button
                  type="button"
                  onClick={clearManualRoute}
                  className="px-2 py-1 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Clear manual route
                </button>
              </div>
            ) : (
              <div className="text-xs text-gray-600 dark:text-gray-300">
                Tip: first feature with LineString is used; coordinates should be [lng, lat].
              </div>
            )}
          </div>
        )}

	        {/* Cost Tracking Links */}
	        <div>
	          <div className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
	            Cost Tracking Links
	          </div>
	          {tripId ? (
	            <CostTrackingLinksManager
	              tripId={tripId}
	              travelItemId={formData.id}
              travelItemType="route"
            />
          ) : (
            <div className="text-sm text-gray-500 dark:text-gray-400 italic p-2 bg-gray-100 dark:bg-gray-600 rounded">
              💡 Expense linking will be available with valid trip ID
            </div>
          )}
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
