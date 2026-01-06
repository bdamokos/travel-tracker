import 'server-only';

import { formatISO, isAfter } from 'date-fns';
import { Location } from '../types';
import { wikipediaService } from '../services/wikipediaService';
import { weatherService } from '../services/weatherService';
import { listAllTrips, loadUnifiedTripData } from './unifiedDataService';
import { generateWikipediaFilename } from './wikipediaUtils';

type LocationEnrichmentTarget = {
  tripId: string;
  location: Location;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function toValidDate(value?: Date | string | null): Date | undefined {
  if (!value) return undefined;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function normalizeCoordinates(coords: unknown): [number, number] | null {
  if (!Array.isArray(coords) || coords.length !== 2) return null;
  const [latRaw, lonRaw] = coords;
  const lat = Number(latRaw);
  const lon = Number(lonRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return [lat, lon];
}

function normalizeLocationForEnrichment(location: Location, fallbackDate?: Date): Location | null {
  const coords = normalizeCoordinates(location.coordinates);
  if (!coords) return null;

  const startDate = toValidDate(location.date) ?? fallbackDate ?? new Date();
  const endDate = toValidDate(location.endDate) ?? startDate;

  // Skip obviously invalid date ranges
  if (isAfter(startDate, endDate)) return null;

  const wikipediaRef = typeof location.wikipediaRef === 'string' ? location.wikipediaRef.trim() : undefined;

  return {
    ...location,
    id: location.id || `${location.name || 'location'}-${startDate.toISOString()}`,
    name: location.name || 'Unknown location',
    coordinates: coords,
    date: startDate,
    endDate,
    wikipediaRef: wikipediaRef || undefined
  } as Location;
}

function toISODate(date: Date): string {
  return formatISO(date, { representation: 'date' });
}

function buildWeatherKey(location: Location): string {
  const [lat, lon] = location.coordinates;
  const start = toISODate(toValidDate(location.date) ?? new Date());
  const end = toISODate(toValidDate(location.endDate) ?? toValidDate(location.date) ?? new Date());
  return `${lat.toFixed(4)}_${lon.toFixed(4)}_${start}_${end}`;
}

export async function gatherMapLocationTargets(): Promise<LocationEnrichmentTarget[]> {
  try {
    const trips = await listAllTrips();
    const targets: LocationEnrichmentTarget[] = [];

    for (const trip of trips) {
      try {
        const unified = await loadUnifiedTripData(trip.id);
        if (!unified?.travelData) continue;

        const tripStartDate = toValidDate((unified.travelData as { startDate?: Date | string }).startDate);
        const directLocations = Array.isArray(unified.travelData.locations) ? unified.travelData.locations : [];
        const dayLocations = Array.isArray(unified.travelData.days)
          ? unified.travelData.days.flatMap(day => (Array.isArray((day as { locations?: Location[] }).locations) ? (day as { locations?: Location[] }).locations! : []))
          : [];

        for (const loc of [...directLocations, ...dayLocations]) {
          const normalized = normalizeLocationForEnrichment(loc as Location, tripStartDate);
          if (normalized) {
            targets.push({ tripId: trip.id, location: normalized });
          }
        }
      } catch (error) {
        console.warn('[MapPrecalc] Failed to collect locations for trip %s:', trip.id, error);
      }
    }

    return targets;
  } catch (error) {
    console.error('[MapPrecalc] Failed to enumerate trips for precalculation:', error);
    return [];
  }
}

export async function precalculateMapDynamicData(targets?: LocationEnrichmentTarget[]): Promise<void> {
  const resolvedTargets = targets ?? await gatherMapLocationTargets();
  if (!resolvedTargets.length) return;

  const wikipediaKeys = new Set<string>();
  const weatherKeys = new Set<string>();

  console.log('[MapPrecalc] Pre-calculating dynamic map data for %d location stays', resolvedTargets.length);

  for (const target of resolvedTargets) {
    const normalized = normalizeLocationForEnrichment(target.location);
    if (!normalized) continue;

    const tasks: Array<Promise<unknown>> = [];

    const wikiKey = generateWikipediaFilename(normalized.name, normalized.coordinates);
    if (!wikipediaKeys.has(wikiKey)) {
      wikipediaKeys.add(wikiKey);
      tasks.push(wikipediaService.getLocationData(normalized));
    }

    const weatherKey = buildWeatherKey(normalized);
    if (!weatherKeys.has(weatherKey)) {
      weatherKeys.add(weatherKey);
      tasks.push(weatherService.getWeatherForLocation(normalized));
    }

    if (!tasks.length) continue;

    try {
      await Promise.allSettled(tasks);
    } catch (error) {
      console.warn('[MapPrecalc] Failed to pre-calculate for location %s:', normalized.name, error);
    }
  }
}

class MapDataPreloader {
  private interval: NodeJS.Timeout | null = null;
  private inFlight: Promise<void> | null = null;

  start(): void {
    if (this.interval) return;
    this.run();
    this.interval = setInterval(() => this.run(), ONE_DAY_MS);
    if (typeof this.interval.unref === 'function') {
      this.interval.unref();
    }
  }

  private run(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = precalculateMapDynamicData()
      .catch(error => {
        console.error('[MapPrecalc] Background pre-calculation failed:', error);
      })
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  }
}

const globalState = globalThis as typeof globalThis & { __mapDataPreloader?: MapDataPreloader };

export function ensureMapDataPreloaderRunning(): void {
  if (typeof window !== 'undefined') return;
  if (process.env.NODE_ENV === 'test') return;
  if (process.env.DISABLE_MAP_PREFETCH === 'true') return;

  if (!globalState.__mapDataPreloader) {
    globalState.__mapDataPreloader = new MapDataPreloader();
  }

  globalState.__mapDataPreloader.start();
}
