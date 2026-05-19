import { normalizeUtcDateToLocalDay } from './dateUtils';

export type LocationTiming = {
  name: string;
  date: string | Date;
  endDate?: string | Date;
  notes?: string;
};

export type RouteTiming = {
  from: unknown;
  to: unknown;
  date?: string | Date;
  departureTime?: string | Date;
  arrivalTime?: string | Date;
};

const normalizeDate = (value: string | Date | undefined | null): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return normalizeUtcDateToLocalDay(date) ?? null;
};

const isSameDay = (a: Date, b: Date): boolean => a.getTime() === b.getTime();
const getNonEmptyString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;
const getComparableName = (value: unknown): string | null => getNonEmptyString(value)?.trim().toLowerCase() ?? null;
const hasSameName = (left: unknown, right: unknown): boolean => {
  const normalizedLeft = getComparableName(left);
  const normalizedRight = getComparableName(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
};

export const getCurrentTripStatus = (
  locations: LocationTiming[],
  routes: RouteTiming[],
  now: Date = new Date()
): string | null => {
  const today = normalizeUtcDateToLocalDay(now);
  if (!today) return null;

  for (const route of routes) {
    const departure = normalizeDate(route.departureTime ?? route.date);
    const arrival = normalizeDate(route.arrivalTime ?? route.departureTime ?? route.date);
    if (!departure) continue;
    const from = getNonEmptyString(route.from);
    const to = getNonEmptyString(route.to);
    if (!from || !to) continue;

    const routeEnd = arrival && arrival >= departure ? arrival : departure;
    if (today >= departure && today <= routeEnd) {
      return `Current location: Travelling today between ${from} and ${to}`;
    }
    if (isSameDay(today, departure)) {
      return `Current location: Travelling today between ${from} and ${to}`;
    }
  }

  // --- Transition detection based on overlapping locations ---
  const activeLocations: { location: LocationTiming; start: Date; end: Date }[] = [];
  for (const location of locations) {
    const start = normalizeDate(location.date);
    const end = normalizeDate(location.endDate ?? location.date);
    if (!start || !end) continue;
    if (today >= start && today <= end) {
      activeLocations.push({ location, start, end });
    }
  }

  if (activeLocations.length >= 2) {
    // Sort by start date so earlier = departing, later = arriving
    activeLocations.sort((a, b) => a.start.getTime() - b.start.getTime());
    const departing = activeLocations[0].location;
    const arriving = activeLocations[activeLocations.length - 1].location;
    // Try to find a matching route between them
    const matchingRoute = routes.find(
      (r) =>
        hasSameName(r.from, departing.name) &&
        hasSameName(r.to, arriving.name)
    );
    const from = getNonEmptyString(matchingRoute?.from) ?? departing.name;
    const to = getNonEmptyString(matchingRoute?.to) ?? arriving.name;
    return `Current location: Travelling today between ${from} and ${to}`;
  }

  if (activeLocations.length === 1) {
    const { location: loc, end } = activeLocations[0];
    if (isSameDay(today, end)) {
      // Last day at this location — check if there's a route departing from here
      const departingRoute = routes.find(
        (r) => hasSameName(r.from, loc.name)
      );
      if (departingRoute) {
        const from = getNonEmptyString(departingRoute.from);
        const to = getNonEmptyString(departingRoute.to);
        if (from && to) {
          return `Current location: Travelling today between ${from} and ${to}`;
        }
      }
    }
    // Normal single location (or last day with no route)
    if (loc.notes && /sidetrip|side trip/i.test(loc.notes)) {
      return `Current location: Excursion to ${loc.name}`;
    }
    return `Current location: ${loc.name}`;
  }

  return null;
};
