export type MarkerTone = 'past' | 'present' | 'future';

const MARKER_BASE_STYLE = `
  width: 25px;
  height: 41px;
  background-image: url('/images/marker-icon.png');
  background-size: contain;
  background-repeat: no-repeat;
  border-radius: 8px;
`;

const markerFilters: Record<MarkerTone, string> = {
  future: 'drop-shadow(0 6px 12px rgba(59, 130, 246, 0.3)) saturate(1.2) brightness(1.08)',
  present: 'drop-shadow(0 4px 8px rgba(59, 130, 246, 0.22)) saturate(1.05) brightness(1.02)',
  past: 'grayscale(0.35) saturate(0.45) brightness(0.9) drop-shadow(0 3px 6px rgba(55, 65, 81, 0.28))',
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

export const createMarkerIcon = (leaflet: typeof import('leaflet'), tone: MarkerTone) =>
  leaflet.divIcon({
    className: `custom-${tone}-marker`,
    html: `
      <div style="
        ${MARKER_BASE_STYLE}
        filter: ${markerFilters[tone]};
      "></div>
    `,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  });

export const createCountMarkerIcon = (
  leaflet: typeof import('leaflet'),
  count: number,
  tone: MarkerTone
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
          filter: ${markerFilters[tone]};
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
