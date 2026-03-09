'use client';

import { CostTrackingData } from '@/app/types';

const STORAGE_KEY_PREFIX = 'travel-tracker-cost-cache:';

const memoryCache = new Map<string, CostTrackingData>();
const inFlightRequests = new Map<string, Promise<CostTrackingData>>();

function canUseSessionStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

export function normalizeCostTrackerId(id: string): string {
  return id.replace(/^(cost-)+/, '');
}

function getCacheKey(id: string): string {
  return `cost-${normalizeCostTrackerId(id)}`;
}

export function getCachedCostTracker(id: string): CostTrackingData | null {
  const cacheKey = getCacheKey(id);
  const cachedInMemory = memoryCache.get(cacheKey);
  if (cachedInMemory) {
    return cachedInMemory;
  }

  if (!canUseSessionStorage()) {
    return null;
  }

  try {
    const serialized = window.sessionStorage.getItem(`${STORAGE_KEY_PREFIX}${cacheKey}`);
    if (!serialized) {
      return null;
    }

    const parsed = JSON.parse(serialized) as CostTrackingData;
    memoryCache.set(cacheKey, parsed);
    return parsed;
  } catch (error) {
    console.warn('Failed to read cached cost tracker data:', error);
    return null;
  }
}

export function hasCachedCostTracker(id: string): boolean {
  return getCachedCostTracker(id) !== null;
}

export function setCachedCostTracker(costData: CostTrackingData): void {
  const cacheKey = getCacheKey(costData.id || costData.tripId);
  const normalizedCostData = {
    ...costData,
    id: cacheKey
  };

  memoryCache.set(cacheKey, normalizedCostData);

  if (!canUseSessionStorage()) {
    return;
  }

  try {
    window.sessionStorage.setItem(
      `${STORAGE_KEY_PREFIX}${cacheKey}`,
      JSON.stringify(normalizedCostData)
    );
  } catch (error) {
    console.warn('Failed to persist cached cost tracker data:', error);
  }
}

export function clearCachedCostTracker(id: string): void {
  const cacheKey = getCacheKey(id);
  memoryCache.delete(cacheKey);
  inFlightRequests.delete(cacheKey);

  if (!canUseSessionStorage()) {
    return;
  }

  try {
    window.sessionStorage.removeItem(`${STORAGE_KEY_PREFIX}${cacheKey}`);
  } catch (error) {
    console.warn('Failed to clear cached cost tracker data:', error);
  }
}

export async function prefetchCostTracker(id: string): Promise<CostTrackingData> {
  const cacheKey = getCacheKey(id);
  const cached = getCachedCostTracker(cacheKey);
  if (cached) {
    return cached;
  }

  const existingRequest = inFlightRequests.get(cacheKey);
  if (existingRequest) {
    return existingRequest;
  }

  const request = fetch(`/api/cost-tracking?id=${encodeURIComponent(cacheKey)}`, {
    cache: 'no-store'
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to prefetch cost tracker ${cacheKey} (HTTP ${response.status})`);
      }

      const data = await response.json() as CostTrackingData;
      setCachedCostTracker(data);
      return data;
    })
    .finally(() => {
      inFlightRequests.delete(cacheKey);
    });

  inFlightRequests.set(cacheKey, request);
  return request;
}

