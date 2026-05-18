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

  clearPersistedCostTracker(cacheKey);
  return null;
}

export function hasCachedCostTracker(id: string): boolean {
  return getCachedCostTracker(id) !== null;
}

export function setCachedCostTracker(costData: CostTrackingData): void {
  const sourceId = costData.id || costData.tripId;
  if (!sourceId) {
    return;
  }

  const cacheKey = getCacheKey(sourceId);
  const normalizedCostData = {
    ...costData,
    id: cacheKey
  };

  memoryCache.set(cacheKey, normalizedCostData);
  clearPersistedCostTracker(cacheKey);
}

export function clearCachedCostTracker(id: string): void {
  const cacheKey = getCacheKey(id);
  memoryCache.delete(cacheKey);
  inFlightRequests.delete(cacheKey);
  clearPersistedCostTracker(cacheKey);
}

function clearPersistedCostTracker(cacheKey: string): void {
  if (!canUseSessionStorage()) {
    return;
  }

  try {
    window.sessionStorage.removeItem(`${STORAGE_KEY_PREFIX}${cacheKey}`);
  } catch (error) {
    console.warn('Failed to clear persisted cost tracker cache:', error);
  }
}

export async function prefetchCostTracker(id: string): Promise<CostTrackingData> {
  const cacheKey = getCacheKey(id);
  const cached = getCachedCostTracker(id);
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
