import { formatDateRange, normalizeUtcDateToLocalDay } from './dateUtils';
import { Location, Transportation, TripUpdate } from '../types';
import { UnifiedTripData } from './dataMigration';

type RouteLike = Transportation & { transportType?: string };

const UPDATE_ID_PREFIX = 'update';

const createUpdateId = () =>
  `${UPDATE_ID_PREFIX}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const toDayKey = (value: string | Date | undefined | null): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const normalized = normalizeUtcDateToLocalDay(date);
  if (!normalized) return null;
  return normalized.toISOString().slice(0, 10);
};

const getLocationRangeKey = (location: Location): string | null => {
  const startKey = toDayKey(location.date);
  const endKey = toDayKey(location.endDate ?? location.date);
  if (!startKey || !endKey) return null;
  return `${startKey}|${endKey}`;
};

const formatLocationRange = (location: Location): string => formatDateRange(location.date, location.endDate);

const getPostKey = (post: { id?: string; url?: string }): string | null => post.id || post.url || null;

const formatVisitReference = (location: Location): string => {
  const range = formatLocationRange(location);
  if (!range) {
    return `${location.name} visit`;
  }
  return `${location.name} visit of ${range}`;
};

const formatLocationReference = (location: Location): string => {
  const range = formatLocationRange(location);
  if (!range) {
    return location.name;
  }
  return `${location.name} on ${range}`;
};

const resolveRouteTransport = (route: RouteLike): string => {
  const transport = route.transportType || route.type;
  if (!transport) return 'travel';
  return transport.toLowerCase();
};

const isPublicLocation = (location: Location): boolean => !location.notes?.includes('[PRIVATE]');

const isPublicRoute = (route: Transportation): boolean => !route.privateNotes;

const addPostUpdate = (
  updates: TripUpdate[],
  location: Location,
  label: string,
  count: number,
  createdAt: string
) => {
  const noun = count === 1 ? 'post' : 'posts';
  updates.push({
    id: createUpdateId(),
    createdAt,
    message: `New ${label} ${noun} added to the ${formatVisitReference(location)}.`
  });
};

export function buildTripUpdates(
  previous: UnifiedTripData,
  incoming: { locations?: Location[]; routes?: Transportation[] }
): TripUpdate[] {
  const updates: TripUpdate[] = [];
  const createdAt = new Date().toISOString();

  if (Array.isArray(incoming.locations)) {
    const previousLocations = previous.travelData?.locations || [];
    const previousLocationMap = new Map(previousLocations.map(location => [location.id, location]));
    const nextLocationMap = new Map(incoming.locations.map(location => [location.id, location]));

    for (const location of incoming.locations) {
      if (!previousLocationMap.has(location.id) && isPublicLocation(location)) {
        updates.push({
          id: createUpdateId(),
          createdAt,
          message: `New trip location added: ${formatLocationReference(location)}.`
        });
      }
    }

    for (const previousLocation of previousLocations) {
      if (!nextLocationMap.has(previousLocation.id) && isPublicLocation(previousLocation)) {
        const range = formatLocationRange(previousLocation);
        updates.push({
          id: createUpdateId(),
          createdAt,
          message: range
            ? `Visit to ${previousLocation.name} on ${range} cancelled.`
            : `Visit to ${previousLocation.name} cancelled.`
        });
      }
    }

    for (const location of incoming.locations) {
      const previousLocation = previousLocationMap.get(location.id);
      if (!previousLocation) continue;

      const previousRangeKey = getLocationRangeKey(previousLocation);
      const nextRangeKey = getLocationRangeKey(location);
      if (
        previousRangeKey &&
        nextRangeKey &&
        previousRangeKey !== nextRangeKey &&
        isPublicLocation(location) &&
        isPublicLocation(previousLocation)
      ) {
        const previousRange = formatLocationRange(previousLocation);
        const nextRange = formatLocationRange(location);
        if (previousRange && nextRange) {
          updates.push({
            id: createUpdateId(),
            createdAt,
            message: `Visit to ${location.name} on ${previousRange} rescheduled to ${nextRange}.`
          });
        }
      }

      if (isPublicLocation(location)) {
        const postConfigurations = [
          { key: 'instagramPosts' as const, label: 'Instagram' as const },
          { key: 'tikTokPosts' as const, label: 'TikTok' as const },
          { key: 'blogPosts' as const, label: 'blog' as const },
        ];

        for (const config of postConfigurations) {
          const previousPosts = previousLocation[config.key];
          const currentPosts = location[config.key];

          const previousPostKeys = new Set(
            (previousPosts || [])
              .map(getPostKey)
              .filter((value): value is string => Boolean(value))
          );

          const newPosts = (currentPosts || []).filter(post => {
            const key = getPostKey(post);
            return key ? !previousPostKeys.has(key) : false;
          });

          if (newPosts.length > 0) {
            addPostUpdate(updates, location, config.label, newPosts.length, createdAt);
          }
        }
      }
    }
  }

  if (Array.isArray(incoming.routes)) {
    const previousRoutes = previous.travelData?.routes || [];
    const previousRouteMap = new Map(previousRoutes.map(route => [route.id, route]));

    for (const route of incoming.routes) {
      if (previousRouteMap.has(route.id)) continue;
      if (!route.from || !route.to) continue;
      if (!isPublicRoute(route)) continue;
      const transport = resolveRouteTransport(route as RouteLike);
      updates.push({
        id: createUpdateId(),
        createdAt,
        message: `New ${transport} route added between ${route.from} and ${route.to}.`
      });
    }
  }

  return updates;
}
