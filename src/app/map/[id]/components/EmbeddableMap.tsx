'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

// Import Leaflet CSS separately
import 'leaflet/dist/leaflet.css';
import { findClosestLocationToCurrentDate } from '../../../lib/dateUtils';

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
  }>;
  createdAt: string;
}

interface EmbeddableMapProps {
  travelData: TravelData;
}

const EmbeddableMap: React.FC<EmbeddableMapProps> = ({ travelData }) => {
  const mapRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isClient, setIsClient] = useState(false);
  const [L, setL] = useState<any>(null);
  const [highlightedIcon, setHighlightedIcon] = useState<any>(null);

  useEffect(() => {
    setIsClient(true);
    
    // Dynamically import Leaflet only on client side
    const loadLeaflet = async () => {
      try {
        const leaflet = await import('leaflet');
        
        // Fix Leaflet icon issues with Next.js
        delete (leaflet.default.Icon.Default.prototype as any)._getIconUrl;
        
        leaflet.default.Icon.Default.mergeOptions({
          iconRetinaUrl: '/images/marker-icon-2x.png',
          iconUrl: '/images/marker-icon.png',
          shadowUrl: '/images/marker-shadow.png',
        });
        
        // Create highlighted marker icon using divIcon approach
        const customHighlightedIcon = leaflet.default.divIcon({
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
        
        setL(leaflet.default);
        setHighlightedIcon(customHighlightedIcon);
      } catch (error) {
        console.error('Error loading Leaflet:', error);
      }
    };
    
    loadLeaflet();
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !L || !isClient || !highlightedIcon) return;

    // Create map
    const map = L.map(containerRef.current, {
      center: [20, 0],
      zoom: 2,
      scrollWheelZoom: true,
    });

    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    mapRef.current = map;

    // Add markers for locations
    const markers: any[] = [];
    
    // Find the location closest to current date
    const closestLocation = findClosestLocationToCurrentDate(travelData.locations);
    
    travelData.locations.forEach((location, index) => {
      // Build popup content with posts
      let popupContent = `
        <div style="max-width: 250px;">
          <h4 style="margin: 0 0 8px 0; font-weight: bold;">${location.name}</h4>
          <p style="margin: 0 0 4px 0; font-size: 12px; color: #666;">
            ${new Date(location.date).toLocaleDateString()}
          </p>
          ${location.notes ? `<p style="margin: 0 0 8px 0; font-size: 12px;">${location.notes}</p>` : ''}
      `;
      
      // Add Instagram posts
      if (location.instagramPosts && location.instagramPosts.length > 0) {
        popupContent += `
          <div style="margin-bottom: 8px;">
            <strong style="font-size: 11px; color: #E1306C;">📷 Instagram:</strong>
            ${location.instagramPosts.map(post => `
              <div style="margin: 2px 0;">
                <a href="${post.url}" target="_blank" style="font-size: 10px; color: #E1306C; text-decoration: none;">
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
            <strong style="font-size: 11px; color: #007acc;">📝 Blog:</strong>
            ${location.blogPosts.map(post => `
              <div style="margin: 2px 0;">
                <a href="${post.url}" target="_blank" style="font-size: 10px; color: #007acc; text-decoration: none;">
                  ${post.title}
                </a>
                ${post.excerpt ? `<div style="font-size: 9px; color: #666; margin-top: 1px;">${post.excerpt}</div>` : ''}
              </div>
            `).join('')}
          </div>
        `;
      }
      
      popupContent += '</div>';
      
      // Determine if this location should be highlighted
      const isHighlighted = closestLocation?.id === location.id;
      
      // Create marker with proper icon handling
      const markerOptions: any = {};
      if (isHighlighted && highlightedIcon) {
        markerOptions.icon = highlightedIcon;
      }
      
      const marker = L.marker(location.coordinates, markerOptions)
        .addTo(map)
        .bindPopup(popupContent);
      
      markers.push(marker);
    });

    // Add routes if any
    travelData.routes.forEach((route) => {
      const routeLine = L.polyline([route.fromCoords, route.toCoords], {
        color: getTransportColor(route.transportType),
        weight: 3,
        opacity: 0.7,
      }).addTo(map);
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

  const getTransportColor = (transportType: string): string => {
    const colors: Record<string, string> = {
      plane: '#ff6b6b',
      train: '#4ecdc4',
      car: '#45b7d1',
      bus: '#96ceb4',
      boat: '#ffeaa7',
      ferry: '#74b9ff',
      metro: '#fd79a8',
      bike: '#00b894',
      walk: '#dda0dd',
    };
    return colors[transportType] || '#95a5a6';
  };

  if (!isClient) {
    return (
      <div 
        className="h-full w-full flex items-center justify-center bg-gray-100"
        style={{ minHeight: '400px' }}
      >
        <div className="text-gray-500">Loading map...</div>
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