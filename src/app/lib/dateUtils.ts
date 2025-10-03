/**
 * Date utility functions for Travel Tracker
 */

export interface LocationWithDate {
  id: string;
  date: Date | string;
  [key: string]: unknown;
}

function parseDate(value: string | Date | undefined | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Convert a date (stored as UTC midnight) to a local Date at the same calendar day.
 * This avoids the off-by-one effect when rendering in different timezones.
 */
export function normalizeUtcDateToLocalDay(value: string | Date | undefined | null): Date | null {
  const date = parseDate(value);
  if (!date) return null;
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Format a stored UTC date so that the rendered day stays the same in all timezones.
 */
export function formatUtcDate(
  value: string | Date | undefined | null,
  locales?: Intl.LocalesArgument,
  options: Intl.DateTimeFormatOptions = {}
): string {
  const date = parseDate(value);
  if (!date) return '';
  return date.toLocaleDateString(locales, { ...options, timeZone: 'UTC' });
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
    return normalizeUtcDateToLocalDay(location.date) !== null;
  });
  
  if (validLocations.length === 0) return null;
  
  // Separate past and future locations
  const pastLocations: T[] = [];
  const futureLocations: T[] = [];
  
  validLocations.forEach(location => {
    const locationDate = normalizeUtcDateToLocalDay(location.date);
    if (!locationDate) return;
    if (locationDate <= now) {
      pastLocations.push(location);
    } else {
      futureLocations.push(location);
    }
  });
  
  // If we have past locations, return the latest one
  if (pastLocations.length > 0) {
    return pastLocations.reduce((latest, current) => {
      const latestDate = normalizeUtcDateToLocalDay(latest.date);
      const currentDate = normalizeUtcDateToLocalDay(current.date);
      if (!latestDate) return current;
      if (!currentDate) return latest;
      return currentDate > latestDate ? current : latest;
    });
  }
  
  // If all locations are in the future, return the earliest one (closest to today)
  if (futureLocations.length > 0) {
    return futureLocations.reduce((closest, current) => {
      const closestDate = normalizeUtcDateToLocalDay(closest.date);
      const currentDate = normalizeUtcDateToLocalDay(current.date);
      if (!closestDate) return current;
      if (!currentDate) return closest;
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
  const start = parseDate(startDate);
  const end = endDate ? parseDate(endDate) : null;
  if (!start) return '';

  const startDay = normalizeUtcDateToLocalDay(start);
  const endDay = end ? normalizeUtcDateToLocalDay(end) : null;

  if (!endDay || (startDay && endDay && startDay.getTime() === endDay.getTime())) {
    return formatUtcDate(start);
  }

  const startStr = formatUtcDate(start);
  const endStr = formatUtcDate(end);

  return `${startStr} - ${endStr}`;
}
