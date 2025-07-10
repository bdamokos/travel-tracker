import { Journey, Location, Transportation, JourneyPeriod } from '../types';

/**
 * Server-side privacy filtering utilities
 * These functions ensure private data never reaches the client in public/embeddable views
 */

/**
 * Determine if request is from admin domain based on host header
 */
function isAdminRequest(host: string | null): boolean {
  if (!host) return false;
  
  // Use environment variable for admin domain
  const adminDomain = process.env.ADMIN_DOMAIN?.replace(/^https?:\/\//, '');
  
  return (adminDomain && (host === adminDomain || host.startsWith(adminDomain + ':'))) || 
         (process.env.NODE_ENV !== 'production' && (host === 'localhost' || host.startsWith('localhost:')));
}

/**
 * Filter location data based on request context (server-side only)
 */
export function filterLocationForServer(location: Location, host: string | null): Location {
  const isAdmin = isAdminRequest(host);
  
  if (isAdmin) {
    return location; // Admin sees everything
  }

  // Public view - remove private data entirely
  const filteredLocation: Location = {
    ...location,
    // Remove private fields completely
    costTrackingLinks: undefined,
    // Handle accommodation privacy
    accommodationData: location.isAccommodationPublic ? location.accommodationData : undefined,
    isAccommodationPublic: undefined, // Don't expose the privacy flag itself
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
  const isAdmin = isAdminRequest(host);
  
  if (isAdmin) {
    return transportation; // Admin sees everything
  }

  // Public view - remove private data entirely
  const filteredTransportation: Transportation = {
    ...transportation,
    // Remove private fields completely
    privateNotes: undefined,
    costTrackingLinks: undefined,
  };

  return filteredTransportation;
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
  const filteredDays = journey.days.map(period => 
    filterJourneyPeriodForServer(period, host)
  );

  return {
    ...journey,
    days: filteredDays,
  };
}

interface LegacyTravelData {
  locations?: Location[];
  routes?: Transportation[];
  days?: JourneyPeriod[];
  [key: string]: unknown;
}

/**
 * Filter travel data for legacy format compatibility (server-side only)
 */
export function filterTravelDataForServer(travelData: LegacyTravelData, host: string | null): LegacyTravelData {
  const isAdmin = isAdminRequest(host);
  
  if (isAdmin) {
    return travelData; // Admin sees everything
  }

  // Handle both new Journey format and legacy format
  if (travelData.days) {
    // New format with JourneyPeriods
    return filterJourneyForServer(travelData as unknown as Journey, host);
  }

  // Legacy format - filter locations and routes directly
  const filteredData = { ...travelData };

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

  return filteredData;
}