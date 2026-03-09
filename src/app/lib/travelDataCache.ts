'use client';

import { TravelData } from '@/app/types';

const STORAGE_KEY_PREFIX = 'travel-tracker-trip-cache:';

const memoryCache = new Map<string, TravelData>();
const inFlightRequests = new Map<string, Promise<TravelData>>();

function canUseSessionStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

export function getCachedTravelData(id: string): TravelData | null {
  const cachedInMemory = memoryCache.get(id);
  if (cachedInMemory) {
    return cachedInMemory;
  }

  if (!canUseSessionStorage()) {
    return null;
  }

  try {
    const serialized = window.sessionStorage.getItem(`${STORAGE_KEY_PREFIX}${id}`);
    if (!serialized) {
      return null;
    }

    const parsed = JSON.parse(serialized) as TravelData;
    memoryCache.set(id, parsed);
    return parsed;
  } catch (error) {
    console.warn('Failed to read cached travel data:', error);
    return null;
  }
}

export function hasCachedTravelData(id: string): boolean {
  return getCachedTravelData(id) !== null;
}

export function setCachedTravelData(travelData: TravelData): void {
  if (!travelData.id) {
    return;
  }

  memoryCache.set(travelData.id, travelData);

  if (!canUseSessionStorage()) {
    return;
  }

  try {
    window.sessionStorage.setItem(
      `${STORAGE_KEY_PREFIX}${travelData.id}`,
      JSON.stringify(travelData)
    );
  } catch (error) {
    console.warn('Failed to persist cached travel data:', error);
  }
}

export function clearCachedTravelData(id: string): void {
  memoryCache.delete(id);
  inFlightRequests.delete(id);

  if (!canUseSessionStorage()) {
    return;
  }

  try {
    window.sessionStorage.removeItem(`${STORAGE_KEY_PREFIX}${id}`);
  } catch (error) {
    console.warn('Failed to clear cached travel data:', error);
  }
}

export async function prefetchTravelData(id: string): Promise<TravelData> {
  const cached = getCachedTravelData(id);
  if (cached) {
    return cached;
  }

  const existingRequest = inFlightRequests.get(id);
  if (existingRequest) {
    return existingRequest;
  }

  const request = fetch(`/api/travel-data?id=${encodeURIComponent(id)}`, {
    cache: 'no-store'
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to prefetch travel data for ${id} (HTTP ${response.status})`);
      }

      const data = await response.json() as TravelData;
      setCachedTravelData(data);
      return data;
    })
    .finally(() => {
      inFlightRequests.delete(id);
    });

  inFlightRequests.set(id, request);
  return request;
}
