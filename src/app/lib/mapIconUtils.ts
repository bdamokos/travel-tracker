import type { LeafletEvent, Marker } from 'leaflet';

import { formatDateRange } from '@/app/lib/dateUtils';

export type MarkerTone = 'past' | 'present' | 'future';

const MARKER_WIDTH = 25;
const MARKER_HEIGHT = 41;
const MAX_DISTANCE_BUCKET = 9;

const markerColorVariables: Record<MarkerTone, string> = {
  past: '--travel-marker-color-past',
  present: '--travel-marker-color-present',
  future: '--travel-marker-color-future',
};

const getTemporalSymbol = (tone: MarkerTone): string => {
  const symbolColor = `var(${markerColorVariables[tone]})`;

  switch (tone) {
    case 'past':
      // Clock symbol (history)
      return `
        <g class="temporal-symbol temporal-symbol-past" aria-hidden="true">
          <circle cx="12.5" cy="12.5" r="3" fill="none" stroke="${symbolColor}" stroke-width="0.8"/>
          <path d="M12.5 10.5 V12.5 H14" fill="none" stroke="${symbolColor}" stroke-width="0.8" stroke-linecap="round"/>
        </g>`;
    case 'present':
      // Solid dot (current location)
      return `
        <g class="temporal-symbol temporal-symbol-present" aria-hidden="true">
          <circle cx="12.5" cy="12.5" r="3" fill="${symbolColor}"/>
        </g>`;
    case 'future':
      // Forward chevron (upcoming)
      return `
        <g class="temporal-symbol temporal-symbol-future" aria-hidden="true">
          <path d="M11 10 L14 12.5 L11 15" fill="none" stroke="${symbolColor}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
        </g>`;
  }
};

type MarkerAccessibility = {
  label: string;
  role?: string;
  tabIndex?: number;
  className?: string;
  dataKey?: string;
};

export const escapeAttribute = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

export const formatCoordLabel = (coords: [number, number]) =>
  `${coords[0].toFixed(4)}, ${coords[1].toFixed(4)}`;

type LocationLabelInput = {
  id?: string;
  name: string;
  status: MarkerTone;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
};

const formatDateKey = (value?: string | Date | null) => {
  if (!value) return 'unknown';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toISOString();
};

export const buildLocationAriaLabel = ({ name, status, startDate, endDate }: LocationLabelInput) => {
  const statusLabel = status === 'present' ? 'current' : status;
  const dateLabel = startDate ? formatDateRange(startDate, endDate ?? undefined) : '';
  return `${name}, ${statusLabel} location${dateLabel ? `, ${dateLabel}` : ''}`;
};

export const buildLocationLabelKey = ({ id, name, status, startDate, endDate }: LocationLabelInput) => {
  const base = id ?? name;
  return `${base}:${status}:${formatDateKey(startDate)}:${formatDateKey(endDate)}`;
};

const createKeyboardActivationHandler = (onActivate: () => void) => (event: KeyboardEvent) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    onActivate();
  }
};

type MarkerKeyHandlers = {
  add: (event: LeafletEvent) => void;
  remove: (event: LeafletEvent) => void;
  update: (next: () => void) => void;
};

export const createMarkerKeyHandlers = (onActivate: () => void): MarkerKeyHandlers => {
  const activationRef = { current: onActivate };
  const keydownHandler = createKeyboardActivationHandler(() => activationRef.current());

  return {
    update: (next: () => void) => {
      activationRef.current = next;
    },
    add: (event: LeafletEvent) => {
      const wrapper = (event.target as Marker).getElement?.();
      if (!wrapper) return;
      // Find the inner focusable element (.travel-marker-interactive has tabindex)
      const element = wrapper.querySelector<HTMLElement>('.travel-marker-interactive') ?? wrapper;
      element.addEventListener('keydown', keydownHandler);
    },
    remove: (event: LeafletEvent) => {
      const wrapper = (event.target as Marker).getElement?.();
      if (!wrapper) return;
      // Find the inner focusable element (.travel-marker-interactive has tabindex)
      const element = wrapper.querySelector<HTMLElement>('.travel-marker-interactive') ?? wrapper;
      element.removeEventListener('keydown', keydownHandler);
    },
  };
};

export const attachMarkerKeyHandlers = (marker: Marker, onActivate: () => void) => {
  const keydownHandler = createKeyboardActivationHandler(onActivate);

  const addHandler = () => {
    const wrapper = marker.getElement();
    if (!wrapper) return;
    // Find the inner focusable element (.travel-marker-interactive has tabindex)
    const element = wrapper.querySelector<HTMLElement>('.travel-marker-interactive') ?? wrapper;
    element.addEventListener('keydown', keydownHandler);
  };

  const removeHandler = () => {
    const wrapper = marker.getElement();
    if (!wrapper) return;
    // Find the inner focusable element (.travel-marker-interactive has tabindex)
    const element = wrapper.querySelector<HTMLElement>('.travel-marker-interactive') ?? wrapper;
    element.removeEventListener('keydown', keydownHandler);
  };

  marker.on('add', addHandler);
  marker.on('remove', removeHandler);
  addHandler();
};

const wrapMarkerHtml = (content: string, accessibility?: MarkerAccessibility) => {
  if (!accessibility) return content;
  const role = accessibility.role ?? 'button';
  const tabIndex = accessibility.tabIndex ?? 0;
  const className = accessibility.className ? ` ${accessibility.className}` : '';
  const dataKey = accessibility.dataKey ? ` data-travel-marker-key="${escapeAttribute(accessibility.dataKey)}"` : '';

  if (role === 'button') {
    return `
      <button type="button" class="travel-marker-interactive${className}" tabindex="${tabIndex}"${dataKey} aria-label="${escapeAttribute(
        accessibility.label
      )}">
        ${content}
      </button>
    `;
  }

  return `
    <div class="travel-marker-interactive${className}" role="${role}" tabindex="${tabIndex}"${dataKey} aria-label="${escapeAttribute(
      accessibility.label
    )}">
      ${content}
    </div>
  `;
};

const getMarkerSvgMarkup = (tone: MarkerTone) => `
  <svg
    class="travel-marker-icon"
    xmlns="http://www.w3.org/2000/svg"
    width="${MARKER_WIDTH}"
    height="${MARKER_HEIGHT}"
    viewBox="0 0 25 41"
    style="display:block"
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M12.5 0C5.6 0 0 5.6 0 12.5C0 22 12.5 41 12.5 41C12.5 41 25 22 25 12.5C25 5.6 19.4 0 12.5 0Z"
      style="
        fill: var(${markerColorVariables[tone]});
        stroke: rgba(255, 255, 255, 0.95);
        stroke-width: 2;
      "
    />
    <circle
      cx="12.5"
      cy="12.5"
      r="5"
      style="fill: rgba(255, 255, 255, 0.9);"
    />
    ${getTemporalSymbol(tone)}
  </svg>
`;

const markerShadows: Record<MarkerTone, string> = {
  future: 'drop-shadow(0 6px 12px rgba(242, 140, 82, 0.3))',
  present: 'drop-shadow(0 4px 8px rgba(47, 183, 164, 0.22))',
  past: 'drop-shadow(0 3px 6px rgba(74, 111, 165, 0.28))',
};

const normalizeDistanceBucket = (bucket: number) => {
  const rounded = Math.round(bucket);
  if (!Number.isFinite(rounded)) return 0;
  return Math.min(MAX_DISTANCE_BUCKET, Math.max(0, rounded));
};

export const getMarkerDistanceBucket = (distanceDays: number) => {
  const days = Math.max(0, Math.round(distanceDays));

  if (days === 0) return 9;
  if (days <= 2) return 8;
  if (days <= 7) return 7;
  if (days <= 14) return 6;
  if (days <= 30) return 5;
  if (days <= 60) return 4;
  if (days <= 90) return 3;
  if (days <= 180) return 2;
  if (days <= 365) return 1;
  return 0;
};

export const getDominantMarkerTone = (tones: MarkerTone[]): MarkerTone => {
  if (tones.length === 0) return 'present';

  let hasPresent = false;
  let hasFuture = false;
  let hasPast = false;

  tones.forEach(tone => {
    if (tone === 'present') hasPresent = true;
    else if (tone === 'future') hasFuture = true;
    else hasPast = true;
  });

  if (hasPresent) return 'present';
  if (hasFuture) return 'future';
  return hasPast ? 'past' : 'present';
};

export const createMarkerIcon = (
  leaflet: typeof import('leaflet'),
  tone: MarkerTone,
  distanceBucket = MAX_DISTANCE_BUCKET,
  accessibility?: MarkerAccessibility
) => {
  const normalizedBucket = normalizeDistanceBucket(distanceBucket);
  const markerHtml = `
    <div class="travel-marker-visual" style="
      --travel-marker-saturation: var(--travel-marker-saturation-step-${normalizedBucket}, 1);
      width: ${MARKER_WIDTH}px;
      height: ${MARKER_HEIGHT}px;
      line-height: 0;
      position: relative;
      filter: ${markerShadows[tone]} saturate(var(--travel-marker-saturation, 1));
    " data-travel-marker-tone="${tone}" data-travel-marker-bucket="${normalizedBucket}">${getMarkerSvgMarkup(tone)}</div>
  `;

  return leaflet.divIcon({
    className: `custom-${tone}-marker`,
    html: wrapMarkerHtml(markerHtml, accessibility),
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  });
};

export const createHighlightedMarkerIcon = (
  leaflet: typeof import('leaflet'),
  tone: MarkerTone,
  distanceBucket = MAX_DISTANCE_BUCKET,
  accessibility?: MarkerAccessibility
) => {
  const normalizedBucket = normalizeDistanceBucket(distanceBucket);
  const markerHtml = `
    <div class="travel-marker-visual" style="
      --travel-marker-saturation: var(--travel-marker-saturation-step-${normalizedBucket}, 1);
      width: ${MARKER_WIDTH}px;
      height: ${MARKER_HEIGHT}px;
      line-height: 0;
      position: relative;
      filter: ${markerShadows[tone]} saturate(var(--travel-marker-saturation, 1))
        saturate(var(--travel-marker-highlight-saturation, 1.25))
        brightness(var(--travel-marker-highlight-brightness, 1.08));
    " data-travel-marker-tone="${tone}" data-travel-marker-bucket="${normalizedBucket}">${getMarkerSvgMarkup(tone)}</div>
  `;

  return leaflet.divIcon({
    className: `custom-highlighted-marker custom-highlighted-marker-${tone}`,
    html: wrapMarkerHtml(markerHtml, accessibility),
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  });
};

export const createCountMarkerIcon = (
  leaflet: typeof import('leaflet'),
  count: number,
  tone: MarkerTone,
  distanceBucket = MAX_DISTANCE_BUCKET,
  accessibility?: MarkerAccessibility
) => {
  const width = 25;
  const height = 41;
  const badgeSize = 16;
  const normalizedBucket = normalizeDistanceBucket(distanceBucket);
  const markerHtml = `
    <div class="travel-marker-group" style="position: relative; width: ${width}px; height: ${height}px;">
      <div class="travel-marker-visual" style="
        --travel-marker-saturation: var(--travel-marker-saturation-step-${normalizedBucket}, 1);
        width: ${MARKER_WIDTH}px;
        height: ${MARKER_HEIGHT}px;
        line-height: 0;
        position: relative;
        filter: ${markerShadows[tone]} saturate(var(--travel-marker-saturation, 1));
      " data-travel-marker-tone="${tone}" data-travel-marker-bucket="${normalizedBucket}">${getMarkerSvgMarkup(tone)}</div>
      <div aria-hidden="true" style="
        position: absolute; right: -6px; top: -6px; width: ${badgeSize}px; height: ${badgeSize}px;
        background: #ef4444; color: white; border-radius: 9999px; display: flex; align-items: center; justify-content: center;
        font-size: 10px; font-weight: 700; border: 2px solid white;
      ">${count}</div>
    </div>
  `;

  return leaflet.divIcon({
    className: `group-count-marker group-count-marker-${tone}`,
    html: wrapMarkerHtml(markerHtml, accessibility),
    iconSize: [width, height],
    iconAnchor: [Math.round(width / 2), height],
    popupAnchor: [0, -height],
  });
};
