'use client';

import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Journey, JourneyDay, Location, Transportation, BlogPost } from '../types';
import { generateRoutePoints, getRouteStyle, transportationColors } from '../lib/routeUtils';
import { findClosestLocationToCurrentDate } from '../lib/dateUtils';

// Fix Leaflet icon issues with Next.js
const fixLeafletIcons = () => {
  // Only run on client
  if (typeof window === 'undefined') return;
  
  // Fix leaflet's default icon paths
  // Use type assertion to handle TypeScript issues with Leaflet internals
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

// Custom icon for transport types
const createTransportIcon = (type: Transportation['type']) => {
  return L.divIcon({
    className: 'transport-icon',
    html: `<div style="background-color: ${transportationColors[type]}; width: 10px; height: 10px; border-radius: 50%;"></div>`,
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  });
};

interface MapProps {
  journey: Journey | null;
  selectedDayId?: string;
  onLocationClick?: (location: Location) => void;
}

const Map: React.FC<MapProps> = ({ journey, selectedDayId, onLocationClick }) => {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [days, setDays] = useState<JourneyDay[]>([]);
  const [key, setKey] = useState(0);
  
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
      <div className="h-full flex items-center justify-center bg-gray-100">
        <p className="text-gray-500">No journey selected</p>
      </div>
    );
  }
  
      return (
      <MapContainer
        key={key} // Force re-creation on key change
        className="h-full w-full"
        center={[20, 0]} // Default center (will be overridden by the fit bounds)
        zoom={2}
        scrollWheelZoom={true}
        ref={mapRef}
      >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
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
            const locationWithDate = {
              ...location,
              date: day.date || new Date().toISOString().split('T')[0]
            };
            
            return (
              <Marker 
                key={location.id} 
                position={location.coordinates}
                icon={closestLocation?.id === location.id ? createHighlightedIcon() : undefined}
                eventHandlers={{
                  click: () => onLocationClick && onLocationClick(location)
                }}
              >
                <Popup>
                  <div className="p-2 max-w-xs">
                    <h4 className="font-bold">{location.name}</h4>
                    {location.arrivalTime && (
                      <p className="text-sm">Arrived at: {location.arrivalTime}</p>
                    )}
                    <p className="text-sm">Date: {new Date(day.date).toLocaleDateString()}</p>
                    {location.notes && (
                      <p className="text-sm mt-1">{location.notes}</p>
                    )}
                    
                    {/* Display Blog Posts */}
                    {location.blogPosts && location.blogPosts.length > 0 && (
                      <div className="mt-3 pt-2 border-t">
                        <h5 className="text-sm font-semibold text-green-700 mb-1">📝 Blog Posts:</h5>
                        <div className="space-y-1">
                          {location.blogPosts.map((post, index) => (
                            <div key={post.id || index}>
                              <a
                                href={post.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-green-600 hover:text-green-800 text-sm font-medium underline block"
                                title={post.title}
                              >
                                {post.title.length > 30 ? `${post.title.substring(0, 30)}...` : post.title}
                              </a>
                              {post.offline && (
                                <span className="text-xs text-amber-600">(Offline)</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Display Instagram Posts */}
                    {location.instagramPosts && location.instagramPosts.length > 0 && (
                      <div className="mt-3 pt-2 border-t">
                        <h5 className="text-sm font-semibold text-blue-700 mb-1">📸 Instagram:</h5>
                        <div className="space-y-1">
                          {location.instagramPosts.map((post, index) => (
                            <div key={post.id || index}>
                              <a
                                href={post.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 text-sm underline block"
                                title={post.url}
                              >
                                View Post {location.instagramPosts!.length > 1 ? `#${index + 1}` : ''}
                              </a>
                              {post.offline && (
                                <span className="text-xs text-amber-600">(Offline)</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Show post count summary */}
                    {(location.blogPosts?.length || location.instagramPosts?.length) && (
                      <div className="mt-2 text-xs text-gray-500">
                        {location.blogPosts?.length && (
                          <span className="mr-2">📝 {location.blogPosts.length}</span>
                        )}
                        {location.instagramPosts?.length && (
                          <span>📸 {location.instagramPosts.length}</span>
                        )}
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })
        );
      })()}
      
      {/* Render transportation routes */}
      {days.map(day => {
        if (!day.transportation) return null;
        
        const routePoints = generateRoutePoints(day.transportation);
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
  );
};

export default Map; 