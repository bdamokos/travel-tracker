import type { Location, TravelData, TravelRoute, TravelRouteSegment } from '@/app/types';
import { formatLocalDateInput } from '@/app/lib/localDateUtils';

const normalizeLocalDayValue = (
  value: Date | string | undefined | null
): Date | string | undefined => {
  const normalized = formatLocalDateInput(value);
  if (normalized) {
    return normalized;
  }

  if (value === null) {
    return undefined;
  }

  return value ?? undefined;
};

const normalizeLocation = (location: Partial<Location>): Partial<Location> => {
  return {
    id: location.id,
    name: location.name,
    coordinates: location.coordinates,
    arrivalTime: location.arrivalTime,
    departureTime: location.departureTime,
    date: normalizeLocalDayValue(location.date) as Location['date'],
    endDate: normalizeLocalDayValue(location.endDate) as Location['endDate'],
    duration: location.duration,
    notes: location.notes ?? '',
    instagramPosts: Array.isArray(location.instagramPosts) ? location.instagramPosts : [],
    tikTokPosts: Array.isArray(location.tikTokPosts) ? location.tikTokPosts : [],
    blogPosts: Array.isArray(location.blogPosts) ? location.blogPosts : [],
    accommodationData: location.accommodationData,
    isAccommodationPublic: location.isAccommodationPublic ?? false,
    accommodationIds: Array.isArray(location.accommodationIds) ? location.accommodationIds : [],
    costTrackingLinks: Array.isArray(location.costTrackingLinks) ? location.costTrackingLinks : [],
    wikipediaRef: location.wikipediaRef,
    isReadOnly: location.isReadOnly,
  };
};

const normalizeRouteSegment = (segment: Partial<TravelRouteSegment>): Partial<TravelRouteSegment> => {
  return {
    id: segment.id,
    from: segment.from,
    to: segment.to,
    fromCoords: segment.fromCoords,
    toCoords: segment.toCoords,
    transportType: segment.transportType,
    date: normalizeLocalDayValue(segment.date) as TravelRouteSegment['date'],
    duration: segment.duration,
    distanceOverride: segment.distanceOverride,
    notes: segment.notes ?? '',
    privateNotes: segment.privateNotes,
    costTrackingLinks: Array.isArray(segment.costTrackingLinks) ? segment.costTrackingLinks : [],
    routePoints: segment.routePoints,
    useManualRoutePoints: segment.useManualRoutePoints,
    isReturn: segment.isReturn,
    doubleDistance: segment.doubleDistance,
    isReadOnly: segment.isReadOnly,
  };
};

const normalizeRoute = (route: Partial<TravelRoute>): Partial<TravelRoute> => {
  return {
    id: route.id,
    from: route.from,
    to: route.to,
    fromCoords: route.fromCoords,
    toCoords: route.toCoords,
    transportType: route.transportType,
    date: normalizeLocalDayValue(route.date) as TravelRoute['date'],
    duration: route.duration,
    distanceOverride: route.distanceOverride,
    notes: route.notes ?? '',
    privateNotes: route.privateNotes,
    costTrackingLinks: Array.isArray(route.costTrackingLinks) ? route.costTrackingLinks : [],
    routePoints: route.routePoints,
    useManualRoutePoints: route.useManualRoutePoints,
    isReturn: route.isReturn,
    doubleDistance: route.doubleDistance,
    isReadOnly: route.isReadOnly,
    subRoutes: (Array.isArray(route.subRoutes) ? route.subRoutes.map(normalizeRouteSegment) : []) as TravelRoute['subRoutes'],
  };
};

export const normalizeTravelDataForOfflineComparison = (
  data: Partial<TravelData>
): Partial<TravelData> => {
  return {
    id: data.id,
    title: data.title,
    description: data.description,
    startDate: normalizeLocalDayValue(data.startDate) as TravelData['startDate'],
    endDate: normalizeLocalDayValue(data.endDate) as TravelData['endDate'],
    instagramUsername: data.instagramUsername ?? '',
    locations: (Array.isArray(data.locations) ? data.locations.map(normalizeLocation) : []) as TravelData['locations'],
    routes: (Array.isArray(data.routes) ? data.routes.map(normalizeRoute) : []) as TravelData['routes'],
    accommodations: (Array.isArray(data.accommodations) ? data.accommodations : []) as TravelData['accommodations'],
  };
};
