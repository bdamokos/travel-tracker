import { Location } from '@/app/types';

type LocationRange = {
  location: Location;
  start: Date;
  end: Date;
};

const toCalendarDay = (value: string | Date): Date => {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date(NaN);
  }

  const isLocalMidnight =
    date.getHours() === 0 &&
    date.getMinutes() === 0 &&
    date.getSeconds() === 0 &&
    date.getMilliseconds() === 0;

  if (isLocalMidnight) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

const getLocationRange = (location: Location): LocationRange | null => {
  const start = toCalendarDay(location.date);
  if (Number.isNaN(start.getTime())) {
    return null;
  }

  const rawEnd = location.endDate ? toCalendarDay(location.endDate) : start;
  const end = Number.isNaN(rawEnd.getTime()) || rawEnd < start ? start : rawEnd;

  return {
    location,
    start,
    end
  };
};

/**
 * Builds a mapping of side trip location IDs to their containing base locations.
 * A side trip is defined as any location fully contained within the duration of another
 * location. When multiple base candidates exist, the longest duration (or earliest) wins.
 */
export function buildSideTripMap(locations: Location[]): Map<string, Location> {
  const ranges = locations
    .map(getLocationRange)
    .filter((range): range is LocationRange => range !== null);

  const sideTripMap = new Map<string, Location>();

  ranges.forEach(range => {
    const containingLocations = ranges.filter(candidate => {
      if (candidate.location.id === range.location.id) return false;
      const startsBefore = candidate.start <= range.start;
      const endsAfter = candidate.end >= range.end;
      const strictlyContains = candidate.start < range.start || candidate.end > range.end;
      return startsBefore && endsAfter && strictlyContains;
    });

    if (containingLocations.length === 0) {
      return;
    }

    const base = containingLocations.reduce<LocationRange | null>((selected, candidate) => {
      if (!selected) return candidate;
      const selectedDuration = selected.end.getTime() - selected.start.getTime();
      const candidateDuration = candidate.end.getTime() - candidate.start.getTime();

      if (candidateDuration > selectedDuration) {
        return candidate;
      }

      if (candidateDuration === selectedDuration && candidate.start < selected.start) {
        return candidate;
      }

      return selected;
    }, null);

    if (base) {
      sideTripMap.set(range.location.id, base.location);
    }
  });

  return sideTripMap;
}

