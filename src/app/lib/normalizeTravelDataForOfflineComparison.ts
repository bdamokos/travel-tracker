import type { Accommodation, Location, TravelData, TravelRoute, TravelRouteSegment } from '@/app/types';
import { formatLocalDateInput } from '@/app/lib/localDateUtils';

const normalizeLocalDayValue = (
  value: Date | string | undefined | null
): string | undefined => {
  const normalized = formatLocalDateInput(value);
  if (normalized) {
    return normalized;
  }

  return undefined;
};

type ComparableLocation = Partial<Omit<Location, 'date' | 'endDate'>> & {
  date?: string;
  endDate?: string;
};

type ComparableRouteSegment = Partial<Omit<TravelRouteSegment, 'date'>> & {
  date?: string;
};

type ComparableRoute = Partial<Omit<TravelRoute, 'date' | 'subRoutes'>> & {
  date?: string;
  subRoutes: ComparableRouteSegment[];
};

type ComparableAccommodation = Partial<Accommodation>;

export type NormalizedTravelDataForOfflineComparison = Partial<
  Omit<TravelData, 'startDate' | 'endDate' | 'locations' | 'routes' | 'accommodations' | 'instagramUsername'>
> & {
  startDate?: string;
  endDate?: string;
  instagramUsername: string;
  locations: ComparableLocation[];
  routes: ComparableRoute[];
  accommodations: ComparableAccommodation[];
};

const normalizeLocation = (location: Partial<Location>): ComparableLocation => {
  return {
    id: location.id,
    name: location.name,
    coordinates: location.coordinates,
    arrivalTime: location.arrivalTime,
    departureTime: location.departureTime,
    date: normalizeLocalDayValue(location.date),
    endDate: normalizeLocalDayValue(location.endDate),
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

const normalizeRouteSegment = (segment: Partial<TravelRouteSegment>): ComparableRouteSegment => {
  return {
    id: segment.id,
    from: segment.from,
    to: segment.to,
    fromCoords: segment.fromCoords,
    toCoords: segment.toCoords,
    transportType: segment.transportType,
    date: normalizeLocalDayValue(segment.date),
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

const normalizeRoute = (route: Partial<TravelRoute>): ComparableRoute => {
  return {
    id: route.id,
    from: route.from,
    to: route.to,
    fromCoords: route.fromCoords,
    toCoords: route.toCoords,
    transportType: route.transportType,
    date: normalizeLocalDayValue(route.date),
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
    subRoutes: Array.isArray(route.subRoutes) ? route.subRoutes.map(normalizeRouteSegment) : [],
  };
};

const normalizeAccommodation = (accommodation: Partial<Accommodation>): ComparableAccommodation => {
  return {
    id: accommodation.id,
    name: accommodation.name,
    locationId: accommodation.locationId,
    accommodationData: accommodation.accommodationData,
    isAccommodationPublic: accommodation.isAccommodationPublic ?? false,
    costTrackingLinks: Array.isArray(accommodation.costTrackingLinks) ? accommodation.costTrackingLinks : [],
    createdAt: accommodation.createdAt,
    updatedAt: accommodation.updatedAt,
    isReadOnly: accommodation.isReadOnly,
  };
};

export const normalizeTravelDataForOfflineComparison = (
  data: Partial<TravelData>
): NormalizedTravelDataForOfflineComparison => {
  return {
    id: data.id,
    title: data.title,
    description: data.description,
    startDate: normalizeLocalDayValue(data.startDate),
    endDate: normalizeLocalDayValue(data.endDate),
    instagramUsername: data.instagramUsername ?? '',
    locations: Array.isArray(data.locations) ? data.locations.map(normalizeLocation) : [],
    routes: Array.isArray(data.routes) ? data.routes.map(normalizeRoute) : [],
    accommodations: Array.isArray(data.accommodations) ? data.accommodations.map(normalizeAccommodation) : [],
  };
};
