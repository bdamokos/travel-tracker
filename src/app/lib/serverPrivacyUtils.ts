import { Accommodation, Journey, Location, Transportation, JourneyPeriod } from '@/app/types';
import { isAdminHost } from '@/app/lib/server-domains';

interface TravelData {
  locations?: Location[];
  routes?: Transportation[];
  accommodations?: Accommodation[];
  days?: JourneyPeriod[];
  [key: string]: unknown;
}

/**
 * Server-side privacy filtering utilities
 * These functions ensure private data never reaches the client in public/embeddable views
 */

/**
 * Filter location data based on request context (server-side only)
 */
export function filterLocationForServer(location: Location, host: string | null): Location {
  const isAdmin = isAdminHost(host);
  
  if (isAdmin) {
    return location; // Admin sees everything
  }

  // Public view - remove private data entirely
  const filteredLocation: Location = {
    ...location,
    // Remove private fields completely
    accommodationIds: undefined,
    costTrackingLinks: undefined,
    // Handle accommodation privacy
    accommodationData: location.isAccommodationPublic ? location.accommodationData : undefined,
    isAccommodationPublic: undefined, // Don't expose the privacy flag itself
    isReadOnly: undefined,
  };

  return filteredLocation;
}

/**
 * Filter transportation data based on request context (server-side only)
 */
export function filterTransportationForServer(
  transportation: Transportation,
  host: string | null
): Transportation {
  const isAdmin = isAdminHost(host);
  
  if (isAdmin) {
    return transportation; // Admin sees everything
  }

  const filteredSubRoutes = transportation.subRoutes?.map(subRoute => ({
    ...subRoute,
    privateNotes: undefined,
    costTrackingLinks: undefined,
    isReadOnly: undefined,
    routePoints: subRoute.routePoints
  }));

  // Public view - remove private data entirely  
  const filteredTransportation: Transportation = {
    ...transportation,
    // Remove private fields completely
    privateNotes: undefined,
    costTrackingLinks: undefined,
    isReadOnly: undefined,
    // Preserve routePoints for public map display
    routePoints: transportation.routePoints,
    subRoutes: filteredSubRoutes
  };

  return filteredTransportation;
}

/**
 * Filter accommodation data based on request context (server-side only)
 */
export function filterAccommodationForServer(
  accommodation: Accommodation,
  host: string | null
): Accommodation {
  const isAdmin = isAdminHost(host);

  if (isAdmin) {
    return accommodation;
  }

  return {
    ...accommodation,
    isAccommodationPublic: undefined,
    costTrackingLinks: undefined,
    isReadOnly: undefined,
  };
}

/**
 * Filter journey period data based on request context (server-side only)
 */
export function filterJourneyPeriodForServer(
  period: JourneyPeriod,
  host: string | null
): JourneyPeriod {
  const filteredLocations = period.locations.map(location => 
    filterLocationForServer(location, host)
  );

  const filteredTransportation = period.transportation 
    ? filterTransportationForServer(period.transportation, host)
    : undefined;

  return {
    ...period,
    locations: filteredLocations,
    transportation: filteredTransportation,
  };
}

/**
 * Filter complete journey data based on request context (server-side only)
 */
export function filterJourneyForServer(journey: Journey, host: string | null): Journey {
  const isAdmin = isAdminHost(host);
  const filteredDays = journey.days.map(period => 
    filterJourneyPeriodForServer(period, host)
  );
  const journeyWithAccommodations = journey as Journey & { accommodations?: Accommodation[] };

  return {
    ...journey,
    accommodations: isAdmin
      ? journeyWithAccommodations.accommodations
      : journeyWithAccommodations.accommodations
        ?.filter((accommodation: Accommodation) => accommodation.isAccommodationPublic)
        .map((accommodation: Accommodation) => filterAccommodationForServer(accommodation, host)),
    days: filteredDays,
  } as Journey;
}

/**
 * Filter travel data for server-side privacy
 */
export function filterTravelDataForServer(travelData: TravelData, host: string | null): TravelData {
  const isAdmin = isAdminHost(host);
  
  if (isAdmin) {
    return travelData; // Admin sees everything
  }

  // Handle both new Journey format and legacy format
  if (travelData.days) {
    // New format with JourneyPeriods
    const filteredJourney = filterJourneyForServer(travelData as unknown as Journey, host);
    return {
      ...filteredJourney,
      accommodations: travelData.accommodations
        ?.filter((accommodation: Accommodation) => accommodation.isAccommodationPublic)
        .map((accommodation: Accommodation) => filterAccommodationForServer(accommodation, host)),
      instagramUsername: undefined
    } as TravelData;
  }

  // Legacy format - filter locations and routes directly
  const filteredData = { ...travelData, instagramUsername: undefined };

  if (travelData.locations) {
    filteredData.locations = travelData.locations.map((location: Location) => 
      filterLocationForServer(location, host)
    );
  }

  if (travelData.routes) {
    filteredData.routes = travelData.routes.map((route: Transportation) => 
      filterTransportationForServer(route, host)
    );
  }

  if (travelData.accommodations) {
    filteredData.accommodations = travelData.accommodations
      .filter((accommodation: Accommodation) => accommodation.isAccommodationPublic)
      .map((accommodation: Accommodation) => filterAccommodationForServer(accommodation, host));
  }

  return filteredData;
}
