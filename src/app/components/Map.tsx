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


interface MapProps {
  journey: Journey | null;
  selectedDayId?: string;
  onLocationClick?: (location: Location) => void;
}

const Map: React.FC<MapProps> = ({ journey, selectedDayId, onLocationClick }) => {
  const mapRef = useRef<L.Map | null>(null);
  const [days, setDays] = useState<JourneyDay[]>([]);
  const [key, setKey] = useState(0);
  
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
      
      {/* Render locations */}
      {(() => {
        // Get all locations with dates for comparison
        const allLocations = days.flatMap(day => 
          day.locations.map(location => ({
            ...location,
            date: day.date || new Date().toISOString().split('T')[0] // Use day date or fallback
          }))
        );
        
        // Find the location closest to current date
        const closestLocation = findClosestLocationToCurrentDate(allLocations);
        
        return days.flatMap(day => 
          day.locations.map(location => {
            
            return (
              <Marker 
                key={location.id} 
                position={location.coordinates}
                icon={closestLocation?.id === location.id ? createHighlightedIcon() : undefined}
                eventHandlers={{
                  click: () => {
                    // Create a journey day object for the popup
                    const journeyDay = {
                      id: day.id,
                      date: new Date(day.date),
                      title: location.name,
                      locations: day.locations,
                      transportation: day.transportation
                    };
                    
                    // Open the rich popup modal
                    openPopup(location, journeyDay, journey?.id || 'unknown');
                    
                    // Call optional callback
                    if (onLocationClick) {
                      onLocationClick(location);
                    }
                  }
                }}
              >
                {/* No popup content - using modal instead */}
              </Marker>
            );
          })
        );
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