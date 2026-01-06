export type MarkerTone = 'past' | 'present' | 'future';

const MARKER_WIDTH = 25;
const MARKER_HEIGHT = 41;

const markerColorVariables: Record<MarkerTone, string> = {
  past: '--travel-marker-color-past',
  present: '--travel-marker-color-present',
  future: '--travel-marker-color-future',
};

const getMarkerSvgMarkup = (tone: MarkerTone) => `
  <svg
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
  </svg>
`;

const markerShadows: Record<MarkerTone, string> = {
  future: 'drop-shadow(0 6px 12px rgba(242, 140, 82, 0.3))',
  present: 'drop-shadow(0 4px 8px rgba(47, 183, 164, 0.22))',
  past: 'drop-shadow(0 3px 6px rgba(74, 111, 165, 0.28))',
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const lerp = (min: number, max: number, t: number) => min + (max - min) * t;

export const quantizeTemporalDistanceDays = (distanceDays: number) => {
  const days = Math.max(0, Math.round(distanceDays));
  if (days <= 14) return days;
  if (days <= 90) return Math.round(days / 7) * 7;
  if (days <= 365) return Math.round(days / 30) * 30;
  return Math.round(days / 90) * 90;
};

const getTemporalProximity = (distanceDays: number) => {
  const scaleDays = 60;
  const proximity = 1 / (1 + Math.max(0, distanceDays) / scaleDays);
  return clamp(proximity, 0, 1);
};

const getMarkerFilter = (tone: MarkerTone, distanceDays: number) => {
  const proximity = getTemporalProximity(distanceDays);
  const shadow = markerShadows[tone];

  if (tone === 'present') {
    return `${shadow} saturate(1)`;
  }

  if (tone === 'future') {
    const saturation = lerp(0.55, 1.0, proximity);
    return `${shadow} saturate(${saturation.toFixed(2)})`;
  }

  const saturation = lerp(0.45, 1.0, proximity);
  return `${shadow} saturate(${saturation.toFixed(2)})`;
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
  distanceDays = 0
) =>
  leaflet.divIcon({
    className: `custom-${tone}-marker`,
    html: `
      <div style="
        width: ${MARKER_WIDTH}px;
        height: ${MARKER_HEIGHT}px;
        line-height: 0;
        filter: ${getMarkerFilter(tone, distanceDays)};
      ">${getMarkerSvgMarkup(tone)}</div>
    `,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  });

export const createHighlightedMarkerIcon = (
  leaflet: typeof import('leaflet'),
  tone: MarkerTone,
  distanceDays = 0
) =>
  leaflet.divIcon({
    className: `custom-highlighted-marker custom-highlighted-marker-${tone}`,
    html: `
      <div style="
        width: ${MARKER_WIDTH}px;
        height: ${MARKER_HEIGHT}px;
        line-height: 0;
        filter: ${getMarkerFilter(tone, distanceDays)} saturate(1.25) brightness(1.08);
      ">${getMarkerSvgMarkup(tone)}</div>
    `,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  });

export const createCountMarkerIcon = (
  leaflet: typeof import('leaflet'),
  count: number,
  tone: MarkerTone,
  distanceDays = 0
) => {
  const width = 25;
  const height = 41;
  const badgeSize = 16;

  return leaflet.divIcon({
    className: `group-count-marker group-count-marker-${tone}`,
    html: `
      <div style="position: relative; width: ${width}px; height: ${height}px;">
        <div style="
          width: ${MARKER_WIDTH}px;
          height: ${MARKER_HEIGHT}px;
          line-height: 0;
          filter: ${getMarkerFilter(tone, distanceDays)};
        ">${getMarkerSvgMarkup(tone)}</div>
        <div aria-label="${count} visits" style="
          position: absolute; right: -6px; top: -6px; width: ${badgeSize}px; height: ${badgeSize}px;
          background: #ef4444; color: white; border-radius: 9999px; display: flex; align-items: center; justify-content: center;
          font-size: 10px; font-weight: 700; border: 2px solid white;
        ">${count}</div>
      </div>
    `,
    iconSize: [width, height],
    iconAnchor: [Math.round(width / 2), height],
    popupAnchor: [0, -height],
  });
};
