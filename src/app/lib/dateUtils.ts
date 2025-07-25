/**
 * Date utility functions for Travel Tracker
 */

export interface LocationWithDate {
  id: string;
  date: Date;
  [key: string]: unknown;
}

/**
 * Find the location that should be highlighted based on proximity to current date
 * Rules:
 * - If all locations are in the future, highlight the one closest to today
 * - If some locations are in past and some in future, highlight the latest past location
 * - If all locations are in the past, highlight the latest past location
 */
export function findClosestLocationToCurrentDate<T extends LocationWithDate>(
  locations: T[]
): T | null {
  if (!locations || locations.length === 0) return null;

  const now = new Date();
  now.setHours(23, 59, 59, 999); // Set to end of today for comparison
  
  // Filter out locations without valid dates
  const validLocations = locations.filter(location => {
    if (!location.date) return false;
    const locationDate = location.date instanceof Date ? location.date : new Date(location.date);
    return !isNaN(locationDate.getTime());
  });
  
  if (validLocations.length === 0) return null;
  
  // Separate past and future locations
  const pastLocations: T[] = [];
  const futureLocations: T[] = [];
  
  validLocations.forEach(location => {
    const locationDate = location.date instanceof Date ? location.date : new Date(location.date);
    if (locationDate <= now) {
      pastLocations.push(location);
    } else {
      futureLocations.push(location);
    }
  });
  
  // If we have past locations, return the latest one
  if (pastLocations.length > 0) {
    return pastLocations.reduce((latest, current) => {
      const latestDate = latest.date instanceof Date ? latest.date : new Date(latest.date);
      const currentDate = current.date instanceof Date ? current.date : new Date(current.date);
      return currentDate > latestDate ? current : latest;
    });
  }
  
  // If all locations are in the future, return the earliest one (closest to today)
  if (futureLocations.length > 0) {
    return futureLocations.reduce((closest, current) => {
      const closestDate = closest.date instanceof Date ? closest.date : new Date(closest.date);
      const currentDate = current.date instanceof Date ? current.date : new Date(current.date);
      return currentDate < closestDate ? current : closest;
    });
  }
  
  return null;
}

/**
 * Check if a location should be highlighted based on the current date
 */
export function shouldHighlightLocation<T extends LocationWithDate>(
  location: T,
  allLocations: T[]
): boolean {
  const closestLocation = findClosestLocationToCurrentDate(allLocations);
  return closestLocation?.id === location.id;
} 

/**
 * Format a date range for display
 * If endDate is provided and different from startDate, show as "Start - End"
 * If endDate is same as startDate or not provided, show only the start date
 */
export function formatDateRange(startDate: string | Date, endDate?: string | Date): string {
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : null;
  
  if (!end || start.getTime() === end.getTime()) {
    // Same day or no end date - show only start date
    return start.toLocaleDateString();
  }
  
  // Different dates - show range
  const startStr = start.toLocaleDateString();
  const endStr = end.toLocaleDateString();
  
  return `${startStr} - ${endStr}`;
}
