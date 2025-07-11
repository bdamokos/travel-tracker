import { Location, Transportation } from '../types';

// Interface for TravelRoute from TravelDataForm
interface TravelRoute {
  id: string;
  from: string;
  to: string;
  fromCoords: [number, number];
  toCoords: [number, number];
  transportType: Transportation['type'];
  date: Date;
  duration?: string;
  notes?: string;
}

/**
 * Calculate the duration in days between two dates (inclusive)
 * Returns the number of days staying (including both start and end dates)
 */
export function calculateDurationInDays(startDate: string | Date, endDate: string | Date): number {
  const start = startDate instanceof Date ? startDate : new Date(startDate);
  const end = endDate instanceof Date ? endDate : new Date(endDate);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return diffDays;
}

/**
 * Calculate the number of nights between two dates
 * Same date = 0 nights, consecutive dates = 1 night, etc.
 */
export function calculateNights(startDate: string | Date, endDate: string | Date): number {
  const start = startDate instanceof Date ? startDate : new Date(startDate);
  const end = endDate instanceof Date ? endDate : new Date(endDate);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const nights = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return nights;
}

/**
 * Convert TravelRoute to Transportation format
 */
function convertTravelRouteToTransportation(route: TravelRoute): Transportation {
  return {
    id: route.id,
    type: route.transportType === 'boat' ? 'ferry' : 
          route.transportType === 'metro' ? 'train' : 
          route.transportType as Transportation['type'],
    from: route.from,
    to: route.to,
    departureTime: route.date instanceof Date ? route.date.toISOString() : route.date,
    fromCoordinates: route.fromCoords,
    toCoordinates: route.toCoords
  };
}

/**
 * Calculate smart duration suggestions for locations based on transportation
 */
export function calculateSmartDurations(
  locations: Location[],
  routes: Transportation[] | TravelRoute[]
): Location[] {
  if (locations.length === 0) return locations;

  // Convert TravelRoute[] to Transportation[] if needed
  const transportationRoutes: Transportation[] = routes.map(route => {
    if ('transportType' in route) {
      // It's a TravelRoute, convert it
      return convertTravelRouteToTransportation(route);
    }
    // It's already a Transportation
    return route as Transportation;
  });

  // Sort locations by date to process them in chronological order
  const sortedLocations = [...locations].sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  return sortedLocations.map((location, index) => {
    // Skip if endDate is manually set (preserve manual input)
    if (location.endDate) {
      // Recalculate duration if endDate exists but duration doesn't match
      const calculatedDuration = calculateDurationInDays(location.date, location.endDate);
      if (!location.duration || location.duration !== calculatedDuration) {
        return {
          ...location,
          duration: calculatedDuration
        };
      }
      return location;
    }

    let suggestedEndDate: Date | undefined;
    let suggestedDuration: number | undefined;

    // Method 1: Look for outbound transportation from this location
    const outboundRoute = transportationRoutes.find(route => 
      route.from.toLowerCase().includes(location.name.toLowerCase()) ||
      location.name.toLowerCase().includes(route.from.toLowerCase())
    );

    if (outboundRoute && outboundRoute.departureTime) {
      // Extract date from departure time (assuming format includes date)
      const departureDate = outboundRoute.departureTime.split('T')[0] || outboundRoute.departureTime;
      suggestedEndDate = new Date(departureDate);
      suggestedDuration = calculateDurationInDays(location.date, suggestedEndDate);
    }

    // Method 2: Look at the next location's arrival
    const nextLocation = sortedLocations[index + 1];
    if (!suggestedEndDate && nextLocation) {
      // Find transportation to the next location
      const routeToNext = transportationRoutes.find(route =>
        (route.from.toLowerCase().includes(location.name.toLowerCase()) ||
         location.name.toLowerCase().includes(route.from.toLowerCase())) &&
        (route.to.toLowerCase().includes(nextLocation.name.toLowerCase()) ||
         nextLocation.name.toLowerCase().includes(route.to.toLowerCase()))
      );

      if (routeToNext && routeToNext.departureTime) {
        const departureDate = routeToNext.departureTime.split('T')[0] || routeToNext.departureTime;
        suggestedEndDate = new Date(departureDate);
        suggestedDuration = calculateDurationInDays(location.date, suggestedEndDate);
      } else {
        // Fallback: use the day before next location's date
        const dayBefore = new Date(nextLocation.date);
        dayBefore.setDate(dayBefore.getDate() - 1);
        suggestedEndDate = dayBefore;
        suggestedDuration = calculateDurationInDays(location.date, suggestedEndDate);
      }
    }

    // Method 3: Default duration for last location or when no transportation info
    if (!suggestedDuration) {
      suggestedDuration = 1; // Default to 1 day
      const endDate = new Date(location.date);
      endDate.setDate(endDate.getDate() + suggestedDuration);
      suggestedEndDate = endDate;
    }

    // Only suggest if it makes sense (positive duration, reasonable length)
    if (suggestedDuration > 0 && suggestedDuration <= 365) {
      return {
        ...location,
        endDate: location.endDate || suggestedEndDate,
        duration: location.duration || suggestedDuration,
        departureTime: location.departureTime || outboundRoute?.departureTime
      };
    }

    return location;
  });
}

/**
 * Format duration for display using "X days/Y nights" format
 */
export function formatDuration(days: number, startDate?: string | Date, endDate?: string | Date): string {
  if (startDate && endDate) {
    const nights = calculateNights(startDate, endDate);
    return `${days} day${days !== 1 ? 's' : ''}/${nights} night${nights !== 1 ? 's' : ''}`;
  }
  
  // Fallback for when we only have days count
  const nights = Math.max(0, days - 1);
  return `${days} day${days !== 1 ? 's' : ''}/${nights} night${nights !== 1 ? 's' : ''}`;
}

/**
 * Suggest duration based on location type/name
 */
export function suggestDurationByLocationType(locationName: string): number {
  const name = locationName.toLowerCase();
  
  // Major cities - longer stays
  if (name.includes('paris') || name.includes('london') || name.includes('tokyo') || 
      name.includes('new york') || name.includes('rome') || name.includes('barcelona')) {
    return 3;
  }
  
  // Capital cities
  if (name.includes('capital') || name.includes('city')) {
    return 2;
  }
  
  // Transit locations
  if (name.includes('airport') || name.includes('station') || name.includes('port')) {
    return 1;
  }
  
  // Default
  return 2;
}