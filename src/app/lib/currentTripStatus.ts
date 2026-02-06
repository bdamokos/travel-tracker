import { normalizeUtcDateToLocalDay } from './dateUtils';

export type LocationTiming = {
  name: string;
  date: string | Date;
  endDate?: string | Date;
  notes?: string;
};

export type RouteTiming = {
  from: string;
  to: string;
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
    const routeEnd = arrival && arrival >= departure ? arrival : departure;
    if (today >= departure && today <= routeEnd) {
      return `Current location: Travelling today between ${route.from} and ${route.to}`;
    }
    if (isSameDay(today, departure)) {
      return `Current location: Travelling today between ${route.from} and ${route.to}`;
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
        r.from.toLowerCase() === departing.name.toLowerCase() &&
        r.to.toLowerCase() === arriving.name.toLowerCase()
    );
    const from = matchingRoute ? matchingRoute.from : departing.name;
    const to = matchingRoute ? matchingRoute.to : arriving.name;
    return `Current location: Travelling today between ${from} and ${to}`;
  }

  if (activeLocations.length === 1) {
    const { location: loc, end } = activeLocations[0];
    if (isSameDay(today, end)) {
      // Last day at this location — check if there's a route departing from here
      const departingRoute = routes.find(
        (r) => r.from.toLowerCase() === loc.name.toLowerCase()
      );
      if (departingRoute) {
        return `Current location: Travelling today between ${departingRoute.from} and ${departingRoute.to}`;
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
