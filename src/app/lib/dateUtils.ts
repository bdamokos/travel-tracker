/**
 * Date utility functions for Travel Tracker
 */

export interface LocationWithDate {
  id: string;
  date: Date | string;
  endDate?: Date | string | null;
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

  type NormalizedLocation = {
    original: T;
    start: Date;
    end: Date;
  };

  const normalizeLocation = (location: T): NormalizedLocation | null => {
    const start = normalizeUtcDateToLocalDay(location.date);
    if (!start) return null;

    const rawEnd = location.endDate ?? null;
    const parsedEnd = rawEnd ? normalizeUtcDateToLocalDay(rawEnd) : null;
    const end = parsedEnd && parsedEnd >= start ? parsedEnd : start;

    return {
      original: location,
      start,
      end
    };
  };

  const normalizedLocations: NormalizedLocation[] = locations
    .map(normalizeLocation)
    .filter((loc): loc is NormalizedLocation => loc !== null);

  if (normalizedLocations.length === 0) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const activeLocations = normalizedLocations.filter(({ start, end }) => start <= today && today <= end);
  if (activeLocations.length > 0) {
    const active = activeLocations.reduce<NormalizedLocation | null>((selected, candidate) => {
      if (!selected) return candidate;
      if (candidate.start > selected.start) return candidate;
      if (candidate.start.getTime() === selected.start.getTime() && candidate.end > selected.end) {
        return candidate;
      }
      return selected;
    }, null);

    return active?.original ?? null;
  }

  const futureLocations = normalizedLocations.filter(({ start }) => start > today);
  if (futureLocations.length > 0) {
    const future = futureLocations.reduce<NormalizedLocation | null>((selected, candidate) => {
      if (!selected) return candidate;
      if (candidate.start < selected.start) return candidate;
      if (candidate.start.getTime() === selected.start.getTime() && candidate.end < selected.end) {
        return candidate;
      }
      return selected;
    }, null);

    return future?.original ?? null;
  }

  const pastLocations = normalizedLocations.filter(({ end }) => end < today);
  if (pastLocations.length > 0) {
    const latest = pastLocations.reduce<NormalizedLocation | null>((selected, candidate) => {
      if (!selected) return candidate;
      if (candidate.end > selected.end) return candidate;
      if (candidate.end.getTime() === selected.end.getTime() && candidate.start > selected.start) {
        return candidate;
      }
      return selected;
    }, null);

    return latest?.original ?? null;
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
