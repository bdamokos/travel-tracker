'use client';

import React, { useState } from 'react';
import { Transportation, TravelRoute } from '../../types';
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

  const clearManualRoute = () => {
    setFormData(prev => ({
      ...prev,
      routePoints: undefined,
      useManualRoutePoints: false
    }));
    setImportStatus('');
    setImportError('');
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

        {/* Manual route import (for boats) */}
        {formData.transportType === 'boat' && (
          <div className="border border-amber-200 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/30 rounded p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  Manual route (GeoJSON)
                </div>
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Import a GeoJSON LineString to draw the exact boat track. Imported routes are kept until you clear them.
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
