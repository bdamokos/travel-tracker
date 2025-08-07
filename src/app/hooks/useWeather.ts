'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Location } from '@/app/types';
import { WeatherSummary, WeatherAPIResponse } from '@/app/types/weather';

export function useWeather(location: Location | null) {
  const [data, setData] = useState<WeatherSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url);
      const json: WeatherAPIResponse = await res.json();
      if (json.success && json.data) setData(json.data);
      else setError(json.error || 'Failed to fetch weather');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => { fetchWeather(); }, [fetchWeather]);

  return { data, loading, error, refetch: fetchWeather };
}

