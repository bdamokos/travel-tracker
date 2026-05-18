import { formatLocalDateInput, parseDateAsLocalDay } from '@/app/lib/localDateUtils';
import { filterTravelDataForServer } from '@/app/lib/serverPrivacyUtils';
import { SHADOW_LOCATION_PREFIX } from '@/app/lib/shadowConstants';
import { normalizeMapTravelData, toMapRouteSegment } from '@/app/lib/mapRouteTransform';
import { loadUnifiedTripData } from '@/app/lib/unifiedDataService';
import { loadShadowTrip } from '@/app/lib/shadowTripStorage';
import type { UnifiedTripData } from '@/app/lib/dataMigration';
import type { JourneyPeriod, Location, MapTravelData, ShadowTrip, Transportation } from '@/app/types';

type TravelDataResponse = {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  createdAt?: string;
  instagramUsername?: string;
  locations: Location[];
  routes: Transportation[];
  days?: JourneyPeriod[];
  accommodations: UnifiedTripData['accommodations'];
  publicUpdates: UnifiedTripData['publicUpdates'];
};

type Interval = { start: number; end: number };

const toMapDateString = (value?: string | Date): string | undefined => {
  if (!value) return undefined;
  return formatLocalDateInput(value) || undefined;
};

const safeDate = (value?: string | Date): Date | null => {
  return parseDateAsLocalDay(value);
};

const toStartOfDay = (date: Date): number => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized.getTime();
};

const toEndOfDay = (date: Date): number => {
  const normalized = new Date(date);
  normalized.setHours(23, 59, 59, 999);
  return normalized.getTime();
};

const locationInterval = (location: Location): Interval | null => {
  const startDate = safeDate(location.date);
  const endDate = safeDate(location.endDate || location.date);
  if (!startDate || !endDate) return null;
  return { start: toStartOfDay(startDate), end: toEndOfDay(endDate) };
};

const routeInterval = (route: Transportation): Interval | null => {
  const startDate = safeDate(route.departureTime);
  const endDate = safeDate(route.arrivalTime || route.departureTime);
  if (!startDate || !endDate) return null;
  return { start: toStartOfDay(startDate), end: toEndOfDay(endDate) };
};

const overlapsAny = (interval: Interval, intervals: Interval[]): boolean =>
  intervals.some(candidate => interval.start <= candidate.end && interval.end >= candidate.start);

export function filterNonOverlappingShadowPlans({
  realLocations,
  realRoutes,
  shadowLocations,
  shadowRoutes,
}: {
  realLocations: Location[];
  realRoutes: Transportation[];
  shadowLocations: Location[];
  shadowRoutes: Transportation[];
}): {
  filteredShadowLocations: Location[];
  filteredShadowRoutes: Transportation[];
} {
  const realIntervals = [
    ...realLocations.map(locationInterval).filter((interval): interval is Interval => interval !== null),
    ...realRoutes.map(routeInterval).filter((interval): interval is Interval => interval !== null)
  ];

  return {
    filteredShadowLocations: shadowLocations.filter(location => {
      const interval = locationInterval(location);
      return !interval || !overlapsAny(interval, realIntervals);
    }),
    filteredShadowRoutes: shadowRoutes.filter(route => {
      const interval = routeInterval(route);
      return !interval || !overlapsAny(interval, realIntervals);
    })
  };
}

export function toTravelDataResponse(unifiedData: UnifiedTripData): TravelDataResponse {
  return {
    id: unifiedData.id,
    title: unifiedData.title,
    description: unifiedData.description,
    startDate: unifiedData.startDate,
    endDate: unifiedData.endDate,
    createdAt: unifiedData.createdAt,
    instagramUsername: unifiedData.travelData?.instagramUsername,
    locations: unifiedData.travelData?.locations || [],
    routes: unifiedData.travelData?.routes || [],
    days: unifiedData.travelData?.days,
    accommodations: unifiedData.accommodations || [],
    publicUpdates: unifiedData.publicUpdates || []
  };
}

export function buildPublicMapTravelData(unifiedData: UnifiedTripData): MapTravelData {
  const publicTravelData = filterTravelDataForServer(toTravelDataResponse(unifiedData), null) as TravelDataResponse;
  return normalizeMapTravelData(publicTravelData);
}

export function buildAdminMapTravelData(
  unifiedData: UnifiedTripData,
  shadowTrip: ShadowTrip | null
): MapTravelData {
  const realLocations: Location[] = unifiedData.travelData?.locations || [];
  const realRoutes: Transportation[] = unifiedData.travelData?.routes || [];
  const shadowLocations: Location[] = shadowTrip?.shadowLocations || [];
  const shadowRoutes: Transportation[] = shadowTrip?.shadowRoutes || [];

  const { filteredShadowLocations, filteredShadowRoutes } = filterNonOverlappingShadowPlans({
    realLocations,
    realRoutes,
    shadowLocations,
    shadowRoutes,
  });

  const transformedData: MapTravelData = {
    id: unifiedData.id,
    title: unifiedData.title,
    description: unifiedData.description,
    startDate: unifiedData.startDate,
    endDate: unifiedData.endDate,
    createdAt: unifiedData.createdAt,
    publicUpdates: unifiedData.publicUpdates || [],
    locations: [
      ...realLocations.map(location => ({
        id: location.id,
        name: location.name,
        coordinates: location.coordinates,
        date: toMapDateString(location.date) ?? '',
        endDate: toMapDateString(location.endDate),
        notes: location.notes,
        wikipediaRef: location.wikipediaRef,
        instagramPosts: location.instagramPosts,
        tikTokPosts: location.tikTokPosts,
        blogPosts: location.blogPosts,
      })),
      ...filteredShadowLocations.map(location => ({
        id: location.id,
        name: `${SHADOW_LOCATION_PREFIX} ${location.name}`,
        coordinates: location.coordinates,
        date: toMapDateString(location.date) ?? '',
        endDate: toMapDateString(location.endDate),
        notes: location.notes,
        wikipediaRef: location.wikipediaRef,
        instagramPosts: location.instagramPosts,
        tikTokPosts: location.tikTokPosts,
        blogPosts: location.blogPosts,
      }))
    ],
    routes: [
      ...realRoutes.map(route => toMapRouteSegment(route)),
      ...filteredShadowRoutes.map(route => {
        const baseRoute = toMapRouteSegment(route);
        return {
          ...baseRoute,
          from: `${SHADOW_LOCATION_PREFIX} ${route.from}`,
          to: `${SHADOW_LOCATION_PREFIX} ${route.to}`,
          subRoutes: baseRoute.subRoutes?.map(segment => ({
            ...segment,
            from: `${SHADOW_LOCATION_PREFIX} ${segment.from}`,
            to: `${SHADOW_LOCATION_PREFIX} ${segment.to}`
          }))
        };
      })
    ]
  };

  return normalizeMapTravelData(transformedData);
}

export async function loadMapTravelDataForServer(
  tripId: string,
  isAdmin: boolean
): Promise<MapTravelData | null> {
  const unifiedData = await loadUnifiedTripData(tripId);
  if (!unifiedData) {
    return null;
  }

  if (!isAdmin) {
    return buildPublicMapTravelData(unifiedData);
  }

  const shadowTrip = await loadShadowTrip(tripId);
  return buildAdminMapTravelData(unifiedData, shadowTrip);
}
