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
      return `Current location: We are travelling today between ${route.from} and ${route.to}`;
    }
    if (isSameDay(today, departure)) {
      return `Current location: We are travelling today between ${route.from} and ${route.to}`;
    }
  }

  for (const location of locations) {
    const start = normalizeDate(location.date);
    const end = normalizeDate(location.endDate ?? location.date);
    if (!start || !end) continue;

    if (today >= start && today <= end) {
      if (location.notes && /sidetrip|side trip/i.test(location.notes)) {
        return `Current location: We are on an excursion to ${location.name}`;
      }
      return `Current location: ${location.name}`;
    }
  }

  return null;
};
