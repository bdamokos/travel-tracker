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

  clearPersistedTravelData(id);
  return null;
}

export function hasCachedTravelData(id: string): boolean {
  return getCachedTravelData(id) !== null;
}

export function setCachedTravelData(travelData: TravelData): void {
  if (!travelData.id) {
    return;
  }

  memoryCache.set(travelData.id, travelData);
  clearPersistedTravelData(travelData.id);
}

export function clearCachedTravelData(id: string): void {
  memoryCache.delete(id);
  inFlightRequests.delete(id);
  clearPersistedTravelData(id);
}

function clearPersistedTravelData(id: string): void {
  if (!canUseSessionStorage()) {
    return;
  }

  try {
    window.sessionStorage.removeItem(`${STORAGE_KEY_PREFIX}${id}`);
  } catch (error) {
    console.warn('Failed to clear persisted travel data cache:', error);
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
