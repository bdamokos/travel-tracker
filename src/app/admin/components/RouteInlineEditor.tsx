'use client';

import React, { useState } from 'react';
import { Transportation, TravelRoute, TravelRouteSegment } from '../../types';
import { transportationTypes, transportationLabels } from '../../lib/routeUtils';
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
  const [formData, setFormData] = useState<TravelRoute>({
    ...route
  });
  const [importStatus, setImportStatus] = useState<string>('');
  const [importError, setImportError] = useState<string>('');
  const [segmentImportStatus, setSegmentImportStatus] = useState<Record<string, string>>({});
  const [segmentImportError, setSegmentImportError] = useState<Record<string, string>>({});
  const [validationError, setValidationError] = useState<string>('');

  const generateId = () => Date.now().toString(36) + Math.random().toString(36).substring(2, 11);

  const transportOptions = transportationTypes.map(type => ({
    value: type,
    label: transportationLabels[type]
  }));

  const resolveLocationCoords = async (locationName: string, fallback?: [number, number]) => {
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

  const COORD_EPSILON = 1e-9;

  const isSamePoint = (left?: [number, number], right?: [number, number]) => {
    if (!left || !right) return false;
    return Math.abs(left[0] - right[0]) < COORD_EPSILON && Math.abs(left[1] - right[1]) < COORD_EPSILON;
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
            const fromCoords = await resolveLocationCoords(segment.from, segment.fromCoords);
            const toCoords = await resolveLocationCoords(segment.to, segment.toCoords);
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
        if (previous.to !== segment.from) {
          return true;
        }
        if (previous.toCoords && segment.fromCoords && !isSamePoint(previous.toCoords, segment.fromCoords)) {
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

      onSave({
        ...formData,
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

    // Update coordinates based on location selection or geocode
    const fromCoords = await resolveLocationCoords(formData.from, formData.fromCoords);
    const toCoords = await resolveLocationCoords(formData.to, formData.toCoords);

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

  const addSubRoute = () => {
    setFormData(prev => {
      const existingSubRoutes = prev.subRoutes || [];
      const lastSegment = existingSubRoutes[existingSubRoutes.length - 1];
      const fromName = lastSegment?.to || prev.from;
      const toName = prev.to || lastSegment?.to || '';
      const fromCoords = locationOptions.find(loc => loc.name === fromName)?.coordinates || prev.fromCoords;
      const toCoords = locationOptions.find(loc => loc.name === toName)?.coordinates || prev.toCoords;

      const newSegment: TravelRouteSegment = {
        id: generateId(),
        from: fromName,
        to: toName,
        fromCoords: fromCoords || [0, 0],
        toCoords: toCoords || [0, 0],
        transportType: prev.transportType,
        date: prev.date,
        duration: '',
        notes: '',
        privateNotes: '',
        costTrackingLinks: [],
        useManualRoutePoints: false,
        isReturn: false
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

      const normalized = rawCoords;

      if (normalized.length === 0) {
        throw new Error('Unable to parse coordinates (expected [lng, lat] numbers)');
      }

      setFormData(prev => ({
        ...prev,
        routePoints: normalized,
        useManualRoutePoints: true
      }));
      setImportStatus(`Imported ${normalized.length} points from ${file.name}`);
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

      const normalized = rawCoords;

      if (normalized.length === 0) {
        throw new Error('Unable to parse coordinates (expected [lng, lat] numbers)');
      }

      setFormData(prev => {
        const subRoutes = prev.subRoutes?.map(segment =>
          segment.id === segmentId
            ? { ...segment, routePoints: normalized, useManualRoutePoints: true }
            : segment
        );
        return {
          ...prev,
          subRoutes
        };
      });

      setSegmentImportStatus(prev => ({
        ...prev,
        [segmentId]: `Imported ${normalized.length} points from ${file.name}`
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

  const hasSubRoutes = (formData.subRoutes?.length || 0) > 0;

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
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Transportation *
            </label>
            <AriaSelect
              id="transport-type-select"
              value={formData.transportType}
              onChange={(value) => setFormData(prev => ({ ...prev, transportType: value as Transportation['type'] }))}
              className="w-full px-2 py-1 text-sm"
              required
              options={transportOptions}
              placeholder="Select Transportation"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Date *
            </label>
            <AccessibleDatePicker
              id="route-inline-date"
              value={formData.date instanceof Date ? formData.date : (formData.date ? new Date(formData.date) : null)}
              onChange={(d) => d && setFormData(prev => ({ ...prev, date: d }))}
              required
              className="text-sm"
            />
          </div>
        </div>

        {/* From and To Locations */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              From *
            </label>
            <AriaComboBox
              id="from-locations-inline"
              value={formData.from}
              onChange={(value) => setFormData(prev => ({ ...prev, from: value }))}
              className="w-full px-2 py-1 text-sm"
              options={locationOptions.map(location => ({ value: location.name, label: location.name }))}
              placeholder="Paris"
              required
              allowsCustomValue={true}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              To *
            </label>
            <AriaComboBox
              id="to-locations-inline"
              value={formData.to}
              onChange={(value) => setFormData(prev => ({ ...prev, to: value }))}
              className="w-full px-2 py-1 text-sm"
              options={locationOptions.map(location => ({ value: location.name, label: location.name }))}
              placeholder="London"
              required
              allowsCustomValue={true}
            />
          </div>
        </div>

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
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Transportation *
                      </label>
                      <AriaSelect
                        id={`sub-route-type-${segment.id}`}
                        value={segment.transportType}
                        onChange={(value) => updateSubRoute(index, { transportType: value as Transportation['type'] })}
                        className="w-full px-2 py-1 text-sm"
                        required
                        options={transportOptions}
                        placeholder="Select Transportation"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Date *
                      </label>
                      <AccessibleDatePicker
                        id={`sub-route-date-${segment.id}`}
                        value={segment.date instanceof Date ? segment.date : (segment.date ? new Date(segment.date) : null)}
                        onChange={(d) => d && updateSubRoute(index, { date: d })}
                        required
                        className="text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
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

                  <div className="mt-2">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Duration
                    </label>
                    <input
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

                  <div className="mt-2">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Public Notes
                    </label>
                    <textarea
                      value={segment.notes || ''}
                      onChange={(e) => updateSubRoute(index, { notes: e.target.value })}
                      className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      rows={2}
                      placeholder="Segment details..."
                    />
                  </div>

                  <div className="mt-2">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Private Notes <span className="text-xs bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 px-1 py-0.5 rounded">Private</span>
                    </label>
                    <textarea
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
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Cost Tracking Links
                    </label>
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

        {/* Return Route Checkbox */}
        <div className="flex items-center">
          <input
            id="route-inline-is-return"
            type="checkbox"
            checked={formData.isReturn || false}
            onChange={(e) => setFormData(prev => ({ ...prev, isReturn: e.target.checked }))}
            className="h-3.5 w-3.5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label htmlFor="route-inline-is-return" className="ml-2 block text-xs text-gray-700 dark:text-gray-300">
            Return Route (shown as ⇆)
          </label>
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

        {/* Manual route import (any transport type) */}
        <div className="border border-amber-200 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/30 rounded p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Manual route (GeoJSON)
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Import a GeoJSON LineString to override the route for any transport type. Imported routes are kept until you clear them.
              </p>
              {hasSubRoutes && (
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                  When sub-routes exist, the map uses segment routes instead of this override.
                </p>
              )}
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

        {/* Cost Tracking Links */}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
            Cost Tracking Links
          </label>
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