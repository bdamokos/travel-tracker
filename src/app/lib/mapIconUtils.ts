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
