export type VisitLocation = {
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
};

export type MergedLocationVisit = {
  id: string;
  key: string;
  name: string;
  coordinates: [number, number];
  visits: VisitLocation[];
};

const normalizeLocationName = (name: string): string => name.trim().toLocaleLowerCase();

const normalizeCoordinates = (coordinates: [number, number], precision: number): string => {
  const [lat, lng] = coordinates;
  return `${lat.toFixed(precision)},${lng.toFixed(precision)}`;
};

const getDateSortValue = (value: string): number => {
  const date = new Date(value);
  const timestamp = date.getTime();
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
};

export const mergeLocationVisits = (
  locations: VisitLocation[],
  coordinatePrecision = 5
): MergedLocationVisit[] => {
  const grouped = new Map<string, MergedLocationVisit>();

  locations.forEach(location => {
    const groupKey = `${normalizeLocationName(location.name)}|${normalizeCoordinates(location.coordinates, coordinatePrecision)}`;
    const existing = grouped.get(groupKey);

    if (existing) {
      existing.visits.push(location);
      return;
    }

    grouped.set(groupKey, {
      id: groupKey,
      key: groupKey,
      name: location.name,
      coordinates: location.coordinates,
      visits: [location],
    });
  });

  const merged = Array.from(grouped.values()).map(group => ({
    ...group,
    visits: [...group.visits].sort((a, b) => getDateSortValue(a.date) - getDateSortValue(b.date)),
  }));

  return merged.sort((a, b) => {
    const firstVisitA = a.visits[0];
    const firstVisitB = b.visits[0];
    return getDateSortValue(firstVisitA?.date ?? '') - getDateSortValue(firstVisitB?.date ?? '');
  });
};
