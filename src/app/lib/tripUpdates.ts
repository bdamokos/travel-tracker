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
  if (!startKey && !endKey) return null;
  return `${startKey ?? ''}|${endKey ?? ''}`;
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
      if (!previousLocationMap.has(location.id)) {
        updates.push({
          id: createUpdateId(),
          createdAt,
          message: `New trip location added: ${formatLocationReference(location)}.`
        });
      }
    }

    for (const previousLocation of previousLocations) {
      if (!nextLocationMap.has(previousLocation.id)) {
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
      if (previousRangeKey && nextRangeKey && previousRangeKey !== nextRangeKey) {
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

      const previousInstagramKeys = new Set(
        (previousLocation.instagramPosts || [])
          .map(getPostKey)
          .filter((value): value is string => Boolean(value))
      );
      const newInstagramPosts = (location.instagramPosts || []).filter(post => {
        const key = getPostKey(post);
        return key ? !previousInstagramKeys.has(key) : false;
      });

      if (newInstagramPosts.length > 0) {
        addPostUpdate(updates, location, 'Instagram', newInstagramPosts.length, createdAt);
      }

      const previousTikTokKeys = new Set(
        (previousLocation.tikTokPosts || [])
          .map(getPostKey)
          .filter((value): value is string => Boolean(value))
      );
      const newTikTokPosts = (location.tikTokPosts || []).filter(post => {
        const key = getPostKey(post);
        return key ? !previousTikTokKeys.has(key) : false;
      });

      if (newTikTokPosts.length > 0) {
        addPostUpdate(updates, location, 'TikTok', newTikTokPosts.length, createdAt);
      }

      const previousBlogKeys = new Set(
        (previousLocation.blogPosts || [])
          .map(getPostKey)
          .filter((value): value is string => Boolean(value))
      );
      const newBlogPosts = (location.blogPosts || []).filter(post => {
        const key = getPostKey(post);
        return key ? !previousBlogKeys.has(key) : false;
      });

      if (newBlogPosts.length > 0) {
        addPostUpdate(updates, location, 'blog', newBlogPosts.length, createdAt);
      }
    }
  }

  if (Array.isArray(incoming.routes)) {
    const previousRoutes = previous.travelData?.routes || [];
    const previousRouteMap = new Map(previousRoutes.map(route => [route.id, route]));

    for (const route of incoming.routes) {
      if (previousRouteMap.has(route.id)) continue;
      if (!route.from || !route.to) continue;
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
