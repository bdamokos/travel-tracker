import { Accommodation, Journey, Location, Transportation, JourneyPeriod } from '@/app/types';
import { isAdminHost } from '@/app/lib/server-domains';
import { filterSafePublicLinks } from '@/app/lib/publicUrlValidation';

interface TravelData {
  locations?: Location[];
  routes?: Transportation[];
  accommodations?: Accommodation[];
  days?: JourneyPeriod[];
  [key: string]: unknown;
}

type TransportationWithPrivateRuntimeFields = Transportation & {
  isReadOnly?: boolean;
  subRoutes?: TransportationWithPrivateRuntimeFields[];
};

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
    instagramPosts: filterSafePublicLinks(location.instagramPosts),
    tikTokPosts: filterSafePublicLinks(location.tikTokPosts),
    blogPosts: filterSafePublicLinks(location.blogPosts),
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

  const transportationWithPrivateFields = transportation as TransportationWithPrivateRuntimeFields;
  const publicTransportation: TransportationWithPrivateRuntimeFields = {
    ...transportationWithPrivateFields,
  };
  delete publicTransportation.privateNotes;
  delete publicTransportation.costTrackingLinks;
  delete publicTransportation.isReadOnly;
  delete publicTransportation.subRoutes;

  const filteredSubRoutes = transportationWithPrivateFields.subRoutes?.map(subRoute =>
    filterTransportationForServer(subRoute, host)
  );

  // Public view - remove private data entirely  
  const filteredTransportation: Transportation = {
    ...publicTransportation,
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
    accommodationData: accommodation.isAccommodationPublic ? accommodation.accommodationData : undefined,
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
    instagramPosts: filterSafePublicLinks(period.instagramPosts),
    tikTokPosts: filterSafePublicLinks(period.tikTokPosts),
    locations: filteredLocations,
    transportation: filteredTransportation,
  };
}

/**
 * Filter complete journey data based on request context (server-side only)
 */
export function filterJourneyForServer(journey: Journey, host: string | null): Journey {
  return filterTravelDataForServer({ ...journey }, host) as Journey;
}

/**
 * Filter travel data for server-side privacy
 */
export function filterTravelDataForServer(travelData: TravelData, host: string | null): TravelData {
  const isAdmin = isAdminHost(host);
  
  if (isAdmin) {
    return travelData; // Admin sees everything
  }

  // Mixed records can contain both journey days and legacy sibling collections.
  const filteredData = { ...travelData, instagramUsername: undefined };

  if (travelData.days) {
    filteredData.days = travelData.days.map(period => filterJourneyPeriodForServer(period, host));
  }

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
