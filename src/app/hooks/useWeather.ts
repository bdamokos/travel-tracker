'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Location } from '@/app/types';
import { WeatherSummary, WeatherAPIResponse } from '@/app/types/weather';

export function useWeather(location: Location | null) {
  const [data, setData] = useState<WeatherSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const url = useMemo(() => {
    if (!location) return null;
    const sp = new URLSearchParams();
    sp.set('lat', location.coordinates[0].toString());
    sp.set('lon', location.coordinates[1].toString());
    sp.set('name', location.name);
    sp.set('id', location.id);
    const startISO = new Date(location.date).toISOString().slice(0, 10);
    sp.set('start', startISO);
    const endISO = location.endDate ? new Date(location.endDate).toISOString().slice(0, 10) : startISO;
    sp.set('end', endISO);
    return `/api/weather/location?${sp.toString()}`;
  }, [location]);

  const fetchWeather = useCallback(async () => {
    if (!url) return;
    // Abort any in-flight request when starting a new one
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      const json: WeatherAPIResponse = await res.json();
      if (json.success && json.data) setData(json.data);
      else setError(json.error || 'Failed to fetch weather');
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return; // ignore aborted requests
      }
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [url]);

  // Clear previous data immediately when switching locations/URL to avoid stale display
  useEffect(() => {
    setData(null);
    setError(null);
  }, [url]);

  useEffect(() => { fetchWeather(); }, [fetchWeather]);

  return { data, loading, error, refetch: fetchWeather };
}

