import { Location, Transportation } from '@/app/types';
import { normalizeUtcDateToLocalDay } from './dateUtils';

type TripStatus = 'before' | 'during' | 'after';

function toDate(value?: string | Date | null): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function startOfDay(d: Date): Date {
  const normalized = normalizeUtcDateToLocalDay(d) || new Date(d.getTime());
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function endOfDay(d: Date): Date {
  const normalized = normalizeUtcDateToLocalDay(d) || new Date(d.getTime());
  normalized.setHours(23, 59, 59, 999);
  return normalized;
}

export function determineTripStatus(start: string | Date, end: string | Date, now: Date = new Date()): TripStatus {
  const s = toDate(start);
  const e = toDate(end);
  if (!s || !e) return 'during';
  if (endOfDay(s) > now) return 'before';
  if (startOfDay(e) < now) return 'after';
  return 'during';
}

export function findCurrentLocation(locations: Location[], now: Date = new Date()): Location | null {
  if (!Array.isArray(locations) || locations.length === 0) return null;
  const sorted = [...locations].sort((a, b) => toDate(a.date)!.getTime() - toDate(b.date)!.getTime());

  for (const loc of sorted) {
    const start = toDate(loc.date);
    const end = toDate(loc.endDate || loc.date);
    if (!start || !end) continue;
    if (startOfDay(start) <= now && now <= endOfDay(end)) {
      return loc;
    }
  }
  return null;
}

export function findNextLocation(locations: Location[], now: Date = new Date()): Location | null {
  if (!Array.isArray(locations) || locations.length === 0) return null;
  const future = locations
    .map(l => ({ l, d: toDate(l.date) }))
    .filter(x => x.d && startOfDay(x.d!) > now)
    .sort((a, b) => a.d!.getTime() - b.d!.getTime());
  return future.length > 0 ? future[0].l : null;
}

export function findNextRoute(routes: Transportation[], now: Date = new Date()): Transportation | null {
  if (!Array.isArray(routes) || routes.length === 0) return null;
  const future = routes
    .map(r => ({ r, d: toDate(r.departureTime || r.arrivalTime || null) }))
    .filter(x => x.d && x.d > now)
    .sort((a, b) => a.d!.getTime() - b.d!.getTime());
  return future.length > 0 ? future[0].r : null;
}

export function matchRouteDestinationToLocation(route: Transportation | null, locations: Location[]): Location | null {
  if (!route) return null;
  const toName = (route.to || '').toLowerCase();
  if (!toName) return null;
  const exact = locations.find(l => l.name.toLowerCase() === toName);
  if (exact) return exact;
  const contains = locations.find(l =>
    l.name.toLowerCase().includes(toName) || toName.includes(l.name.toLowerCase())
  );
  return contains || null;
}

export function safePublicLocation(location: Location): Pick<Location, 'id' | 'name' | 'coordinates' | 'date' | 'endDate' | 'duration'> {
  return {
    id: location.id,
    name: location.name,
    coordinates: location.coordinates,
    date: location.date,
    endDate: location.endDate,
    duration: location.duration,
  };
}

export function safePublicRoute(route: Transportation): Pick<Transportation, 'id' | 'type' | 'from' | 'to' | 'departureTime' | 'arrivalTime' | 'fromCoordinates' | 'toCoordinates'> {
  return {
    id: route.id,
    type: route.type,
    from: route.from,
    to: route.to,
    departureTime: route.departureTime,
    arrivalTime: route.arrivalTime,
    fromCoordinates: route.fromCoordinates,
    toCoordinates: route.toCoordinates,
  };
}

export type NextStepsComputation = {
  status: TripStatus;
  currentLocation: Location | null;
  nextRoute: Transportation | null;
  nextLocation: Location | null;
};

export function computeNextSteps(
  locations: Location[] = [],
  routes: Transportation[] = [],
  tripStart: string | Date,
  tripEnd: string | Date,
  now: Date = new Date()
): NextStepsComputation {
  const status = determineTripStatus(tripStart, tripEnd, now);
  const currentLocation = findCurrentLocation(locations, now);
  const nextRoute = findNextRoute(routes, now);
  const nextLocation = findNextLocation(locations, now);
  return { status, currentLocation, nextRoute, nextLocation };
}

