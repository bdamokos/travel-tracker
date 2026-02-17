'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Marker } from 'leaflet';

// Import Leaflet CSS separately
import 'leaflet/dist/leaflet.css';
import { findClosestLocationToCurrentDate, formatDateRange, getLocationTemporalDistanceDays } from '@/app/lib/dateUtils';
import { mergeLocationVisits, type MergedLocationVisit } from '@/app/lib/locationVisitUtils';
import { getRouteStyle, transportationConfig } from '@/app/lib/routeUtils';
import { getLeafMapRouteSegments, resolveMapRouteSegmentPoints } from '@/app/lib/mapRouteDisplay';
import type { MapTravelData } from '@/app/types';
import {
  attachMarkerKeyHandlers,
  buildLocationAriaLabel,
  buildLocationLabelKey,
  createCountMarkerIcon,
  createHighlightedMarkerIcon,
  createMarkerIcon,
  escapeAttribute,
  getMarkerLegendSvgMarkup,
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

interface EmbeddableMapProps {
  travelData: MapTravelData;
  debug?: boolean;
}

const escapeHTML = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

// Function to generate popup HTML with Wikipedia and Weather data
const generatePopupHTML = (locationGroup: MergedLocationVisit, wikipediaData?: {
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

  const visits = locationGroup.visits;
  const safeLocationName = escapeHTML(locationGroup.name);
  const visitCount = visits.length;
  const seenInstagramPostKeys = new Set<string>();
  const seenTikTokPostKeys = new Set<string>();
  const seenBlogPostKeys = new Set<string>();
  const buildPostKey = (id: string | undefined, url: string): string | null => {
    const normalizedUrl = url.trim().toLowerCase();
    if (normalizedUrl) {
      return `url:${normalizedUrl}`;
    }

    const normalizedId = id?.trim().toLowerCase();
    if (normalizedId) {
      return `id:${normalizedId}`;
    }

    return null;
  };

  const visitSections = visits.map((visit, index) => {
    const safeDateRange = escapeHTML(formatDateRange(visit.date, visit.endDate));
    const safeNotes = visit.notes ? escapeHTML(visit.notes) : '';
    const isLastVisit = index === visits.length - 1;

    const instagramMarkup = (visit.instagramPosts ?? [])
      .filter(post => {
        const key = buildPostKey(post.id, post.url);
        if (!key) return true;
        if (seenInstagramPostKeys.has(key)) return false;
        seenInstagramPostKeys.add(key);
        return true;
      })
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
      }).join('');

    const tikTokPosts = (visit.tikTokPosts ?? []).filter(post => {
      const key = buildPostKey(post.id, post.url);
      if (!key) return true;
      if (seenTikTokPostKeys.has(key)) return false;
      seenTikTokPostKeys.add(key);
      return true;
    });
    const tikTokMarkup = tikTokPosts.map((post, postIndex) => {
      const fallbackLabel = `TikTok Clip${tikTokPosts.length > 1 ? ` #${postIndex + 1}` : ''}`;
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
    }).join('');

    const blogMarkup = (visit.blogPosts ?? [])
      .filter(post => {
        const key = buildPostKey(post.id, post.url);
        if (!key) return true;
        if (seenBlogPostKeys.has(key)) return false;
        seenBlogPostKeys.add(key);
        return true;
      })
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
      }).join('');

    return `
      <div style="margin-bottom: ${isLastVisit ? '0' : '10px'}; padding-bottom: ${isLastVisit ? '0' : '10px'}; ${isLastVisit ? '' : `border-bottom: 1px solid ${isDarkMode ? '#4b5563' : '#e5e7eb'};`}">
        <div style="font-size: 12px; font-weight: 600; margin-bottom: 4px; ${isDarkMode ? 'color: #d1d5db;' : 'color: #374151;'}">${visitCount > 1 ? `Visit ${index + 1}` : 'Stay'}</div>
        <p style="font-size: 14px; margin-bottom: 6px; ${isDarkMode ? 'color: #9ca3af;' : 'color: #6b7280;'}">${safeDateRange}</p>
        ${safeNotes ? `<p style="font-size: 14px; margin-bottom: 8px; ${isDarkMode ? 'color: #d1d5db;' : 'color: #374151;'}">${safeNotes}</p>` : ''}
        ${instagramMarkup ? `<div style="margin-bottom: 8px;"><div style="display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; ${isDarkMode ? 'color: #bfdbfe;' : 'color: #1d4ed8;'}">${INSTAGRAM_ICON_MARKUP}<span>Instagram</span></div>${instagramMarkup}</div>` : ''}
        ${tikTokMarkup ? `<div style="margin-bottom: 8px;"><div style="display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; ${isDarkMode ? 'color: #fbcfe8;' : 'color: #db2777;'}">${TIKTOK_ICON_MARKUP}<span>TikTok</span></div>${tikTokMarkup}</div>` : ''}
        ${blogMarkup ? `<div style="margin-bottom: 8px;"><strong style="font-size: 12px; ${isDarkMode ? 'color: #93c5fd;' : 'color: #1d4ed8;'}">📝 Blog:</strong>${blogMarkup}</div>` : ''}
      </div>
    `;
  }).join('');

  let popupContent = `
    <div style="padding: 12px; max-width: 400px; border-radius: 8px; ${popupStyles} font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
      <h4 style="font-weight: bold; font-size: 18px; margin-bottom: 6px; ${isDarkMode ? 'color: #f9fafb;' : 'color: #111827;'}">${safeLocationName}</h4>
      ${visitCount > 1 ? `<p style="font-size: 12px; margin-bottom: 10px; font-weight: 600; ${isDarkMode ? 'color: #bfdbfe;' : 'color: #1d4ed8;'}">Visited ${visitCount} times</p>` : ''}
      ${visitSections}
  `;

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

  popupContent += '</div>';
  return popupContent;
};

const generateRouteDebugPopupHTML = (params: {
  parentRouteId: string;
  parentRouteType: string;
  segmentId: string;
  segmentType: string;
  from: string;
  to: string;
  pointsCount: number;
  pointSource: 'segment-routePoints' | 'endpoint-fallback';
  firstPoint?: [number, number];
  lastPoint?: [number, number];
  date?: string;
}) => {
  const isDarkMode = typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const popupStyles = isDarkMode
    ? 'background-color: #111827; color: #f9fafb; border: 1px solid #374151;'
    : 'background-color: white; color: #111827; border: 1px solid #d1d5db;';

  const sourceLabel = params.pointSource === 'segment-routePoints'
    ? 'segment routePoints'
    : 'from/to fallback';
  const firstPoint = params.firstPoint
    ? `${params.firstPoint[0].toFixed(6)}, ${params.firstPoint[1].toFixed(6)}`
    : 'n/a';
  const lastPoint = params.lastPoint
    ? `${params.lastPoint[0].toFixed(6)}, ${params.lastPoint[1].toFixed(6)}`
    : 'n/a';

  return `
    <div style="padding: 10px; min-width: 280px; max-width: 420px; border-radius: 8px; ${popupStyles} font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
      <h4 style="font-weight: 700; font-size: 14px; margin-bottom: 8px;">Route Segment Debug</h4>
      <div style="font-size: 12px; line-height: 1.5;">
        <div><strong>Parent route:</strong> ${escapeHTML(params.parentRouteId)} (${escapeHTML(params.parentRouteType)})</div>
        <div><strong>Segment:</strong> ${escapeHTML(params.segmentId)} (${escapeHTML(params.segmentType)})</div>
        <div><strong>From/To:</strong> ${escapeHTML(params.from)} → ${escapeHTML(params.to)}</div>
        ${params.date ? `<div><strong>Date:</strong> ${escapeHTML(params.date)}</div>` : ''}
        <div><strong>Points:</strong> ${params.pointsCount}</div>
        <div><strong>Point source:</strong> ${escapeHTML(sourceLabel)}</div>
        <div><strong>First point:</strong> ${escapeHTML(firstPoint)}</div>
        <div><strong>Last point:</strong> ${escapeHTML(lastPoint)}</div>
      </div>
    </div>
  `;
};

const GROUP_PIXEL_THRESHOLD = 36;
const SPIDER_PIXEL_RADIUS = 24;
const MAP_PAN_STEP_PIXELS = 80;

type TransportLegendStyle = {
  color: string;
  weight: number;
  opacity: number;
  dashArray?: string;
};

const TRANSPORT_LEGEND_ORDER: Array<keyof typeof transportationConfig> = [
  'plane',
  'train',
  'car',
  'bus',
  'shuttle',
  'metro',
  'ferry',
  'boat',
  'bike',
  'walk',
  'multimodal',
  'other',
];

// Generate legend HTML for a route layer with transport styling
const generateRouteLegendLabel = (
  transportType: string,
  style: TransportLegendStyle
): string => {
  const legendWeight = Math.min(Math.max(style.weight, 3), 6);
  const strokeOpacity = Math.max(style.opacity, 0.85);
  return `
    <div style="display: flex; align-items: center; gap: 8px; min-height: 22px;">
      <svg width="34" height="12" style="flex-shrink: 0; overflow: visible;">
        <line x1="1" y1="6" x2="33" y2="6"
          stroke="${style.color}"
          stroke-opacity="${strokeOpacity}"
          stroke-width="${legendWeight}"
          stroke-dasharray="${style.dashArray ?? ''}"
          stroke-linecap="round"
        />
      </svg>
      <span style="font-weight: 500;">${transportType}</span>
    </div>
  `;
};

const LOCATIONS_LEGEND_BASE_ICON_SIZE = { width: 16, height: 24 } as const;
const LOCATIONS_LEGEND_SUB_ICON_SIZE = { width: 12, height: 18 } as const;
const LOCATIONS_LEGEND_ITEMS = [
  { tone: 'past', label: 'Past' },
  { tone: 'present', label: 'Current' },
  { tone: 'future', label: 'Future' },
] as const;

const generateLocationsLegendLabel = (): string => {
  const baseIcon = getMarkerLegendSvgMarkup('present', LOCATIONS_LEGEND_BASE_ICON_SIZE);
  const legendItemsMarkup = LOCATIONS_LEGEND_ITEMS.map(
    item => `
      <span style="display: flex; align-items: center; gap: 4px;">
        ${getMarkerLegendSvgMarkup(item.tone, LOCATIONS_LEGEND_SUB_ICON_SIZE)}
        <span>${item.label}</span>
      </span>
    `
  ).join('');

  return `
    <div style="display: flex; flex-direction: column; gap: 2px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        ${baseIcon}
        <span>Locations</span>
      </div>
      <div style="
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
        padding-left: 24px;
        font-size: 11px;
        line-height: 1.2;
        opacity: 0.9;
      ">
        ${legendItemsMarkup}
      </div>
    </div>
  `;
};

const EmbeddableMap: React.FC<EmbeddableMapProps> = ({ travelData, debug = false }) => {
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
      const parentRoutePoints = route.routePoints?.length || 0;
      const leafSegments = getLeafMapRouteSegments(route);
      const leafSegmentPoints = leafSegments.reduce(
        (sum, segment) => sum + resolveMapRouteSegmentPoints(segment).length,
        0
      );
      const leafSegmentsWithOwnPoints = leafSegments.filter(segment => (segment.routePoints?.length || 0) > 0).length;
      const summary = `[EmbeddableMap] Received route ${index} (${route.id}): parent points=${parentRoutePoints}, leaf segments=${leafSegments.length}, leaf points=${leafSegmentPoints}, segments-with-routePoints=${leafSegmentsWithOwnPoints}`;
      if (debug) {
        const leafDetails = leafSegments
          .map(segment => `${segment.id}:${segment.transportType}:${resolveMapRouteSegmentPoints(segment).length}`)
          .join(' | ');
        console.log(`${summary} [${leafDetails}]`);
      } else {
        console.log(summary);
      }
    });
  }, [debug, travelData.id, travelData.routes]);

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
    const routeLayersByType = new globalThis.Map<keyof typeof transportationConfig, L.LayerGroup>();
    const spiderfyLegsLayer = L.layerGroup().addTo(map);

    const markerIconCache = new globalThis.Map<string, import('leaflet').DivIcon>();
    const highlightedIconCache = new globalThis.Map<string, import('leaflet').DivIcon>();

    const getMarkerIcon = (
      location: GroupItem,
      isHighlighted: boolean,
      label: string,
      labelKey: string
    ): import('leaflet').Icon | import('leaflet').DivIcon | undefined => {
      const temporalInfos = location.visits.map(visit => getLocationTemporalDistanceDays(visit));
      const status = getDominantMarkerTone(temporalInfos.map(info => info.status));
      const statusDays = temporalInfos.filter(info => info.status === status).map(info => info.days);
      const days = statusDays.length > 0 ? Math.min(...statusDays) : 0;
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

    const getGroupItemMarkerIcon = (
      location: GroupItem,
      isHighlighted: boolean,
      label: string,
      labelKey: string
    ): import('leaflet').Icon | import('leaflet').DivIcon | undefined => {
      if (location.visits.length <= 1) {
        return getMarkerIcon(location, isHighlighted, label, labelKey);
      }

      const temporalInfos = location.visits.map(visit => getLocationTemporalDistanceDays(visit));
      const visitTone = getDominantMarkerTone(temporalInfos.map(info => info.status));
      const visitDays = temporalInfos.filter(info => info.status === visitTone).map(info => info.days);
      const visitBucket = getMarkerDistanceBucket(visitDays.length > 0 ? Math.min(...visitDays) : 0);

      return createCountMarkerIcon(L, location.visits.length, visitTone, visitBucket, {
        label,
        highlighted: isHighlighted,
        badgeVariant: 'visit',
      });
    };

    const getLocationLabelData = (location: GroupItem) => {
      const firstVisit = location.visits[0];
      const lastVisit = location.visits[location.visits.length - 1];
      const temporalInfos = location.visits.map(visit => getLocationTemporalDistanceDays(visit));
      const status = getDominantMarkerTone(temporalInfos.map(info => info.status));
      const labelInput = {
        id: firstVisit?.id,
        name: location.name,
        status,
        startDate: firstVisit?.date,
        endDate: lastVisit?.endDate,
      };
      const visitSuffix = location.visits.length > 1 ? `, visited ${location.visits.length} times` : '';

      return {
        label: `${buildLocationAriaLabel(labelInput)}${visitSuffix}`,
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
    const mergedLocations = mergeLocationVisits(travelData.locations);

    const closestLocation = findClosestLocationToCurrentDate(travelData.locations);

    type GroupItem = MergedLocationVisit;
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
        return a.key.localeCompare(b.key);
      });
    };

    const buildGroupKey = (items: GroupItem[]): string =>
      items
        .map(item => item.key)
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
          nextFocusOrder.push(group.items[0].key);
          return;
        }

        if (!expanded.has(group.key)) {
          nextFocusOrder.push(group.key);
          return;
        }

        group.items.forEach(location => {
          nextFocusOrder.push(location.key);
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
        const wikipediaRef = location.visits.find(visit => visit.wikipediaRef?.trim())?.wikipediaRef;
        const trimmedWikipediaRef = wikipediaRef?.trim();
        if (trimmedWikipediaRef) {
          wikipediaParams.set('wikipediaRef', trimmedWikipediaRef);
        }
        const wikipediaLocationName = location.name.trim() || location.name;
        const response = await fetch(`/api/wikipedia/${encodeURIComponent(wikipediaLocationName)}?${wikipediaParams.toString()}`);
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
        const isHighlighted = !!closestLocation && location.visits.some(visit => visit.id === closestLocation.id);
        const { label, labelKey } = getLocationLabelData(location);
        const markerOptions: L.MarkerOptions = { keyboard: false };
        const icon = getGroupItemMarkerIcon(location, isHighlighted, label, labelKey);
        if (icon) {
          markerOptions.icon = icon;
        }
        const child = L.marker(distributed, markerOptions).addTo(locationMarkersLayer);
        attachPopupAndEnrich(child, location);
        attachMarkerKeyHandlers(child, () => child.openPopup());
        registerMarkerElement(location.key, label, child);
        state.childMarkers.push(child);
      });

      const temporalInfos = state.group.items.flatMap(location => location.visits.map(visit => getLocationTemporalDistanceDays(visit)));
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
          badgeVariant: 'cluster',
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

      const groups = groupLocationsForSpiderfy(map, mergedLocations);
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
        ? groups.find(group => group.items.some(location => location.visits.some(visit => visit.id === closestLocation.id)))
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
          const isHighlighted = !!closestLocation && location.visits.some(visit => visit.id === closestLocation.id);
          const { label, labelKey } = getLocationLabelData(location);
          const markerOptions: L.MarkerOptions = { keyboard: false };
          const icon = getGroupItemMarkerIcon(location, isHighlighted, label, labelKey);
          if (icon) {
            markerOptions.icon = icon;
          }
          const marker = L.marker(location.coordinates, markerOptions).addTo(locationMarkersLayer);
          attachPopupAndEnrich(marker, location);
          attachMarkerKeyHandlers(marker, () => marker.openPopup());
          registerMarkerElement(location.key, label, marker);
          singles.push(marker);
          return;
        }

        const temporalInfos = group.items.flatMap(location => location.visits.map(visit => getLocationTemporalDistanceDays(visit)));
        const groupTone = getDominantMarkerTone(temporalInfos.map(info => info.status));
        const groupDistanceBucket = getMarkerDistanceBucket(
          Math.min(...temporalInfos.filter(info => info.status === groupTone).map(info => info.days))
        );
        const label = `Group of ${group.items.length} locations. Activate to expand.`;
        const groupMarker = L.marker(group.center, {
          icon: createCountMarkerIcon(L, group.items.length, groupTone, groupDistanceBucket, {
            label,
            badgeVariant: 'cluster',
          }),
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

    // Add routes grouped by transport type
    const usedTransportTypes = new Set<keyof typeof transportationConfig>();
    travelData.routes.forEach((route) => {
      const segments = getLeafMapRouteSegments(route);

      segments.forEach((segment) => {
        const routePoints = resolveMapRouteSegmentPoints(segment);
        // Normalize transport type to a valid key, fallback to 'other' if unknown
        const transportKey = (segment.transportType in transportationConfig
          ? segment.transportType
          : 'other') as keyof typeof transportationConfig;
        const routeStyle = getRouteStyle(transportKey);

        if (routePoints.length === 0) return;

        // Get or create layer group for this transport type
        let layerGroup = routeLayersByType.get(transportKey);
        if (!layerGroup) {
          layerGroup = L.layerGroup().addTo(map);
          routeLayersByType.set(transportKey, layerGroup);
        }
        usedTransportTypes.add(transportKey);

        const polyline = L.polyline(routePoints, {
          color: routeStyle.color,
          weight: routeStyle.weight,
          opacity: routeStyle.opacity,
          dashArray: routeStyle.dashArray
        }).addTo(layerGroup);

        if (debug) {
          polyline.on('click', (event) => {
            const pointSource = (segment.routePoints?.length || 0) > 0
              ? 'segment-routePoints'
              : 'endpoint-fallback';
            const debugPopup = generateRouteDebugPopupHTML({
              parentRouteId: route.id,
              parentRouteType: route.transportType,
              segmentId: segment.id,
              segmentType: segment.transportType,
              from: segment.from,
              to: segment.to,
              date: segment.date,
              pointsCount: routePoints.length,
              pointSource,
              firstPoint: routePoints[0],
              lastPoint: routePoints[routePoints.length - 1]
            });

            L.popup({ maxWidth: 440 })
              .setLatLng(event.latlng)
              .setContent(debugPopup)
              .openOn(map);
          });
        }
      });
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
    const orderedTransportTypes = [
      ...TRANSPORT_LEGEND_ORDER.filter(transportType => usedTransportTypes.has(transportType)),
      ...Array.from(usedTransportTypes).filter(transportType => !TRANSPORT_LEGEND_ORDER.includes(transportType)),
    ];

    orderedTransportTypes.forEach(transportType => {
      const layerGroup = routeLayersByType.get(transportType);
      if (layerGroup) {
        const config = transportationConfig[transportType];
        const legendLabel = generateRouteLegendLabel(
          config.description,
          {
            color: config.color,
            weight: config.weight,
            opacity: config.opacity,
            dashArray: config.dashArray,
          }
        );
        overlays[legendLabel] = layerGroup;
      }
    });

    // Add location markers layer
    overlays[generateLocationsLegendLabel()] = locationMarkersLayer;

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
    const layersControl = L.control.layers(undefined, overlays, {
      collapsed: true,
      position: 'topright'
    }).addTo(map);

    const layersToggle = layersControl
      .getContainer()
      ?.querySelector<HTMLAnchorElement>('.leaflet-control-layers-toggle');

    if (layersToggle) {
      layersToggle.setAttribute('title', 'Toggle map legend');
      layersToggle.setAttribute('aria-label', 'Toggle map legend');
    }

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

      // Add route coordinates (including intermediate sub-route endpoints)
      travelData.routes.forEach(route => {
        getLeafMapRouteSegments(route).forEach(segment => {
          allCoords.push(segment.fromCoords, segment.toCoords);
        });
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
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- This div is an interactive application widget with role="application" for custom keyboard map navigation */}
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
