import type { MapTravelLocation } from '@/app/types';

export type VisitLocation = MapTravelLocation;

export type MergedLocationVisit = {
  key: string;
  name: string;
  coordinates: [number, number];
  visits: VisitLocation[];
};

const normalizeGroupKeyName = (name: string): string =>
  name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s,.-]/g, '')
    .replace(/^(the|a|an)\s+/i, '')
    .toLowerCase();

const normalizeDisplayName = (name: string): string =>
  name
    .trim()
    .replace(/\s+/g, ' ');

const normalizeCoordinates = (coordinates: [number, number], precision: number): string => {
  const [lat, lng] = coordinates;
  return `${lat.toFixed(precision)},${lng.toFixed(precision)}`;
};

const getDateSortValue = (value: string): number => {
  const date = new Date(value);
  const timestamp = date.getTime();
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
};

const buildLocationVisitKey = (location: VisitLocation, coordinatePrecision: number): string =>
  `${normalizeGroupKeyName(location.name)}|${normalizeCoordinates(location.coordinates, coordinatePrecision)}`;

export const mergeLocationVisits = (
  locations: VisitLocation[],
  coordinatePrecision = 5
): MergedLocationVisit[] => {
  const grouped = new Map<string, VisitLocation[]>();

  locations.forEach(location => {
    const groupKey = buildLocationVisitKey(location, coordinatePrecision);
    const existing = grouped.get(groupKey);

    if (existing) {
      existing.push(location);
      return;
    }

    grouped.set(groupKey, [location]);
  });

  const merged = Array.from(grouped.entries()).map(([key, visits]) => {
    const sortedVisits = [...visits].sort((a, b) => getDateSortValue(a.date) - getDateSortValue(b.date));
    const representativeVisit = sortedVisits[0];

    return {
      key,
      name: normalizeDisplayName(representativeVisit?.name ?? ''),
      coordinates: representativeVisit?.coordinates ?? [0, 0],
      visits: sortedVisits,
    } satisfies MergedLocationVisit;
  });

  return merged.sort((a, b) => {
    const firstVisitA = a.visits[0];
    const firstVisitB = b.visits[0];
    return getDateSortValue(firstVisitA?.date ?? '') - getDateSortValue(firstVisitB?.date ?? '');
  });
};
