'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

// Import Leaflet CSS separately
import 'leaflet/dist/leaflet.css';
import { findClosestLocationToCurrentDate } from '../../../lib/dateUtils';
import { generateRoutePoints, generateRoutePointsSync, getRouteStyle } from '../../../lib/routeUtils';

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
  
  // Route update queue to prevent race conditions
  const routeUpdateQueueRef = useRef<Array<{routeId: string, routePoints: [number, number][]}>>([]);
  const isProcessingUpdatesRef = useRef(false);
  const processedRoutesRef = useRef<Set<string>>(new Set()); // Track which routes we've already processed
  
  // Process queued route updates in a batch
  const processRouteUpdateQueue = useCallback(async () => {
    if (isProcessingUpdatesRef.current || routeUpdateQueueRef.current.length === 0) return;
    
    isProcessingUpdatesRef.current = true;
    const updates = [...routeUpdateQueueRef.current];
    routeUpdateQueueRef.current = [];
    
    try {
      await fetch(`/api/travel-data?id=${travelData.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchRouteUpdate: updates
        })
      });
    } catch (error) {
      console.warn('Failed to save batch route updates:', error);
    } finally {
      isProcessingUpdatesRef.current = false;
      
      // Process any new updates that arrived during processing
      if (routeUpdateQueueRef.current.length > 0) {
        setTimeout(processRouteUpdateQueue, 100);
      }
    }
  }, [travelData.id]);
  
  // Add route update to queue
  const queueRouteUpdate = useCallback((routeId: string, routePoints: [number, number][]) => {
    routeUpdateQueueRef.current.push({ routeId, routePoints });
    
    // Debounce processing to allow batching
    setTimeout(processRouteUpdateQueue, 500);
  }, [processRouteUpdateQueue]);
  
  // Initialize client-side state
  useEffect(() => {
    setIsClient(true);
  }, []);
  
  // Clear processed routes when travel data changes (new page load)
  useEffect(() => {
    processedRoutesRef.current.clear();
  }, [travelData.id]);
  
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
      // Build popup content with posts
      const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      const popupStyles = isDarkMode 
        ? 'background-color: #374151; color: #f9fafb; border: 1px solid #4b5563;'
        : 'background-color: white; color: #111827; border: 1px solid #d1d5db;';
      
      let popupContent = `
        <div style="padding: 8px; max-width: 250px; border-radius: 8px; ${popupStyles}">
          <h4 style="font-weight: bold; font-size: 18px; margin-bottom: 4px; ${isDarkMode ? 'color: #f9fafb;' : 'color: #111827;'}">${location.name}</h4>
          <p style="font-size: 14px; margin-bottom: 4px; ${isDarkMode ? 'color: #9ca3af;' : 'color: #6b7280;'}">
            ${new Date(location.date).toLocaleDateString()}
          </p>
          ${location.notes ? `<p style="font-size: 14px; margin-bottom: 8px; ${isDarkMode ? 'color: #d1d5db;' : 'color: #374151;'}">${location.notes}</p>` : ''}
      `;
      
      // Add Instagram posts
      if (location.instagramPosts && location.instagramPosts.length > 0) {
        popupContent += `
          <div style="margin-bottom: 8px;">
            <strong style="font-size: 12px; ${isDarkMode ? 'color: #f472b6;' : 'color: #ec4899;'}">📷 Instagram:</strong>
            ${location.instagramPosts.map(post => `
              <div style="margin-top: 2px;">
                <a href="${post.url}" target="_blank" style="font-size: 12px; text-decoration: underline; ${isDarkMode ? 'color: #60a5fa;' : 'color: #2563eb;'}">
                  ${post.caption || 'View Post'}
                </a>
              </div>
            `).join('')}
          </div>
        `;
      }
      
      // Add blog posts
      if (location.blogPosts && location.blogPosts.length > 0) {
        popupContent += `
          <div style="margin-bottom: 8px;">
            <strong style="font-size: 12px; ${isDarkMode ? 'color: #93c5fd;' : 'color: #1d4ed8;'}">📝 Blog:</strong>
            ${location.blogPosts.map(post => `
              <div style="margin-top: 2px;">
                <a href="${post.url}" target="_blank" style="font-size: 12px; text-decoration: underline; ${isDarkMode ? 'color: #60a5fa;' : 'color: #2563eb;'}">
                  ${post.title}
                </a>
                ${post.excerpt ? `<div style="font-size: 11px; margin-top: 2px; ${isDarkMode ? 'color: #9ca3af;' : 'color: #6b7280;'}">${post.excerpt}</div>` : ''}
              </div>
            `).join('')}
          </div>
        `;
      }
      
      popupContent += '</div>';
      
      // Determine if this location should be highlighted
      const isHighlighted = closestLocation?.id === location.id;
      
      // Create marker with proper icon handling
      const markerOptions: L.MarkerOptions = {};
      if (isHighlighted && highlightedIcon) {
        markerOptions.icon = highlightedIcon;
      }
      
      const marker = L.marker(location.coordinates, markerOptions)
        .addTo(map)
        .bindPopup(popupContent);
      
      markers.push(marker);
    });

    // Add routes if any
    travelData.routes.forEach(async (route) => {
      // Use pre-generated route points if available, fallback to generating sync
      let routePoints: [number, number][] = [];
      
      if (route.routePoints && route.routePoints.length > 0) {
        // Use pre-generated points for better performance and accuracy
        routePoints = route.routePoints;
      } else {
        // Fallback to sync generation for immediate display
        const transportation = {
          id: route.id || 'route',
          type: route.transportType as 'walk' | 'bike' | 'car' | 'bus' | 'train' | 'plane' | 'ferry' | 'other',
          from: route.from,
          to: route.to,
          fromCoordinates: route.fromCoords,
          toCoordinates: route.toCoords
        };
        routePoints = generateRoutePointsSync(transportation);
        
        // Only generate and save proper route points if we haven't already processed this route
        if (!processedRoutesRef.current.has(route.id)) {
          processedRoutesRef.current.add(route.id);
          
          // Asynchronously generate and save proper route points for future visitors
          generateRoutePoints(transportation).then((properRoutePoints) => {
            // Add to queue instead of making immediate API call
            queueRouteUpdate(route.id, properRoutePoints);
          }).catch(error => {
            console.warn('Failed to generate proper route points:', error);
            // Remove from processed set on failure so it can be retried later
            processedRoutesRef.current.delete(route.id);
          });
        }
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
  }, [travelData, L, isClient, highlightedIcon, queueRouteUpdate]);

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
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ minHeight: '400px' }}
    />
  );
};

export default EmbeddableMap; 