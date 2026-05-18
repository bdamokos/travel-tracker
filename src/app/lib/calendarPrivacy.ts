import { Location, Transportation, Trip } from '@/app/types';

export function isPrivateCalendarLocation(location: Location): boolean {
  return Boolean(location.notes && /\[private\]/i.test(location.notes));
}

export function sanitizeCalendarLocationForPublic(location: Location): Location {
  return {
    ...location,
    arrivalTime: undefined,
    departureTime: undefined,
    notes: undefined,
    accommodationData: location.isAccommodationPublic ? location.accommodationData : undefined,
    isAccommodationPublic: undefined,
    accommodationIds: undefined,
    costTrackingLinks: undefined,
  };
}

export function sanitizeCalendarRouteForPublic(route: Transportation): Transportation {
  return {
    ...route,
    departureTime: undefined,
    arrivalTime: undefined,
    privateNotes: undefined,
    costTrackingLinks: undefined,
    subRoutes: route.subRoutes?.map(subRoute => ({
      ...subRoute,
      departureTime: undefined,
      arrivalTime: undefined,
      privateNotes: undefined,
      costTrackingLinks: undefined,
    })),
  };
}

export function buildPublicCalendarTrip(trip: Trip): Trip {
  return {
    ...trip,
    locations: trip.locations
      .filter(location => !isPrivateCalendarLocation(location))
      .map(sanitizeCalendarLocationForPublic),
    routes: trip.routes
      .filter(route => !route.privateNotes)
      .map(sanitizeCalendarRouteForPublic),
    accommodations: trip.accommodations
      .filter(accommodation => accommodation.isAccommodationPublic)
      .map(accommodation => ({
        ...accommodation,
        isAccommodationPublic: undefined,
        costTrackingLinks: undefined,
      })),
  };
}
