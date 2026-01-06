'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Journey, JourneyDay, Location } from '../types';
import { generateRoutePointsSync, getRouteStyle } from '../lib/routeUtils';
import { findClosestLocationToCurrentDate, getLocationTemporalDistanceDays } from '../lib/dateUtils';
import { LocationPopupModal } from './LocationPopup';
import { useLocationPopup } from '../hooks/useLocationPopup';
import {
  createCountMarkerIcon,
  createHighlightedMarkerIcon,
  createMarkerIcon,
  getDominantMarkerTone,
  quantizeTemporalDistanceDays,
} from '../lib/mapIconUtils';

// Fix Leaflet icon issues with Next.js
const fixLeafletIcons = () => {
  // Only run on client
  if (typeof window === 'undefined') return;
  
  // Fix leaflet's default icon paths
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: '/images/marker-icon-2x.png',
    iconUrl: '/images/marker-icon.png',
    shadowUrl: '/images/marker-shadow.png',
  });
};

// Distribute points around a center for spiderfy effect
const distributeAroundPoint = (
  center: [number, number],
  index: number,
  total: number,
  radiusMeters = 14
): [number, number] => {
  const [lat, lng] = center;
  const angle = (2 * Math.PI * index) / total;
  const metersPerDegLat = 111_320;
  const metersPerDegLng = 111_320 * Math.cos((lat * Math.PI) / 180);
  const dLat = (radiusMeters * Math.sin(angle)) / metersPerDegLat;
  const dLng = (radiusMeters * Math.cos(angle)) / metersPerDegLng;
  return [lat + dLat, lng + dLng];
};

// Distribute using a pixel radius relative to current zoom so spider markers separate regardless of scale
const distributeAroundPointPixels = (
  map: L.Map | null,
  center: [number, number],
  index: number,
  total: number,
  pixelRadius = 24
): [number, number] => {
  if (!map) return distributeAroundPoint(center, index, total);
  const angle = (2 * Math.PI * index) / total;
  const centerLatLng = L.latLng(center[0], center[1]);
  const projected = map.project(centerLatLng, map.getZoom());
  const dx = Math.cos(angle) * pixelRadius;
  const dy = Math.sin(angle) * pixelRadius;
  const newPoint = L.point(projected.x + dx, projected.y + dy);
  const newLatLng = map.unproject(newPoint, map.getZoom());
  return [newLatLng.lat, newLatLng.lng];
};

const GROUP_PIXEL_THRESHOLD = 36;

type GroupItem = { location: Location; day: JourneyDay };

type Group = {
  key: string;
  center: [number, number];
  items: GroupItem[];
};

const buildGroupKey = (items: GroupItem[]): string =>
  items
    .map(({ location }) => location.id)
    .sort()
    .join('|');

const sortItemsByOrientation = (
  map: L.Map | null,
  center: [number, number],
  items: GroupItem[]
): GroupItem[] => {
  if (items.length <= 1) return items;

  if (!map) {
    return [...items].sort((a, b) => {
      const [aLat, aLng] = a.location.coordinates;
      const [bLat, bLng] = b.location.coordinates;
      if (aLng !== bLng) return aLng - bLng;
      return aLat - bLat;
    });
  }

  const zoom = map.getZoom();
  const centerPoint = map.project(L.latLng(center[0], center[1]), zoom);

  const getAngle = (item: GroupItem) => {
    const point = map.project(L.latLng(item.location.coordinates[0], item.location.coordinates[1]), zoom);
    const dx = point.x - centerPoint.x;
    const dy = point.y - centerPoint.y;
    if (dx === 0 && dy === 0) return Number.POSITIVE_INFINITY;
    return Math.atan2(dy, dx); // range [-pi, pi]
  };

  return [...items].sort((a, b) => {
    const angleA = getAngle(a);
    const angleB = getAngle(b);
    if (Number.isFinite(angleA) && Number.isFinite(angleB) && angleA !== angleB) {
      return angleA - angleB;
    }

    const [aLat, aLng] = a.location.coordinates;
    const [bLat, bLng] = b.location.coordinates;
    if (aLng !== bLng) return aLng - bLng;
    if (aLat !== bLat) return aLat - bLat;
    return a.location.id.localeCompare(b.location.id);
  });
};

const groupLocationsForSpiderfy = (
  map: L.Map | null,
  items: GroupItem[],
  pixelThreshold = GROUP_PIXEL_THRESHOLD
): Group[] => {
  if (!items.length) return [];

  if (!map) {
    const fallback: Record<string, Group> = {};
    items.forEach(item => {
      const [lat, lng] = item.location.coordinates;
      const approxKey = `${lat.toFixed(5)}_${lng.toFixed(5)}`;
      if (!fallback[approxKey]) {
        fallback[approxKey] = {
          key: approxKey,
          center: [lat, lng],
          items: [],
        };
      }
      fallback[approxKey].items.push(item);
    });
    return Object.values(fallback).map(group => {
      const sortedItems = sortItemsByOrientation(null, group.center, group.items);
      return {
        key: buildGroupKey(sortedItems) || group.key,
        center: sortedItems.length === 1
          ? sortedItems[0].location.coordinates
          : group.center,
        items: sortedItems,
      };
    });
  }

  const zoom = map.getZoom();
  const internalGroups: Array<{ items: GroupItem[]; pixelSum: { x: number; y: number } }> = [];

  const sortedItems = [...items].sort((a, b) => {
    const [aLat, aLng] = a.location.coordinates;
    const [bLat, bLng] = b.location.coordinates;
    if (aLat === bLat) return aLng - bLng;
    return aLat - bLat;
  });

  sortedItems.forEach(item => {
    const latLng = L.latLng(item.location.coordinates[0], item.location.coordinates[1]);
    const projected = map.project(latLng, zoom);

    let target = internalGroups.find(group => {
      const count = group.items.length;
      if (count === 0) return false;
      const centerPoint = L.point(group.pixelSum.x / count, group.pixelSum.y / count);
      return centerPoint.distanceTo(projected) <= pixelThreshold;
    });

    if (!target) {
      target = { items: [], pixelSum: { x: 0, y: 0 } };
      internalGroups.push(target);
    }

    target.items.push(item);
    target.pixelSum.x += projected.x;
    target.pixelSum.y += projected.y;
  });

  return internalGroups.map(group => {
    const count = group.items.length;
    if (count === 0) {
      return {
        key: 'empty',
        center: [0, 0],
        items: [],
      };
    }

    if (count === 1) {
      const { location } = group.items[0];
      const center = location.coordinates;
      const sortedItems = sortItemsByOrientation(map, center, group.items);
      return {
        key: buildGroupKey(sortedItems),
        center,
        items: sortedItems,
      };
    }

    const centerPoint = L.point(group.pixelSum.x / count, group.pixelSum.y / count);
    const centerLatLng = map.unproject(centerPoint, zoom);
    const center: [number, number] = [centerLatLng.lat, centerLatLng.lng];
    const sortedItems = sortItemsByOrientation(map, center, group.items);

    return {
      key: buildGroupKey(sortedItems),
      center,
      items: sortedItems,
    };
  });
};

const MapEventBridge: React.FC<{
  onReady: (map: L.Map) => void;
  onViewChange: () => void;
}> = ({ onReady, onViewChange }) => {
  const map = useMap();

  useEffect(() => {
    onReady(map);
    onViewChange();

    map.on('zoomend', onViewChange);
    map.on('moveend', onViewChange);

    return () => {
      map.off('zoomend', onViewChange);
      map.off('moveend', onViewChange);
    };
  }, [map, onReady, onViewChange]);

  return null;
};


interface MapProps {
  journey: Journey | null;
  selectedDayId?: string;
  onLocationClick?: (location: Location) => void;
}

const Map: React.FC<MapProps> = ({ journey, selectedDayId, onLocationClick }) => {
  const mapRef = useRef<L.Map | null>(null);
  const [days, setDays] = useState<JourneyDay[]>([]);
  const [key, setKey] = useState(0);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [viewChangeTick, setViewChangeTick] = useState(0);
  
  const handleViewChange = useCallback(() => {
    setViewChangeTick(t => t + 1);
  }, []);

  const handleMapReady = useCallback((mapInstance: L.Map) => {
    mapRef.current = mapInstance;
  }, []);
  
  // Location popup state
  const { isOpen, data, openPopup, closePopup } = useLocationPopup();
  const markerIconCacheRef = useRef<globalThis.Map<string, L.DivIcon>>(new globalThis.Map());
  
  // Fix Leaflet icons
  useEffect(() => {
    fixLeafletIcons();
  }, []);
  
  // Cleanup effect to handle strict mode double initialization
  useEffect(() => {
    return () => {
      // Force re-render on cleanup to prevent map container reuse
      setKey(prev => prev + 1);
    };
  }, []);

  // Update days when journey changes
  useEffect(() => {
    if (!journey) {
      setDays([]);
      return;
    }
    
    if (selectedDayId) {
      // Show only the selected day
      const selectedDay = journey.days.find(day => day.id === selectedDayId);
      setDays(selectedDay ? [selectedDay] : []);
    } else {
      // Show all days
      setDays(journey.days);
    }
  }, [journey, selectedDayId]);
  
  // Fit map bounds to show all locations
  useEffect(() => {
    if (!mapRef.current || days.length === 0) return;

    const allLocations: [number, number][] = [];
    
    // Collect all location coordinates
    days.forEach(day => {
      day.locations.forEach(location => {
        allLocations.push(location.coordinates);
      });
      
      if (day.transportation) {
        if (day.transportation.fromCoordinates) {
          allLocations.push(day.transportation.fromCoordinates);
        }
        if (day.transportation.toCoordinates) {
          allLocations.push(day.transportation.toCoordinates);
        }
      }
    });
    
    if (allLocations.length === 0) return;
    
    // Create a bounds object and fit the map to it
    const bounds = L.latLngBounds(allLocations.map(coords => L.latLng(coords[0], coords[1])));
    mapRef.current.fitBounds(bounds, { padding: [50, 50] });
  }, [days]);

  const locationItems = useMemo<GroupItem[]>(() => {
    return days.flatMap(day => day.locations.map(location => ({ location, day })));
  }, [days]);

  const datedLocations = useMemo(() => {
    return days.flatMap(day =>
      day.locations.map(location => ({
        ...location,
        date: day.date ?? location.date ?? new Date().toISOString().split('T')[0],
        endDate: location.endDate ?? day.endDate,
      }))
    );
  }, [days]);

  const locationDateLookup = useMemo(() => {
    const lookup = new globalThis.Map<string, { id: string; date: Date | string; endDate?: Date | string | null }>();
    datedLocations.forEach(location => {
      lookup.set(location.id, { id: location.id, date: location.date, endDate: location.endDate });
    });
    return lookup;
  }, [datedLocations]);

  const getTemporalDistanceForLocation = useCallback((location: Location) => {
    const enriched = locationDateLookup.get(location.id) ?? location;
    return getLocationTemporalDistanceDays(enriched);
  }, [locationDateLookup]);

  const getMarkerIconForLocation = useCallback((location: Location) => {
    const { status, days } = getTemporalDistanceForLocation(location);
    const bucket = quantizeTemporalDistanceDays(days);
    const cacheKey = `${status}:${bucket}`;

    const cached = markerIconCacheRef.current.get(cacheKey);
    if (cached) return cached;

    const icon = createMarkerIcon(L, status, bucket);
    markerIconCacheRef.current.set(cacheKey, icon);
    return icon;
  }, [getTemporalDistanceForLocation]);

  const closestLocation = useMemo(() => {
    return findClosestLocationToCurrentDate(datedLocations);
  }, [datedLocations]);

  const highlightedIcon = useMemo(() => {
    if (!closestLocation) {
      return createHighlightedMarkerIcon(L, 'present', 0);
    }
    const { status, days } = getLocationTemporalDistanceDays(closestLocation);
    const bucket = quantizeTemporalDistanceDays(days);
    return createHighlightedMarkerIcon(L, status, bucket);
  }, [closestLocation]);

  const groups = useMemo<Group[]>(() => {
    // reference tick so lint understands it intentionally triggers recompute
    void viewChangeTick;
    return groupLocationsForSpiderfy(mapRef.current, locationItems);
  }, [locationItems, viewChangeTick]);

  useEffect(() => {
    setExpandedGroups(prev => {
      const expandableKeys = new Set(groups.filter(group => group.items.length > 1).map(group => group.key));
      let requiresUpdate = false;
      prev.forEach(keyValue => {
        if (!expandableKeys.has(keyValue)) {
          requiresUpdate = true;
        }
      });
      if (!requiresUpdate) {
        return prev;
      }
      const next = new Set<string>();
      prev.forEach(keyValue => {
        if (expandableKeys.has(keyValue)) {
          next.add(keyValue);
        }
      });
      return next;
    });
  }, [groups]);

  useEffect(() => {
    if (!closestLocation) return;

    const highlightedGroup = groups.find(group =>
      group.items.some(({ location }) => location.id === closestLocation.id)
    );

    if (!highlightedGroup || highlightedGroup.items.length <= 1) {
      return;
    }

    if (expandedGroups.has(highlightedGroup.key)) {
      return;
    }

    setExpandedGroups(prev => {
      if (prev.has(highlightedGroup.key)) {
        return prev;
      }
      const next = new Set(prev);
      next.add(highlightedGroup.key);
      return next;
    });
  }, [closestLocation?.id, groups, expandedGroups]);

  if (!journey) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800">
        <p className="text-gray-500 dark:text-gray-400">No journey selected</p>
      </div>
    );
  }
  
  return (
    <>
    
      <MapContainer
        key={key} // Force re-creation on key change
        className="h-full w-full"
        center={[20, 0]} // Default center (will be overridden by the fit bounds)
        zoom={2}
        scrollWheelZoom={true}
        ref={mapRef}
      >
      <MapEventBridge onReady={handleMapReady} onViewChange={handleViewChange} />
      <TileLayer
        attribution={
          typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
            ? '&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }
        url={
          typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
            ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        }
      />
      
      {/* Render locations with grouping + spiderfy */}
      {(() => {
        const elements: React.ReactNode[] = [];

        groups.forEach(group => {
          if (group.items.length === 1) {
            const { location, day } = group.items[0];
            elements.push(
              <Marker 
                key={location.id} 
                position={location.coordinates}
                icon={closestLocation?.id === location.id ? highlightedIcon : getMarkerIconForLocation(location)}
                eventHandlers={{
                  click: () => {
                    const journeyDay = {
                      id: day.id,
                      date: new Date(day.date),
                      title: location.name,
                      locations: day.locations,
                      transportation: day.transportation
                    };
                    openPopup(location, journeyDay, journey?.id || 'unknown');
                    if (onLocationClick) onLocationClick(location);
                  }
                }}
              />
            );
            return;
          }

          const isExpanded = expandedGroups.has(group.key);
          if (!isExpanded) {
            // Render a single badge marker representing the group
            const temporalInfos = group.items.map(({ location }) => getTemporalDistanceForLocation(location));
            const groupTone = getDominantMarkerTone(temporalInfos.map(info => info.status));
            const groupDistanceBucket = quantizeTemporalDistanceDays(
              Math.min(...temporalInfos.filter(info => info.status === groupTone).map(info => info.days))
            );
            elements.push(
              <Marker
                key={`group-${group.key}`}
                position={group.center}
                icon={createCountMarkerIcon(L, group.items.length, groupTone, groupDistanceBucket)}
                eventHandlers={{
                  click: () => {
                    setExpandedGroups(prev => new Set(prev).add(group.key));
                  }
                }}
              />
            );
          } else {
            // Spiderfy: render distributed markers and legs
            group.items.forEach(({ location, day }, index) => {
              const distributed = distributeAroundPointPixels(mapRef.current, group.center, index, group.items.length, 24);
              // Spider leg connecting back to center (tasteful connection to true location)
              elements.push(
                <Polyline
                  key={`leg-${group.key}-${location.id}`}
                  positions={[location.coordinates, distributed]}
                  pathOptions={{ color: '#9CA3AF', weight: 1, opacity: 0.8, dashArray: '2 4' }}
                />
              );
              elements.push(
                <Marker
                  key={location.id}
                  position={distributed}
                  icon={closestLocation?.id === location.id ? highlightedIcon : getMarkerIconForLocation(location)}
                  eventHandlers={{
                    click: () => {
                      const journeyDay = {
                        id: day.id,
                        date: new Date(day.date),
                        title: location.name,
                        locations: day.locations,
                        transportation: day.transportation
                      };
                      openPopup(location, journeyDay, journey?.id || 'unknown');
                      if (onLocationClick) onLocationClick(location);
                    }
                  }}
                />
              );
            });
            // Add a small handler to collapse when clicking the center (invisible) area by rendering a transparent marker
            elements.push(
              <Marker
                key={`collapse-${group.key}`}
                position={group.center}
                opacity={0}
                eventHandlers={{
                  click: () => {
                    setExpandedGroups(prev => {
                      const next = new Set(prev);
                      next.delete(group.key);
                      return next;
                    });
                  }
                }}
              />
            );
          }
        });

        return elements;
      })()}
      
      {/* Render transportation routes */}
      {days.map(day => {
        if (!day.transportation) return null;
        
        const routePoints = generateRoutePointsSync(day.transportation);
        const routeStyle = getRouteStyle(day.transportation.type);
        
        return (
          <Polyline
            key={day.transportation.id}
            positions={routePoints}
            pathOptions={routeStyle}
          />
        );
      })}
    </MapContainer>
    
      {/* Location Popup Modal */}
      <LocationPopupModal
        isOpen={isOpen}
        onClose={closePopup}
        data={data}
      />
    </>
  );
};

export default Map; 
