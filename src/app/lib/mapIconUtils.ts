export type MarkerTone = 'past' | 'present' | 'future';

const MARKER_BASE_STYLE = `
  width: 25px;
  height: 41px;
  background-image: url('/images/marker-icon.png');
  background-size: contain;
  background-repeat: no-repeat;
  border-radius: 8px;
`;

const markerShadows: Record<MarkerTone, string> = {
  future: 'drop-shadow(0 6px 12px rgba(59, 130, 246, 0.3))',
  present: 'drop-shadow(0 4px 8px rgba(59, 130, 246, 0.22))',
  past: 'drop-shadow(0 3px 6px rgba(55, 65, 81, 0.28))',
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
    return `${shadow} saturate(1.05) brightness(1.02)`;
  }

  if (tone === 'future') {
    const saturation = lerp(0.65, 1.25, proximity);
    const brightness = lerp(0.98, 1.1, proximity);
    return `${shadow} saturate(${saturation.toFixed(2)}) brightness(${brightness.toFixed(2)})`;
  }

  const grayscale = lerp(0.6, 0.15, proximity);
  const saturation = lerp(0.25, 0.95, proximity);
  const brightness = lerp(0.86, 1.0, proximity);
  return `${shadow} grayscale(${grayscale.toFixed(2)}) saturate(${saturation.toFixed(2)}) brightness(${brightness.toFixed(2)})`;
};

export const getDominantMarkerTone = (tones: MarkerTone[]): MarkerTone => {
  if (tones.length === 0) return 'present';

  const counts: Record<MarkerTone, number> = { past: 0, present: 0, future: 0 };
  tones.forEach(tone => {
    counts[tone] += 1;
  });

  let dominant: MarkerTone = 'present';
  let bestCount = -1;
  (['present', 'future', 'past'] as const).forEach(tone => {
    const count = counts[tone];
    if (count > bestCount) {
      bestCount = count;
      dominant = tone;
    }
  });

  return dominant;
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
        ${MARKER_BASE_STYLE}
        filter: ${getMarkerFilter(tone, distanceDays)};
      "></div>
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
          ${MARKER_BASE_STYLE}
          filter: ${getMarkerFilter(tone, distanceDays)};
        "></div>
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
