/**
 * React hook for managing Wikipedia data
 * Handles loading, caching, and error states for location-based Wikipedia content
 */

import { useState, useEffect, useCallback } from 'react';
import { StoredWikipediaData } from '../types/wikipedia';
import { Location } from '../types';

interface UseWikipediaDataResult {
  data: StoredWikipediaData | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  clearError: () => void;
}

interface WikipediaAPIResponse {
  success: boolean;
  data?: StoredWikipediaData;
  error?: string;
  locationName: string;
  cached?: boolean;
}

/**
 * Hook for fetching and managing Wikipedia data for a location
 */
export function useWikipediaData(
  location: Location | null,
  options: {
    enabled?: boolean;
    forceRefresh?: boolean;
  } = {}
): UseWikipediaDataResult {
  const { enabled = true, forceRefresh = false } = options;

  const [data, setData] = useState<StoredWikipediaData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWikipediaData = useCallback(async (refresh = false) => {
    if (!location || !enabled) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Build API URL
      const encodedLocationName = encodeURIComponent(location.name);
      const searchParams = new URLSearchParams();

      // Add coordinates if available
      if (location.coordinates) {
        searchParams.set('lat', location.coordinates[0].toString());
        searchParams.set('lon', location.coordinates[1].toString());
      }

      // Add Wikipedia reference if available
      if (location.wikipediaRef) {
        searchParams.set('wikipediaRef', location.wikipediaRef);
      }

      // Force refresh if requested
      if (refresh) {
        searchParams.set('refresh', 'true');
      }

      const url = `/api/wikipedia/${encodedLocationName}?${searchParams.toString()}`;

      // Fetch data from API
      const response = await fetch(url);
      const result: WikipediaAPIResponse = await response.json();

      if (result.success && result.data) {
        setData(result.data);
        setError(null);
      } else {
        setData(null);
        setError(result.error || 'Failed to fetch Wikipedia data');
      }

    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Network error');
      console.error('Error fetching Wikipedia data:', err);
    } finally {
      setLoading(false);
    }
  }, [location, enabled]);

  const refetch = useCallback(() => {
    return fetchWikipediaData(true);
  }, [fetchWikipediaData]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Fetch data when location changes or component mounts
  useEffect(() => {
    if (location && enabled) {
      fetchWikipediaData(forceRefresh);
    } else {
      setData(null);
      setError(null);
      setLoading(false);
    }
  }, [location?.id, location?.name, location?.wikipediaRef, location, enabled, fetchWikipediaData, forceRefresh]);

  return {
    data,
    loading,
    error,
    refetch,
    clearError,
  };
}

/**
 * Hook for managing Wikipedia data for multiple locations
 */
export function useMultipleWikipediaData(
  locations: Location[]
): Record<string, UseWikipediaDataResult> {
  const [results, setResults] = useState<Record<string, UseWikipediaDataResult>>({});

  useEffect(() => {
    const newResults: Record<string, UseWikipediaDataResult> = {};

    locations.forEach(location => {
      // Use the single location hook for each location
      // Note: This is a simplified implementation
      // In practice, you might want to batch these requests
      newResults[location.id] = {
        data: null,
        loading: false,
        error: null,
        refetch: async () => {},
        clearError: () => {},
      };
    });

    setResults(newResults);
  }, [locations]);

  return results;
}

/**
 * Hook for managing Wikipedia refresh operations
 */
export function useWikipediaRefresh() {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<{
    successful: number;
    failed: number;
    total: number;
  } | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const startRefresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshError(null);
    setRefreshStatus(null);

    try {
      const response = await fetch('/api/wikipedia/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (result.success && result.summary) {
        setRefreshStatus({
          successful: result.summary.successful,
          failed: result.summary.failed + result.summary.notFound,
          total: result.summary.totalLocations,
        });
      } else {
        setRefreshError(result.error || 'Refresh failed');
      }

    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setRefreshing(false);
    }
  }, []);

  const getRefreshMetadata = useCallback(async () => {
    try {
      const response = await fetch('/api/wikipedia/refresh');
      const result = await response.json();
      
      if (result.success) {
        return result.metadata;
      } else {
        throw new Error(result.error || 'Failed to get refresh metadata');
      }
    } catch (err) {
      console.error('Error fetching refresh metadata:', err);
      return null;
    }
  }, []);

  return {
    refreshing,
    refreshStatus,
    refreshError,
    startRefresh,
    getRefreshMetadata,
  };
}