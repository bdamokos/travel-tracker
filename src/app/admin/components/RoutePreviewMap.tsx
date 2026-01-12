'use client';

import { useEffect, useRef, useState } from 'react';
import { Map, Marker } from 'leaflet';
import { getRouteStyle, generateRoutePoints, calculateGreatCirclePoints, calculateSimpleArc } from '@/app/lib/routeUtils';
import { Transportation } from '@/app/types';

interface RoutePreviewProps {
  from: string;
  to: string;
  fromCoords: [number, number];
  toCoords: [number, number];
  transportType: Transportation['type'];
}

const RoutePreviewMap: React.FC<RoutePreviewProps> = ({ 
  from, 
  to, 
  fromCoords, 
  toCoords, 
  transportType 
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const startMarkerRef = useRef<Marker | null>(null);
  const endMarkerRef = useRef<Marker | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [routePoints, setRoutePoints] = useState<[number, number][]>([]);

  // Check if coordinates are valid (not [0, 0])
  const hasValidCoords = fromCoords[0] !== 0 || fromCoords[1] !== 0 || toCoords[0] !== 0 || toCoords[1] !== 0;

  const routeStyle = getRouteStyle(transportType);

  // Generate route data asynchronously for land transport, synchronously for air/sea
  useEffect(() => {
    if (!hasValidCoords) {
      setRoutePoints([]);
      return;
    }

    const transportation = {
      id: 'preview',
      type: transportType,
      from: from,
      to: to,
      fromCoordinates: fromCoords,
      toCoordinates: toCoords
    };

    // For air and sea routes, use synchronous calculation (no API needed)
    if (transportType === 'plane' || transportType === 'ferry' || transportType === 'boat') {
      try {
        let points: [number, number][] = [];
        if (transportType === 'plane') {
          points = calculateGreatCirclePoints(fromCoords, toCoords, 50);
        } else {
          points = calculateSimpleArc(fromCoords, toCoords, 15, 0.15);
        }
        setRoutePoints(points);
      } catch (error) {
        console.warn('Failed to generate air/sea route points:', error);
        setRoutePoints([fromCoords, toCoords]);
      }
    } else {
      // For land routes, use async API call
      const loadRoute = async () => {
        try {
          const points = await generateRoutePoints(transportation);
          setRoutePoints(points);
        } catch (error) {
          console.warn('Failed to generate land route points:', error);
          setRoutePoints([fromCoords, toCoords]); // Fallback to straight line
        }
      };
      loadRoute();
    }
  }, [fromCoords, toCoords, transportType, hasValidCoords, from, to]);

  // Initialize map only when coordinates change, not text fields
  useEffect(() => {
    const center: [number, number] = hasValidCoords
      ? [(fromCoords[0] + toCoords[0]) / 2, (fromCoords[1] + toCoords[1]) / 2]
      : [51.505, -0.09]; // Default to London
    if (!hasValidCoords || !mapContainerRef.current) return;

    let mounted = true;

    const initMap = async () => {
      try {
        // Clean up existing map more thoroughly
        if (mapRef.current) {
          try {
            mapRef.current.off(); // Remove all event listeners
            mapRef.current.remove();
          } catch (e) {
            console.warn('Error cleaning up map:', e);
          }
          mapRef.current = null;
        }

        // Load Leaflet CSS if not already loaded
        if (!document.querySelector('link[href*="leaflet.css"]')) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
          document.head.appendChild(link);
        }

        // Dynamic import of Leaflet
        const L = await import('leaflet');

        // Fix default icons
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (L.Icon.Default.prototype as any)._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: '/images/marker-icon-2x.png',
          iconUrl: '/images/marker-icon.png',
          shadowUrl: '/images/marker-shadow.png',
        });

        if (!mounted || !mapContainerRef.current) return;

        // Clear container completely and wait for DOM
        mapContainerRef.current.innerHTML = '';
        
        // Small delay to ensure DOM is ready
        await new Promise(resolve => setTimeout(resolve, 10));
        
        if (!mounted || !mapContainerRef.current) return;

        // Create map with minimal options first
        const map = L.map(mapContainerRef.current, {
          center: center,
          zoom: 6,
          zoomControl: true,
          scrollWheelZoom: false,
          attributionControl: false
        });

        // Add tile layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        // Create custom icons
        const startIcon = L.divIcon({
          className: 'custom-start-marker',
          html: `
            <div style="
              width: 20px; 
              height: 20px; 
              background-color: #22c55e; 
              border: 2px solid white;
              border-radius: 50%;
              box-shadow: 0 2px 4px rgba(0,0,0,0.2);
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              font-size: 10px;
              font-weight: bold;
            ">S</div>
          `,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
          popupAnchor: [0, -10]
        });

        const endIcon = L.divIcon({
          className: 'custom-end-marker',
          html: `
            <div style="
              width: 20px; 
              height: 20px; 
              background-color: #ef4444; 
              border: 2px solid white;
              border-radius: 50%;
              box-shadow: 0 2px 4px rgba(0,0,0,0.2);
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              font-size: 10px;
              font-weight: bold;
            ">E</div>
          `,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
          popupAnchor: [0, -10]
        });

        // Add markers - store references for popup updates
        const startMarker = L.marker(fromCoords, { icon: startIcon })
          .addTo(map)
          .bindPopup(`<strong>Start: ${from}</strong><br/><small>${fromCoords[0].toFixed(4)}, ${fromCoords[1].toFixed(4)}</small>`);

        const endMarker = L.marker(toCoords, { icon: endIcon })
          .addTo(map)
          .bindPopup(`<strong>End: ${to}</strong><br/><small>${toCoords[0].toFixed(4)}, ${toCoords[1].toFixed(4)}</small>`);

        // Store marker references for updates
        startMarkerRef.current = startMarker;
        endMarkerRef.current = endMarker;

        // Add route line
        if (routePoints.length > 0) {
          L.polyline(routePoints, {
            color: routeStyle.color,
            weight: routeStyle.weight,
            opacity: routeStyle.opacity,
            dashArray: routeStyle.dashArray
          }).addTo(map);
        }

        // Fit bounds with more padding and wait for map to be ready
        setTimeout(() => {
          if (map && mounted) {
            const bounds = L.latLngBounds([fromCoords, toCoords]);
            map.fitBounds(bounds, { padding: [20, 20] });
          }
        }, 100);

        mapRef.current = map;
        if (mounted) {
          setIsLoaded(true);
          setError(null);
        }
      } catch (err) {
        console.error('Map initialization error:', err);
        if (mounted) {
          setError('Failed to load map');
          setIsLoaded(false);
        }
      }
    };

    setIsLoaded(false);
    setError(null);
    initMap();

    return () => {
      mounted = false;
      if (mapRef.current) {
        try {
          mapRef.current.off();
          mapRef.current.remove();
        } catch (e) {
          console.warn('Error in cleanup:', e);
        }
        mapRef.current = null;
      }
      startMarkerRef.current = null;
      endMarkerRef.current = null;
    };
  }, [fromCoords, toCoords, transportType, hasValidCoords, from, to, routePoints, routeStyle.color, routeStyle.dashArray, routeStyle.opacity, routeStyle.weight]);

  // Update popup content when location names change (without recreating map)
  useEffect(() => {
    if (startMarkerRef.current && endMarkerRef.current) {
      const startPopupContent = `<strong>Start: ${from}</strong><br/><small>${fromCoords[0].toFixed(4)}, ${fromCoords[1].toFixed(4)}</small>`;
      const endPopupContent = `<strong>End: ${to}</strong><br/><small>${toCoords[0].toFixed(4)}, ${toCoords[1].toFixed(4)}</small>`;
      
      startMarkerRef.current.setPopupContent(startPopupContent);
      endMarkerRef.current.setPopupContent(endPopupContent);
    }
  }, [from, to, fromCoords, toCoords]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch {
          // Ignore cleanup errors
        }
        mapRef.current = null;
      }
      startMarkerRef.current = null;
      endMarkerRef.current = null;
    };
  }, []);

  if (!hasValidCoords) {
    return (
      <div className="w-full h-48 bg-gray-100 border border-gray-300 rounded-md flex items-center justify-center">
        <div className="text-center text-gray-500">
          <p className="text-sm">Route Preview</p>
          <p className="text-xs mt-1">Click &quot;Coords&quot; buttons to geocode locations</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-48 bg-red-50 border border-red-300 rounded-md flex items-center justify-center">
        <div className="text-center text-red-500">
          <p className="text-sm">Error loading map</p>
          <p className="text-xs mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-48 border border-gray-300 rounded-md overflow-hidden relative">
      <div 
        ref={mapContainerRef} 
        className="w-full h-full"
        style={{ minHeight: '192px' }}
      />
      {!isLoaded && (
        <div className="absolute inset-0 bg-gray-100 flex items-center justify-center">
          <div className="text-center text-gray-500">
            <p className="text-sm">Loading map...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoutePreviewMap;