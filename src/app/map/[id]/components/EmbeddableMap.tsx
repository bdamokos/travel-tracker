'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Marker } from 'leaflet';

// Import Leaflet CSS separately
import 'leaflet/dist/leaflet.css';
import { findClosestLocationToCurrentDate, formatDateRange, getLocationTemporalDistanceDays } from '@/app/lib/dateUtils';
import { buildCompositeRoutePoints, getRouteStyle, transportationConfig } from '@/app/lib/routeUtils';
import type { MapRouteSegment } from '@/app/types';
import {
  attachMarkerKeyHandlers,
  buildLocationAriaLabel,
  buildLocationLabelKey,
  createCountMarkerIcon,
  createHighlightedMarkerIcon,
  createMarkerIcon,
  escapeAttribute,
  getDominantMarkerTone,
  getMarkerDistanceBucket,
} from '@/app/lib/mapIconUtils';
import { getInstagramIconMarkup } from '@/app/components/icons/InstagramIcon';
import { getTikTokIconMarkup } from '@/app/components/icons/TikTokIcon';

const INSTAGRAM_ICON_MARKUP = getInstagramIconMarkup({
  containerClassName: 'w-5 h-5',
  iconClassName: 'w-3 h-3',
  className: 'shrink-0',
});

const TIKTOK_ICON_MARKUP = getTikTokIconMarkup({
  containerClassName: 'w-5 h-5',
  iconClassName: 'w-3 h-3',
  className: 'shrink-0',
  ariaLabel: 'TikTok',
});

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
    wikipediaRef?: string;
    instagramPosts?: Array<{
      id: string;
      url: string;
      caption?: string;
    }>;
    tikTokPosts?: Array<{
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
  routes: MapRouteSegment[];
  createdAt: string;
}

interface EmbeddableMapProps {
  travelData: TravelData;
}

const escapeHTML = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

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

  const safeLocationName = escapeHTML(location.name);
  const safeDateRange = escapeHTML(formatDateRange(location.date, location.endDate));
  const safeNotes = location.notes ? escapeHTML(location.notes) : '';

  let popupContent = `
    <div style="padding: 12px; max-width: 400px; border-radius: 8px; ${popupStyles} font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
      <h4 style="font-weight: bold; font-size: 18px; margin-bottom: 6px; ${isDarkMode ? 'color: #f9fafb;' : 'color: #111827;'}">${safeLocationName}</h4>
      <p style="font-size: 14px; margin-bottom: 8px; ${isDarkMode ? 'color: #9ca3af;' : 'color: #6b7280;'}">
        ${safeDateRange}
      </p>
      ${location.notes ? `<p style="font-size: 14px; margin-bottom: 12px; ${isDarkMode ? 'color: #d1d5db;' : 'color: #374151;'}">${safeNotes}</p>` : ''}
  `;

  // Add Weather quick line (today)
  if (weatherData) {
    const safeWeatherIcon = escapeHTML(weatherData.icon);
    popupContent += `
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 8px; padding: 6px 8px; border-radius:6px; ${isDarkMode ? 'background:#1f2937;color:#e5e7eb' : 'background:#f3f4f6;color:#374151'}">
        <div style="font-size:12px;">Weather (today)</div>
        <div style="display:flex; align-items:center; gap:6px; font-size:14px;">
          <span>${safeWeatherIcon}</span>
          ${typeof weatherData.temp === 'number' ? `<span>${Math.round(weatherData.temp)}°</span>` : ''}
        </div>
      </div>
    `;
  }

  // Add Wikipedia section
  if (wikipediaData) {
    const safeWikipediaTitle = escapeHTML(wikipediaData.title);
    const safeWikipediaExtract = escapeHTML(wikipediaData.extract.trim());
    const safeWikipediaUrl = escapeAttribute(wikipediaData.url);
    const safeWikipediaThumbnail = wikipediaData.thumbnail?.source
      ? escapeAttribute(wikipediaData.thumbnail.source)
      : '';
    popupContent += `
      <div style="margin-bottom: 12px; padding-top: 8px; border-top: 1px solid ${isDarkMode ? '#4b5563' : '#d1d5db'};">
        <div style="display: flex; gap: 8px;">
          ${wikipediaData.thumbnail ? `<img src="${safeWikipediaThumbnail}" alt="${safeWikipediaTitle}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 6px; flex-shrink: 0;" />` : ''}
          <div style="flex: 1;">
            <div style="font-size: 13px; line-height: 1.4; margin-bottom: 8px; ${isDarkMode ? 'color: #d1d5db;' : 'color: #374151;'}">${safeWikipediaExtract}</div>
            <a href="${safeWikipediaUrl}" target="_blank" style="color: #3b82f6; font-size: 12px; text-decoration: underline;">Read more on Wikipedia</a>
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
        <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; ${isDarkMode ? 'color: #bfdbfe;' : 'color: #1d4ed8;'}">
          ${INSTAGRAM_ICON_MARKUP}
          <span>Instagram</span>
        </div>
        ${location.instagramPosts
          .map(post => {
            const caption = post.caption?.trim() || 'View Post';
            const safeCaption = escapeHTML(caption);
            const safeUrl = escapeAttribute(post.url);
            return `
              <div style="margin-top: 2px;">
                <a href="${safeUrl}" target="_blank" style="font-size: 12px; text-decoration: underline; ${isDarkMode ? 'color: #93c5fd;' : 'color: #1d4ed8;'}">
                  ${safeCaption}
                </a>
              </div>
            `;
          })
          .join('')}
      </div>
    `;
  }

  // Add TikTok posts
  if (location.tikTokPosts && location.tikTokPosts.length > 0) {
    const totalTikTokPosts = location.tikTokPosts.length;
    popupContent += `
      <div style="margin-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; ${isDarkMode ? 'color: #fbcfe8;' : 'color: #db2777;'}">
          ${TIKTOK_ICON_MARKUP}
          <span>TikTok</span>
        </div>
        ${location.tikTokPosts
          .map((post, index) => {
            const fallbackLabel = `TikTok Clip${totalTikTokPosts > 1 ? ` #${index + 1}` : ''}`;
            const linkLabel = post.caption?.trim() || fallbackLabel;
            const safeLabel = escapeHTML(linkLabel);
            const safeUrl = escapeAttribute(post.url);
            return `
              <div style="margin-top: 2px;">
                <a href="${safeUrl}" target="_blank" style="font-size: 12px; text-decoration: underline; ${isDarkMode ? 'color: #f9a8d4;' : 'color: #ec4899;'}">
                  ${safeLabel}
                </a>
              </div>
            `;
          })
          .join('')}
      </div>
    `;
  }

  // Add blog posts
  if (location.blogPosts && location.blogPosts.length > 0) {
    popupContent += `
      <div style="margin-bottom: 8px;">
        <strong style="font-size: 12px; ${isDarkMode ? 'color: #93c5fd;' : 'color: #1d4ed8;'}">📝 Blog:</strong>
        ${location.blogPosts
          .map(post => {
            const safeTitle = escapeHTML(post.title);
            const safeUrl = escapeAttribute(post.url);
            const safeExcerpt = post.excerpt ? escapeHTML(post.excerpt) : '';
            return `
              <div style="margin-top: 2px;">
                <a href="${safeUrl}" target="_blank" style="font-size: 12px; text-decoration: underline; ${isDarkMode ? 'color: #60a5fa;' : 'color: #2563eb;'}">
                  ${safeTitle}
                </a>
                ${post.excerpt ? `<div style="font-size: 11px; margin-top: 2px; ${isDarkMode ? 'color: #9ca3af;' : 'color: #6b7280;'}">${safeExcerpt}</div>` : ''}
              </div>
            `;
          })
          .join('')}
      </div>
    `;
  }

  popupContent += '</div>';
  return popupContent;
};

const GROUP_PIXEL_THRESHOLD = 36;
const SPIDER_PIXEL_RADIUS = 24;
const MAP_PAN_STEP_PIXELS = 80;

// Generate legend HTML for a route layer with transport styling
const generateRouteLegendLabel = (
  transportType: string,
  color: string,
  dashArray?: string
): string => {
  // Create SVG line pattern for the legend
  const strokeDasharray = dashArray || 'none';
  return `
    <div style="display: flex; align-items: center; gap: 8px;">
      <svg width="24" height="12" style="flex-shrink: 0;">
        <line x1="0" y1="6" x2="24" y2="6"
          stroke="${color}"
          stroke-width="3"
          stroke-dasharray="${strokeDasharray === 'none' ? '' : strokeDasharray}"
          stroke-linecap="round"
        />
      </svg>
      <span>${transportType}</span>
    </div>
  `;
};

// Generate legend HTML for marker layers
const generateMarkerLegendLabel = (label: string, iconColor: string): string => {
  return `
    <div style="display: flex; align-items: center; gap: 8px;">
      <svg width="16" height="20" viewBox="0 0 25 41" style="flex-shrink: 0;">
        <path d="M12.5 0C5.6 0 0 5.6 0 12.5c0 9.4 12.5 28.5 12.5 28.5S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0z"
          fill="${iconColor}"
          stroke="#fff"
          stroke-width="1"
        />
        <circle cx="12.5" cy="12.5" r="5" fill="#fff"/>
      </svg>
      <span>${label}</span>
    </div>
  `;
};

const EmbeddableMap: React.FC<EmbeddableMapProps> = ({ travelData }) => {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const collapsedByUserRef = useRef<Set<string>>(new Set());
  const [isClient, setIsClient] = useState(false);
  const [L, setL] = useState<typeof import('leaflet') | null>(null);
  const [mapAnnouncement, setMapAnnouncement] = useState('');
  const [focusCount, setFocusCount] = useState(0);

  const mapInstructionsId = useId();
  const mapStatusId = useId();

  const focusOrderRef = useRef<string[]>([]);
  const markerElementsRef = useRef(new globalThis.Map<string, HTMLElement>());
  const markerFocusHandlersRef = useRef(new globalThis.Map<string, () => void>());
  const markerRemoveHandlersRef = useRef(new globalThis.Map<string, () => void>());
  const markerLabelRef = useRef(new globalThis.Map<string, string>());
  const focusedMarkerKeyRef = useRef<string | null>(null);
  const popupOpenRef = useRef(false);

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

  const updateFocusAnnouncement = useCallback((key: string) => {
    const label = markerLabelRef.current.get(key);
    if (label) {
      setMapAnnouncement(`Focused on ${label}.`);
    }
  }, []);

  const unregisterMarkerElement = useCallback((key: string) => {
    const element = markerElementsRef.current.get(key);
    const focusHandler = markerFocusHandlersRef.current.get(key);
    if (element && focusHandler) {
      element.removeEventListener('focus', focusHandler);
    }
    markerElementsRef.current.delete(key);
    markerFocusHandlersRef.current.delete(key);
    markerRemoveHandlersRef.current.delete(key);
    markerLabelRef.current.delete(key);
    if (focusedMarkerKeyRef.current === key) {
      focusedMarkerKeyRef.current = null;
    }
  }, []);

  const registerMarkerElement = useCallback((key: string, label: string, marker: Marker) => {
    const wrapper = marker.getElement();
    if (!wrapper) return;

    // Find the inner focusable element (.travel-marker-interactive has tabindex)
    const element = wrapper.querySelector<HTMLElement>('.travel-marker-interactive') ?? wrapper;

    markerLabelRef.current.set(key, label);

    let focusHandler = markerFocusHandlersRef.current.get(key);
    if (!focusHandler) {
      focusHandler = () => {
        focusedMarkerKeyRef.current = key;
        updateFocusAnnouncement(key);
      };
      markerFocusHandlersRef.current.set(key, focusHandler);
    }

    const previousElement = markerElementsRef.current.get(key);
    if (previousElement && previousElement !== element) {
      previousElement.removeEventListener('focus', focusHandler);
    }
    element.removeEventListener('focus', focusHandler);
    element.addEventListener('focus', focusHandler);
    markerElementsRef.current.set(key, element);

    const existingRemoveHandler = markerRemoveHandlersRef.current.get(key);
    if (existingRemoveHandler) {
      marker.off('remove', existingRemoveHandler);
    }
    const removeHandler = () => unregisterMarkerElement(key);
    markerRemoveHandlersRef.current.set(key, removeHandler);
    marker.on('remove', removeHandler);
  }, [unregisterMarkerElement, updateFocusAnnouncement]);

  const focusMarkerByIndex = useCallback((index: number) => {
    const key = focusOrderRef.current[index];
    if (!key) return;
    const element = markerElementsRef.current.get(key);
    if (!element) return;
    element.focus();
    focusedMarkerKeyRef.current = key;
    updateFocusAnnouncement(key);
  }, [updateFocusAnnouncement]);

  const handleMapFocus = useCallback(() => {
    const focusCount = focusOrderRef.current.length;
    if (focusCount === 0) return;
    setMapAnnouncement(`Map focused. ${focusCount} locations available.`);
  }, []);

  const handleMapKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    const map = mapRef.current;
    if (!map) return;

    const focusOrder = focusOrderRef.current;
    const focusCount = focusOrder.length;
    const currentKey = focusedMarkerKeyRef.current;
    const currentIndex = currentKey ? focusOrder.indexOf(currentKey) : -1;
    const isContainerTarget = event.target === containerRef.current;

    if (event.key === 'Tab' && focusCount > 0) {
      if (isContainerTarget && event.shiftKey) {
        return;
      }
      const direction = event.shiftKey ? -1 : 1;
      const isAtStart = currentIndex <= 0;
      const isAtEnd = currentIndex === focusCount - 1;

      if (!isContainerTarget) {
        if (event.shiftKey && isAtStart) return;
        if (!event.shiftKey && isAtEnd) return;
      }

      event.preventDefault();
      const nextIndex = currentIndex === -1
        ? (direction === 1 ? 0 : focusCount - 1)
        : (currentIndex + direction + focusCount) % focusCount;
      focusMarkerByIndex(nextIndex);
      return;
    }

    switch (event.key) {
      case 'Home':
        if (focusCount === 0) return;
        event.preventDefault();
        focusMarkerByIndex(0);
        break;
      case 'End':
        if (focusCount === 0) return;
        event.preventDefault();
        focusMarkerByIndex(focusCount - 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        map.panBy([0, -MAP_PAN_STEP_PIXELS]);
        setMapAnnouncement('Map moved north.');
        break;
      case 'ArrowDown':
        event.preventDefault();
        map.panBy([0, MAP_PAN_STEP_PIXELS]);
        setMapAnnouncement('Map moved south.');
        break;
      case 'ArrowLeft':
        event.preventDefault();
        map.panBy([-MAP_PAN_STEP_PIXELS, 0]);
        setMapAnnouncement('Map moved west.');
        break;
      case 'ArrowRight':
        event.preventDefault();
        map.panBy([MAP_PAN_STEP_PIXELS, 0]);
        setMapAnnouncement('Map moved east.');
        break;
      case '+':
      case '=': {
        event.preventDefault();
        const currentZoom = map.getZoom();
        const maxZoom = map.getMaxZoom();
        const nextZoom = Math.min(currentZoom + 1, maxZoom);
        if (nextZoom !== currentZoom) {
          map.zoomIn();
          setMapAnnouncement(`Zoom level ${nextZoom}.`);
        }
        break;
      }
      case '-':
      case '_': {
        event.preventDefault();
        const currentZoom = map.getZoom();
        const minZoom = map.getMinZoom();
        const nextZoom = Math.max(currentZoom - 1, minZoom);
        if (nextZoom !== currentZoom) {
          map.zoomOut();
          setMapAnnouncement(`Zoom level ${nextZoom}.`);
        }
        break;
      }
      case 'Escape':
        if (popupOpenRef.current) {
          event.preventDefault();
          map.closePopup();
          // Announcement is now handled by the 'popupclose' event listener
        }
        break;
      default:
        break;
    }
  }, [focusMarkerByIndex]);

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
    });
  }, [isClient]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !L || !isClient) return;

    // Create map
    const map = L.map(containerRef.current, {
      center: [20, 0],
      zoom: 2,
      scrollWheelZoom: true,
    });

    // Add tile layer
    const tileLayerUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    const attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

    L.tileLayer(tileLayerUrl, {
      attribution: attribution
    }).addTo(map);

    map.on('popupopen', () => { popupOpenRef.current = true; });
    map.on('popupclose', () => {
      popupOpenRef.current = false;
      setMapAnnouncement('Popup closed.');
    });

    mapRef.current = map;

    // Create layer groups for different map elements
    const locationMarkersLayer = L.layerGroup().addTo(map);
    // Start/end markers are available via the layer control, but off by default.
    const startEndLayer = L.layerGroup();
    const routeLayersByType = new globalThis.Map<string, L.LayerGroup>();
    const spiderfyLegsLayer = L.layerGroup().addTo(map);

    const markerIconCache = new globalThis.Map<string, import('leaflet').DivIcon>();
    const highlightedIconCache = new globalThis.Map<string, import('leaflet').DivIcon>();

    const getMarkerIcon = (
      location: TravelData['locations'][0],
      isHighlighted: boolean,
      label: string,
      labelKey: string
    ): import('leaflet').Icon | import('leaflet').DivIcon | undefined => {
      const { status, days } = getLocationTemporalDistanceDays(location);
      const bucket = getMarkerDistanceBucket(days);
      if (isHighlighted) {
        const highlightedKey = `highlight:${status}:${bucket}:${labelKey}`;
        const cachedHighlighted = highlightedIconCache.get(highlightedKey);
        if (cachedHighlighted) return cachedHighlighted;
        const icon = createHighlightedMarkerIcon(L, status, bucket, { label });
        highlightedIconCache.set(highlightedKey, icon);
        return icon;
      }
      const cacheKey = `${status}:${bucket}:${labelKey}`;
      const cached = markerIconCache.get(cacheKey);
      if (cached) return cached;
      const icon = createMarkerIcon(L, status, bucket, { label });
      markerIconCache.set(cacheKey, icon);
      return icon;
    };

    const getLocationLabelData = (location: TravelData['locations'][0]) => {
      const { status } = getLocationTemporalDistanceDays(location);
      const labelInput = {
        id: location.id,
        name: location.name,
        status,
        startDate: location.date,
        endDate: location.endDate,
      };

      return {
        label: buildLocationAriaLabel(labelInput),
        labelKey: buildLocationLabelKey(labelInput),
      };
    };

    // Note: meters-based fallback removed to avoid unused warnings

    const distributeAroundPointPixels = (
      map: L.Map,
      center: [number, number],
      index: number,
      total: number,
      pixelRadius = SPIDER_PIXEL_RADIUS
    ): [number, number] => {
      const angle = (2 * Math.PI * index) / total;
      const centerLL = L.latLng(center[0], center[1]);
      const p = map.project(centerLL, map.getZoom());
      const dx = Math.cos(angle) * pixelRadius;
      const dy = Math.sin(angle) * pixelRadius;
      const p2 = L.point(p.x + dx, p.y + dy);
      const ll = map.unproject(p2, map.getZoom());
      return [ll.lat, ll.lng];
    };

    // Add markers for locations with grouping + spiderfy
    // Find the location closest to current date
    const closestLocation = findClosestLocationToCurrentDate(
      travelData.locations.map(location => ({
        ...location,
        date: new Date(location.date)
      }))
    );

    type GroupItem = TravelData['locations'][0];
    type Group = { key: string; center: [number, number]; items: GroupItem[] };

    const sortItemsByOrientation = (
      mapInstance: L.Map,
      center: [number, number],
      items: GroupItem[]
    ): GroupItem[] => {
      if (items.length <= 1) return items;

      const zoom = mapInstance.getZoom();
      const centerPoint = mapInstance.project(L.latLng(center[0], center[1]), zoom);

      const getAngle = (item: GroupItem) => {
        const point = mapInstance.project(L.latLng(item.coordinates[0], item.coordinates[1]), zoom);
        const dx = point.x - centerPoint.x;
        const dy = point.y - centerPoint.y;
        if (dx === 0 && dy === 0) return Number.POSITIVE_INFINITY;
        return Math.atan2(dy, dx);
      };

      return [...items].sort((a, b) => {
        const angleA = getAngle(a);
        const angleB = getAngle(b);
        if (Number.isFinite(angleA) && Number.isFinite(angleB) && angleA !== angleB) {
          return angleA - angleB;
        }

        const [aLat, aLng] = a.coordinates;
        const [bLat, bLng] = b.coordinates;
        if (aLng !== bLng) return aLng - bLng;
        if (aLat !== bLat) return aLat - bLat;
        return a.id.localeCompare(b.id);
      });
    };

    const buildGroupKey = (items: GroupItem[]): string =>
      items
        .map(item => item.id)
        .sort()
        .join('|');

    const groupLocationsForSpiderfy = (
      mapInstance: L.Map,
      items: GroupItem[],
      pixelThreshold = GROUP_PIXEL_THRESHOLD
    ): Group[] => {
      if (!items.length) return [];

      const zoom = mapInstance.getZoom();
      const internalGroups: Array<{ items: GroupItem[]; pixelSum: { x: number; y: number } }> = [];

      const sortedItems = [...items].sort((a, b) => {
        const [aLat, aLng] = a.coordinates;
        const [bLat, bLng] = b.coordinates;
        if (aLat === bLat) return aLng - bLng;
        return aLat - bLat;
      });

      sortedItems.forEach(item => {
        const projected = mapInstance.project(L.latLng(item.coordinates[0], item.coordinates[1]), zoom);

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
          return { key: 'empty', center: [0, 0], items: [] };
        }

        if (count === 1) {
          const single = group.items[0];
          const center = single.coordinates;
          const sortedItems = sortItemsByOrientation(mapInstance, center, group.items);
          return {
            key: buildGroupKey(sortedItems),
            center,
            items: sortedItems,
          };
        }

        const centerPoint = L.point(group.pixelSum.x / count, group.pixelSum.y / count);
        const centerLatLng = mapInstance.unproject(centerPoint, zoom);
        const center: [number, number] = [centerLatLng.lat, centerLatLng.lng];
        const sortedItems = sortItemsByOrientation(mapInstance, center, group.items);
        return {
          key: buildGroupKey(sortedItems),
          center,
          items: sortedItems,
        };
      });
    };

    type GroupLayerState = {
      group: Group;
      groupMarker: L.Marker;
      childMarkers: L.Marker[];
      legs: L.Polyline[];
      collapseMarker?: L.Marker;
    };

    const expanded = new Set<string>();
    const collapsedByUser = collapsedByUserRef.current;
    const singles: L.Marker[] = [];
    const groupLayers = new Map<string, GroupLayerState>();
    let currentGroups: Group[] = [];

    const clearAllMarkers = () => {
      singles.forEach(marker => marker.remove());
      singles.length = 0;
      groupLayers.forEach(state => {
        state.childMarkers.forEach(marker => marker.remove());
        state.legs.forEach(leg => leg.remove());
        if (state.collapseMarker) {
          state.collapseMarker.off('click');
          state.collapseMarker.remove();
          state.collapseMarker = undefined;
        }
        state.groupMarker.remove();
      });
      groupLayers.clear();
      // Note: unregisterMarkerElement is called automatically via marker 'remove' event handlers
      focusOrderRef.current = [];
      focusedMarkerKeyRef.current = null;
    };

    const updateFocusOrder = () => {
      const nextFocusOrder: string[] = [];

      currentGroups.forEach(group => {
        if (group.items.length === 1) {
          nextFocusOrder.push(group.items[0].id);
          return;
        }

        if (!expanded.has(group.key)) {
          nextFocusOrder.push(group.key);
          return;
        }

        group.items.forEach(location => {
          nextFocusOrder.push(location.id);
        });
        nextFocusOrder.push(`collapse-${group.key}`);
      });

      focusOrderRef.current = nextFocusOrder;
      setFocusCount(nextFocusOrder.length);
      if (focusedMarkerKeyRef.current && !nextFocusOrder.includes(focusedMarkerKeyRef.current)) {
        focusedMarkerKeyRef.current = null;
      }
    };

    const attachPopupAndEnrich = async (marker: L.Marker, location: GroupItem) => {
      // Generate initial popup content
      const initialPopupContent = generatePopupHTML(location);
      marker.bindPopup(initialPopupContent, { maxWidth: 400, className: 'wikipedia-popup' });

      try {
        const wikipediaParams = new URLSearchParams({
          lat: location.coordinates[0].toString(),
          lon: location.coordinates[1].toString()
        });
        const trimmedWikipediaRef = location.wikipediaRef?.trim();
        if (trimmedWikipediaRef) {
          wikipediaParams.set('wikipediaRef', trimmedWikipediaRef);
        }
        const response = await fetch(`/api/wikipedia/${encodeURIComponent(location.name)}?${wikipediaParams.toString()}`);
        if (response.ok) {
          const wikipediaResponse = await response.json();
          // Weather fetch (always today's weather at this location)
          let weatherBlock: { icon: string; temp?: number | null; description?: string } | undefined = undefined;
          try {
            const todayISO = new Date().toISOString().slice(0, 10);
            const wRes = await fetch(`/api/weather/date?lat=${location.coordinates[0]}&lon=${location.coordinates[1]}&date=${todayISO}`);
            if (wRes.ok) {
              const wJson: { data?: { dailyWeather?: Array<{ date: string; conditions?: { icon?: string; description?: string }; temperature?: { average?: number | null } }> } } = await wRes.json();
              const today = wJson?.data?.dailyWeather?.[0];
              if (today) {
                weatherBlock = { icon: today.conditions?.icon || '⛅', temp: today.temperature?.average ?? null, description: today.conditions?.description };
              }
            }
          } catch (weatherError) {
            console.debug('Failed to fetch weather data:', weatherError);
          }

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
    };
    const collapseGroup = (groupKey: string) => {
      const state = groupLayers.get(groupKey);
      if (!state) return;

      state.childMarkers.forEach(marker => marker.remove());
      state.childMarkers = [];
      state.legs.forEach(leg => leg.remove());
      state.legs = [];
      if (state.collapseMarker) {
        state.collapseMarker.off('click');
        state.collapseMarker.remove();
        state.collapseMarker = undefined;
      }
      state.groupMarker.addTo(locationMarkersLayer);
      expanded.delete(groupKey);
      collapsedByUser.add(groupKey);
      updateFocusOrder();
      setMapAnnouncement(`Collapsed ${state.group.items.length} locations back to group marker.`);
    };

    const expandGroup = (groupKey: string, providedState?: GroupLayerState) => {
      const state = providedState ?? groupLayers.get(groupKey);
      if (!state) return;

      state.childMarkers.forEach(marker => marker.remove());
      state.childMarkers = [];
      state.legs.forEach(leg => leg.remove());
      state.legs = [];
      if (state.collapseMarker) {
        state.collapseMarker.off('click');
        state.collapseMarker.remove();
        state.collapseMarker = undefined;
      }

      state.groupMarker.remove();
      collapsedByUser.delete(groupKey);

      state.group.items.forEach((location, index) => {
        const distributed = distributeAroundPointPixels(map, state.group.center, index, state.group.items.length, SPIDER_PIXEL_RADIUS);
        const leg = L.polyline([location.coordinates, distributed], { color: '#9CA3AF', weight: 3, opacity: 0.8, dashArray: '2 4' }).addTo(spiderfyLegsLayer);
        state.legs.push(leg);
        const isHighlighted = closestLocation?.id === location.id;
        const { label, labelKey } = getLocationLabelData(location);
        const markerOptions: L.MarkerOptions = { keyboard: false };
        const icon = getMarkerIcon(location, isHighlighted, label, labelKey);
        if (icon) {
          markerOptions.icon = icon;
        }
        const child = L.marker(distributed, markerOptions).addTo(locationMarkersLayer);
        attachPopupAndEnrich(child, location);
        attachMarkerKeyHandlers(child, () => child.openPopup());
        registerMarkerElement(location.id, label, child);
        state.childMarkers.push(child);
      });

      const temporalInfos = state.group.items.map(location => getLocationTemporalDistanceDays(location));
      const collapseTone = getDominantMarkerTone(temporalInfos.map(info => info.status));
      const collapseDistanceBucket = getMarkerDistanceBucket(
        Math.min(...temporalInfos.filter(info => info.status === collapseTone).map(info => info.days))
      );
      const collapseLabel = `Collapse group of ${state.group.items.length} locations.`;
      const collapseHandler = () => collapseGroup(groupKey);
      const collapseMarker = L.marker(state.group.center, {
        icon: createCountMarkerIcon(L, state.group.items.length, collapseTone, collapseDistanceBucket, {
          label: collapseLabel,
          className: 'travel-marker-collapse',
        }),
        keyboard: false,
      }).addTo(locationMarkersLayer);
      collapseMarker.on('click', collapseHandler);
      attachMarkerKeyHandlers(collapseMarker, collapseHandler);
      registerMarkerElement(`collapse-${groupKey}`, collapseLabel, collapseMarker);
      state.collapseMarker = collapseMarker;
      expanded.add(groupKey);
      updateFocusOrder();
      setMapAnnouncement(`Expanded group of ${state.group.items.length} locations. Press Tab to navigate to individual locations.`);
    };

    const renderGroups = () => {
      clearAllMarkers();

      const groups = groupLocationsForSpiderfy(map, travelData.locations);
      currentGroups = groups;
      const validKeys = new Set(groups.map(group => group.key));
      for (const key of Array.from(expanded)) {
        if (!validKeys.has(key)) {
          expanded.delete(key);
        }
      }
      for (const key of Array.from(collapsedByUser)) {
        if (!validKeys.has(key)) {
          collapsedByUser.delete(key);
        }
      }

      const highlightedGroup = closestLocation
        ? groups.find(group => group.items.some(location => location.id === closestLocation.id))
        : undefined;
      if (
        highlightedGroup
        && highlightedGroup.items.length > 1
        && !expanded.has(highlightedGroup.key)
        && !collapsedByUser.has(highlightedGroup.key)
      ) {
        expanded.add(highlightedGroup.key);
      }

      groups.forEach(group => {
        if (group.items.length === 1) {
          const location = group.items[0];
          const isHighlighted = closestLocation?.id === location.id;
          const { label, labelKey } = getLocationLabelData(location);
          const markerOptions: L.MarkerOptions = { keyboard: false };
          const icon = getMarkerIcon(location, isHighlighted, label, labelKey);
          if (icon) {
            markerOptions.icon = icon;
          }
          const marker = L.marker(location.coordinates, markerOptions).addTo(locationMarkersLayer);
          attachPopupAndEnrich(marker, location);
          attachMarkerKeyHandlers(marker, () => marker.openPopup());
          registerMarkerElement(location.id, label, marker);
          singles.push(marker);
          return;
        }

        const temporalInfos = group.items.map(location => getLocationTemporalDistanceDays(location));
        const groupTone = getDominantMarkerTone(temporalInfos.map(info => info.status));
        const groupDistanceBucket = getMarkerDistanceBucket(
          Math.min(...temporalInfos.filter(info => info.status === groupTone).map(info => info.days))
        );
        const label = `Group of ${group.items.length} locations. Activate to expand.`;
        const groupMarker = L.marker(group.center, {
          icon: createCountMarkerIcon(L, group.items.length, groupTone, groupDistanceBucket, { label }),
          keyboard: false,
        }).addTo(locationMarkersLayer);
        registerMarkerElement(group.key, label, groupMarker);
        const state: GroupLayerState = { group, groupMarker, childMarkers: [], legs: [] };
        groupLayers.set(group.key, state);

        groupMarker.on('click', () => {
          if (expanded.has(group.key)) return;
          expandGroup(group.key, state);
        });
        attachMarkerKeyHandlers(groupMarker, () => {
          if (expanded.has(group.key)) return;
          expandGroup(group.key, state);
        });

        if (expanded.has(group.key)) {
          expandGroup(group.key, state);
        }
      });

      updateFocusOrder();
    };

    renderGroups();

    const onViewChange = () => {
      renderGroups();
    };

    map.on('zoomend', onViewChange);

    const resolveRoutePoints = (route: MapRouteSegment) => {
      if (route.subRoutes?.length) {
        return buildCompositeRoutePoints(route.subRoutes);
      }

      if (route.routePoints && route.routePoints.length > 0) {
        // Use pre-generated points for better performance and accuracy
        console.log(`[EmbeddableMap] Using pre-generated route points for ${route.id}: ${route.routePoints.length} points`);
        return route.routePoints;
      }

      // Fallback to straight lines if no pre-generated points available
      console.log(`[EmbeddableMap] No pre-generated points for ${route.id}, using straight line fallback`);
      return [route.fromCoords, route.toCoords];
    };

    // Add routes grouped by transport type
    const usedTransportTypes = new Set<keyof typeof transportationConfig>();
    travelData.routes.forEach((route) => {
      const routePoints = resolveRoutePoints(route);
      // Normalize transport type to a valid key, fallback to 'other' if unknown
      const transportKey = (route.transportType in transportationConfig
        ? route.transportType
        : 'other') as keyof typeof transportationConfig;
      const routeStyle = getRouteStyle(transportKey);

      if (routePoints.length > 0) {
        // Get or create layer group for this transport type
        let layerGroup = routeLayersByType.get(transportKey);
        if (!layerGroup) {
          layerGroup = L.layerGroup().addTo(map);
          routeLayersByType.set(transportKey, layerGroup);
        }
        usedTransportTypes.add(transportKey);

        L.polyline(routePoints, {
          color: routeStyle.color,
          weight: routeStyle.weight,
          opacity: routeStyle.opacity,
          dashArray: routeStyle.dashArray
        }).addTo(layerGroup);
      }
    });

    // Add start and end point markers
    if (travelData.locations.length > 0) {
      // Sort locations by date to find start and end
      const sortedLocations = [...travelData.locations].sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateA - dateB;
      });

      const startLocation = sortedLocations[0];
      const endLocation = sortedLocations[sortedLocations.length - 1];

      // Create start marker (green)
      const startIcon = L.divIcon({
        className: 'start-end-marker',
        html: `
          <div style="
            width: 28px;
            height: 28px;
            background-color: #22c55e;
            border: 3px solid white;
            border-radius: 50%;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 14px;
          ">S</div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      // Create end marker (red)
      const endIcon = L.divIcon({
        className: 'start-end-marker',
        html: `
          <div style="
            width: 28px;
            height: 28px;
            background-color: #ef4444;
            border: 3px solid white;
            border-radius: 50%;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 14px;
          ">E</div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      L.marker(startLocation.coordinates, { icon: startIcon })
        .bindPopup(`<strong>Start:</strong> ${escapeHTML(startLocation.name)}`)
        .addTo(startEndLayer);

      // Only add end marker if it's different from start
      if (startLocation.id !== endLocation.id) {
        L.marker(endLocation.coordinates, { icon: endIcon })
          .bindPopup(`<strong>End:</strong> ${escapeHTML(endLocation.name)}`)
          .addTo(startEndLayer);
      }
    }

    // Build layer control overlays
    const overlays: Record<string, L.LayerGroup> = {};

    // Add route layers with legend labels
    usedTransportTypes.forEach(transportType => {
      const layerGroup = routeLayersByType.get(transportType);
      if (layerGroup) {
        const config = transportationConfig[transportType];
        const legendLabel = generateRouteLegendLabel(
          config.description,
          config.color,
          config.dashArray
        );
        overlays[legendLabel] = layerGroup;
      }
    });

    // Add location markers layer
    overlays[generateMarkerLegendLabel('Locations', '#3b82f6')] = locationMarkersLayer;

    // Add start/end layer
    overlays[`
      <div style="display: flex; align-items: center; gap: 8px;">
        <div style="display: flex; gap: 4px;">
          <div style="width: 16px; height: 16px; background-color: #22c55e; border: 2px solid white; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">S</div>
          <div style="width: 16px; height: 16px; background-color: #ef4444; border: 2px solid white; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">E</div>
        </div>
        <span>Start / End</span>
      </div>
    `] = startEndLayer;

    // Add layer control to map
    L.control.layers(undefined, overlays, {
      collapsed: false,
      position: 'topright'
    }).addTo(map);

    // Handle overlay visibility changes for keyboard navigation (WCAG compliance)
    map.on('overlayadd', (event: L.LayersControlEvent) => {
      if (event.layer === locationMarkersLayer) {
        // Restore focus order when locations layer is re-enabled
        updateFocusOrder();
      }
    });

    map.on('overlayremove', (event: L.LayersControlEvent) => {
      if (event.layer === locationMarkersLayer) {
        // Clear focus order when locations layer is disabled to prevent Tab trapping
        focusOrderRef.current = [];
        focusedMarkerKeyRef.current = null;
        setFocusCount(0);
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
      map.off('zoomend', onViewChange);
      clearAllMarkers();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [travelData, L, isClient, registerMarkerElement, unregisterMarkerElement]);

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
      <div id={mapInstructionsId} className="sr-only">
        Interactive travel map for {travelData.title}. {focusCount} locations available.
        Keyboard controls: Tab and Shift+Tab move between locations and groups. Enter or Space opens a location popup.
        Arrow keys pan the map in each direction. Plus and minus keys zoom in and out.
        Home key jumps to first location, End key jumps to last location.
        Escape key closes popups and returns focus to map.
        When a group is focused, activating it expands to show individual locations.
        When expanded, a collapse marker is available to return to group view.
      </div>
      <div id={mapStatusId} className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {mapAnnouncement}
      </div>
      <div
        ref={containerRef}
        className="h-full w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900"
        style={{ minHeight: '400px' }}
        tabIndex={0}
        role="application"
        aria-label={`Interactive travel map for ${travelData.title}`}
        aria-describedby={`${mapInstructionsId} ${mapStatusId}`}
        onKeyDown={handleMapKeyDown}
        onFocus={handleMapFocus}
      />
    </>
  );
};

export default EmbeddableMap;
