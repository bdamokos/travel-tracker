'use client';

import { useEffect, useRef, useState } from 'react';

// Import Leaflet CSS separately
import 'leaflet/dist/leaflet.css';
import { findClosestLocationToCurrentDate } from '../../../lib/dateUtils';
import { getRouteStyle } from '../../../lib/routeUtils';
import { formatDateRange } from '../../../lib/dateUtils';

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

// Function to generate popup HTML with Wikipedia and Weather data
const generatePopupHTML = (location: TravelData['locations'][0], wikipediaData?: {
  title: string;
  extract: string;
  thumbnail?: { source: string };
  url: string;
}, weatherData?: {
  icon: string;
  temp?: number | null;
  description?: string;
}) => {
  const isDarkMode = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const popupStyles = isDarkMode 
    ? 'background-color: #374151; color: #f9fafb; border: 1px solid #4b5563;'
    : 'background-color: white; color: #111827; border: 1px solid #d1d5db;';
  
  let popupContent = `
    <div style="padding: 12px; max-width: 400px; border-radius: 8px; ${popupStyles} font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
      <h4 style="font-weight: bold; font-size: 18px; margin-bottom: 6px; ${isDarkMode ? 'color: #f9fafb;' : 'color: #111827;'}">${location.name}</h4>
      <p style="font-size: 14px; margin-bottom: 8px; ${isDarkMode ? 'color: #9ca3af;' : 'color: #6b7280;'}">
        ${formatDateRange(location.date, location.endDate)}
      </p>
      ${location.notes ? `<p style="font-size: 14px; margin-bottom: 12px; ${isDarkMode ? 'color: #d1d5db;' : 'color: #374151;'}">${location.notes}</p>` : ''}
  `;

  // Add Weather quick line (today)
  if (weatherData) {
    popupContent += `
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 8px; padding: 6px 8px; border-radius:6px; ${isDarkMode ? 'background:#1f2937;color:#e5e7eb' : 'background:#f3f4f6;color:#374151'}">
        <div style="font-size:12px;">Weather (today)</div>
        <div style="display:flex; align-items:center; gap:6px; font-size:14px;">
          <span>${weatherData.icon}</span>
          ${typeof weatherData.temp === 'number' ? `<span>${Math.round(weatherData.temp)}°</span>` : ''}
        </div>
      </div>
    `;
  }
  
  // Add Wikipedia section
  if (wikipediaData) {
    popupContent += `
      <div style="margin-bottom: 12px; padding-top: 8px; border-top: 1px solid ${isDarkMode ? '#4b5563' : '#d1d5db'};">
        <div style="display: flex; gap: 8px;">
          ${wikipediaData.thumbnail ? `<img src="${wikipediaData.thumbnail.source}" alt="${wikipediaData.title}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 6px; flex-shrink: 0;" />` : ''}
          <div style="flex: 1;">
            <div style="font-size: 13px; line-height: 1.4; margin-bottom: 8px; ${isDarkMode ? 'color: #d1d5db;' : 'color: #374151;'}">${wikipediaData.extract.trim()}</div>
            <a href="${wikipediaData.url}" target="_blank" style="color: #3b82f6; font-size: 12px; text-decoration: underline;">Read more on Wikipedia</a>
          </div>
        </div>
        <p style="font-size: 10px; margin-top: 6px; ${isDarkMode ? 'color: #6b7280;' : 'color: #9ca3af;'}">Source: Wikipedia • under Creative Commons BY-SA 4.0 license</p>
      </div>
    `;
  }
  
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
  return popupContent;
};

const EmbeddableMap: React.FC<EmbeddableMapProps> = ({ travelData }) => {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isClient, setIsClient] = useState(false);
  const [L, setL] = useState<typeof import('leaflet') | null>(null);
  const [highlightedIcon, setHighlightedIcon] = useState<L.DivIcon | null>(null);
  
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
    
    travelData.locations.forEach(async (location) => {
      // Determine if this location should be highlighted
      const isHighlighted = closestLocation?.id === location.id;
      
      // Create marker with proper icon handling
      const markerOptions: L.MarkerOptions = {};
      if (isHighlighted && highlightedIcon) {
        markerOptions.icon = highlightedIcon;
      }
      
      // Generate initial popup content without Wikipedia data
      const initialPopupContent = generatePopupHTML(location);
      
      const marker = L.marker(location.coordinates, markerOptions)
        .addTo(map)
        .bindPopup(initialPopupContent, {
          maxWidth: 400,
          className: 'wikipedia-popup'
        });
      
      // Fetch Wikipedia and Weather data asynchronously
      try {
        const response = await fetch(`/api/wikipedia/${encodeURIComponent(location.name)}?lat=${location.coordinates[0]}&lon=${location.coordinates[1]}`);
        if (response.ok) {
          const wikipediaResponse = await response.json();
          // Fetch weather for today within the stay window
          const start = new Date(location.date).toISOString().slice(0, 10);
          const end = (location.endDate ? new Date(location.endDate) : new Date(location.date)).toISOString().slice(0, 10);
          let weatherBlock: { icon: string; temp?: number | null; description?: string } | undefined = undefined;
          try {
            const wRes = await fetch(`/api/weather/location?lat=${location.coordinates[0]}&lon=${location.coordinates[1]}&start=${start}&end=${end}&name=${encodeURIComponent(location.name)}&id=${encodeURIComponent(location.id)}`);
            if (wRes.ok) {
              const wJson: { data?: { dailyWeather?: Array<{ date: string; conditions?: { icon?: string; description?: string }; temperature?: { average?: number | null } }> } } = await wRes.json();
              const todayISO = new Date().toISOString().slice(0, 10);
              const list = wJson?.data?.dailyWeather || [];
              const today = list.find(d => d.date === todayISO) || list[0];
              if (today) {
                weatherBlock = { icon: today.conditions?.icon || '⛅', temp: today.temperature?.average ?? null, description: today.conditions?.description };
              }
            }
          } catch {}

          const updatedPopupContent = generatePopupHTML(
            location,
            (wikipediaResponse.success && wikipediaResponse.data) ? wikipediaResponse.data : undefined,
            weatherBlock
          );
          marker.setPopupContent(updatedPopupContent);
        }
      } catch (error) {
        console.error('Failed to fetch Wikipedia data for', location.name, error);
      }
      
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
  }, [travelData, L, isClient, highlightedIcon]);

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