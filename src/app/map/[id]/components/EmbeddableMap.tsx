'use client';

import { useEffect, useRef, useState } from 'react';

// Import Leaflet CSS separately
import 'leaflet/dist/leaflet.css';
import { findClosestLocationToCurrentDate } from '../../../lib/dateUtils';
import { getRouteStyle } from '../../../lib/routeUtils';
import { LocationPopupModal } from '../../../components/LocationPopup';
import { useLocationPopup } from '../../../hooks/useLocationPopup';

interface TravelData {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  locations: Array<{
    id: string;
    name: string;
    coordinates: [number, number];
    date: string;
    endDate?: string;
    notes?: string;
    instagramPosts?: Array<{
      id: string;
      url: string;
      caption?: string;
    }>;
    blogPosts?: Array<{
      id: string;
      title: string;
      url: string;
      excerpt?: string;
    }>;
  }>;
  routes: Array<{
    id: string;
    from: string;
    to: string;
    fromCoords: [number, number];
    toCoords: [number, number];
    transportType: string;
    date: string;
    duration?: string;
    notes?: string;
    routePoints?: [number, number][]; // Pre-generated route points for better performance
  }>;
  createdAt: string;
}

interface EmbeddableMapProps {
  travelData: TravelData;
}

const EmbeddableMap: React.FC<EmbeddableMapProps> = ({ travelData }) => {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isClient, setIsClient] = useState(false);
  const [L, setL] = useState<typeof import('leaflet') | null>(null);
  const [highlightedIcon, setHighlightedIcon] = useState<L.DivIcon | null>(null);
  
  // Location popup state
  const { isOpen, data, openPopup, closePopup } = useLocationPopup();
  
  // Simplified - no more client-side route generation
  
  // Initialize client-side state
  useEffect(() => {
    setIsClient(true);
  }, []);
  
  // Log what route data we received
  useEffect(() => {
    console.log(`[EmbeddableMap] Received travel data for trip ${travelData.id} with ${travelData.routes.length} routes`);
    travelData.routes.forEach((route, index) => {
      const routePointsCount = route.routePoints ? route.routePoints.length : 0;
      console.log(`[EmbeddableMap] Received route ${index} (${route.id}): ${routePointsCount} route points`);
    });
  }, [travelData.id, travelData.routes]);
  
  // Load Leaflet dynamically
  useEffect(() => {
    if (!isClient) return;
    
    import('leaflet').then((leaflet) => {
      setL(leaflet);
      
      // Fix Leaflet icon issues
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (leaflet.Icon.Default.prototype as any)._getIconUrl;
      leaflet.Icon.Default.mergeOptions({
        iconRetinaUrl: '/images/marker-icon-2x.png',
        iconUrl: '/images/marker-icon.png',
        shadowUrl: '/images/marker-shadow.png',
      });
      
      // Create highlighted icon
      const highlightedIcon = leaflet.divIcon({
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
      
      setHighlightedIcon(highlightedIcon);
    });
  }, [isClient]);
  
  useEffect(() => {
    if (!containerRef.current || mapRef.current || !L || !isClient || !highlightedIcon) return;

    // Create map
    const map = L.map(containerRef.current, {
      center: [20, 0],
      zoom: 2,
      scrollWheelZoom: true,
    });

    // Add tile layer
    // Use a dark tile layer for dark mode, and a light one for light mode
    const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const tileLayerUrl = isDarkMode
      ? 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png'
      : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    const attribution = isDarkMode
      ? '&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
    
    // Add labels layer for dark mode
    const labelLayerUrl = isDarkMode ? 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png' : null;

    L.tileLayer(tileLayerUrl, {
      attribution: attribution
    }).addTo(map);
    
    // Add labels layer for dark mode (on top of the base layer)
    if (labelLayerUrl) {
      L.tileLayer(labelLayerUrl, {
        attribution: ''
      }).addTo(map);
    }

    mapRef.current = map;

    // Add markers for locations
    const markers: L.Marker[] = [];
    
    // Find the location closest to current date
    const closestLocation = findClosestLocationToCurrentDate(
      travelData.locations.map(location => ({
        ...location,
        date: new Date(location.date)
      }))
    );
    
    travelData.locations.forEach((location) => {
      // Determine if this location should be highlighted
      const isHighlighted = closestLocation?.id === location.id;
      
      // Create marker with proper icon handling
      const markerOptions: L.MarkerOptions = {};
      if (isHighlighted && highlightedIcon) {
        markerOptions.icon = highlightedIcon;
      }
      
      const marker = L.marker(location.coordinates, markerOptions)
        .addTo(map)
        .on('click', () => {
          // Create a journey day object for the popup
          const journeyDay = {
            id: `${location.id}-${location.date}`,
            date: new Date(location.date),
            title: location.name,
            locations: [{
              ...location,
              date: new Date(location.date),
              endDate: location.endDate ? new Date(location.endDate) : undefined,
              // Convert endDate to departureTime for consistency with other components
              departureTime: location.endDate || undefined,
              arrivalTime: undefined // Not available in embeddable map data
            }],
            transportation: undefined
          };
          
          // Open the rich popup modal
          openPopup({
            ...location,
            date: new Date(location.date),
            endDate: location.endDate ? new Date(location.endDate) : undefined,
            departureTime: location.endDate || undefined,
            arrivalTime: undefined
          }, journeyDay, travelData.id);
        });
      
      markers.push(marker);
    });

    // Add routes if any
    travelData.routes.forEach(async (route) => {
      // Use pre-generated route points if available, fallback to generating sync
      let routePoints: [number, number][] = [];
      
      if (route.routePoints && route.routePoints.length > 0) {
        // Use pre-generated points for better performance and accuracy
        console.log(`[EmbeddableMap] Using pre-generated route points for ${route.id}: ${route.routePoints.length} points`);
        routePoints = route.routePoints;
      } else {
        // Fallback to straight lines if no pre-generated points available
        console.log(`[EmbeddableMap] No pre-generated points for ${route.id}, using straight line fallback`);
        routePoints = [route.fromCoords, route.toCoords];
      }
      
      const routeStyle = getRouteStyle(route.transportType as 'walk' | 'bike' | 'car' | 'bus' | 'train' | 'plane' | 'ferry' | 'other');
      
      if (routePoints.length > 0) {
        L.polyline(routePoints, {
          color: routeStyle.color,
          weight: routeStyle.weight,
          opacity: routeStyle.opacity,
          dashArray: routeStyle.dashArray
        }).addTo(map);
      }
    });

    // Fit map to show all locations
    if (travelData.locations.length > 0) {
      const allCoords = travelData.locations.map(loc => loc.coordinates);
      
      // Add route coordinates
      travelData.routes.forEach(route => {
        allCoords.push(route.fromCoords, route.toCoords);
      });
      
      if (allCoords.length > 1) {
        const bounds = L.latLngBounds(allCoords.map(coord => L.latLng(coord[0], coord[1])));
        map.fitBounds(bounds, { padding: [20, 20] });
      } else if (allCoords.length === 1) {
        map.setView(allCoords[0], 10);
      }
    }

    // Cleanup function
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [travelData, L, isClient, highlightedIcon, openPopup]);

  if (!isClient) {
    return (
      <div 
        className="h-full w-full flex items-center justify-center bg-gray-100 dark:bg-gray-900"
        style={{ minHeight: '400px' }}
      >
        <div className="text-gray-500 dark:text-gray-400">Loading map...</div>
      </div>
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        className="h-full w-full"
        style={{ minHeight: '400px' }}
      />
      
      {/* Location Popup Modal */}
      <LocationPopupModal
        isOpen={isOpen}
        onClose={closePopup}
        data={data}
      />
    </>
  );
};

export default EmbeddableMap; 