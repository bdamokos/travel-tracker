'use client';

import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Journey, JourneyDay, Location } from '../types';
import { generateRoutePointsSync, getRouteStyle } from '../lib/routeUtils';
import { findClosestLocationToCurrentDate } from '../lib/dateUtils';
import { LocationPopupModal } from './LocationPopup';
import { useLocationPopup } from '../hooks/useLocationPopup';

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

// Create highlighted marker icon
const createHighlightedIcon = () => {
  return L.divIcon({
    className: 'custom-highlighted-marker',
    html: `
      <div style="
        width: 25px; 
        height: 41px; 
        background-image: url('/images/marker-icon.png'); 
        background-size: contain; 
        background-repeat: no-repeat;
        filter: hue-rotate(240deg) saturate(1.5) brightness(1.2);
        animation: pulse-marker 2s infinite;
      "></div>
    `,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34]
  });
};

// Create a count badge icon for grouped markers
const createCountIcon = (count: number) => {
  // Match Leaflet default marker aspect ratio 25x41
  const width = 25;
  const height = 41;
  const badgeSize = 16;
  return L.divIcon({
    className: 'group-count-marker',
    html: `
      <div style="position: relative; width: ${width}px; height: ${height}px;">
        <img src="/images/marker-icon.png" alt="group marker" style="width: ${width}px; height: ${height}px; display: block;"/>
        <div aria-label="${count} visits" style="
          position: absolute; right: -6px; top: -6px; width: ${badgeSize}px; height: ${badgeSize}px;
          background: #ef4444; color: white; border-radius: 9999px; display: flex; align-items: center; justify-content: center;
          font-size: 10px; font-weight: 700; border: 2px solid white;
        ">${count}</div>
      </div>
    `,
    iconSize: [width, height],
    iconAnchor: [Math.round(width / 2), height],
    popupAnchor: [0, -height]
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
  const [zoomTick, setZoomTick] = useState(0);
  
  // Location popup state
  const { isOpen, data, openPopup, closePopup } = useLocationPopup();
  
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

  // Track zoom changes to recompute distributed marker positions
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const onZoomEnd = () => setZoomTick(t => t + 1);
    m.on('zoomend', onZoomEnd);
    return () => {
      m.off('zoomend', onZoomEnd);
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
        // Flatten with dates for closest-location logic
        const allLocations = days.flatMap(day => 
          day.locations.map(location => ({
            ...location,
            date: day.date || new Date().toISOString().split('T')[0]
          }))
        );
        const closestLocation = findClosestLocationToCurrentDate(allLocations);
        
        // Group locations by approx coordinate to handle repeated visits
        type Group = { key: string; center: [number, number]; items: Array<{ location: Location; day: JourneyDay }> };
        const groupsMap: Record<string, Group> = {};
        days.forEach((day: JourneyDay) => {
          day.locations.forEach((location: Location) => {
            const [lat, lng] = location.coordinates;
            const key = `${lat.toFixed(5)}_${lng.toFixed(5)}`;
            if (!groupsMap[key]) {
              groupsMap[key] = { key, center: [lat, lng], items: [] };
            }
            groupsMap[key].items.push({ location, day });
          });
        });
        const groups: Group[] = Object.values(groupsMap);

        const elements: React.ReactNode[] = [];

        // reference zoomTick so React re-renders legs at new zoom
        void zoomTick;
        groups.forEach((group: Group) => {
          if (group.items.length === 1) {
            const { location, day } = group.items[0];
            elements.push(
              <Marker 
                key={location.id} 
                position={location.coordinates}
                icon={closestLocation?.id === location.id ? createHighlightedIcon() : undefined}
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
            elements.push(
              <Marker
                key={`group-${group.key}`}
                position={group.center}
                icon={createCountIcon(group.items.length)}
                eventHandlers={{
                  click: () => {
                    setExpandedGroups(prev => new Set(prev).add(group.key));
                  }
                }}
              />
            );
          } else {
            // Spiderfy: render distributed markers and legs
            group.items.forEach(({ location, day }: { location: Location; day: JourneyDay }, index: number) => {
              const distributed = distributeAroundPointPixels(mapRef.current, group.center, index, group.items.length, 24);
              // Spider leg connecting back to center (tasteful connection to true location)
              elements.push(
                <Polyline
                  key={`leg-${group.key}-${location.id}`}
                  positions={[group.center, distributed]}
                  pathOptions={{ color: '#9CA3AF', weight: 1, opacity: 0.8, dashArray: '2 4' }}
                />
              );
              elements.push(
                <Marker
                  key={location.id}
                  position={distributed}
                  icon={closestLocation?.id === location.id ? createHighlightedIcon() : undefined}
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