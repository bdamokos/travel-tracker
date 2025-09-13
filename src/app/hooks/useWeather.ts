'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Location } from '@/app/types';
import { WeatherSummary, WeatherAPIResponse, WeatherData } from '@/app/types/weather';

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

  const todayUrl = useMemo(() => {
    if (!location) return null;
    const todayISO = new Date().toISOString().slice(0, 10);
    const sp = new URLSearchParams();
    sp.set('lat', location.coordinates[0].toString());
    sp.set('lon', location.coordinates[1].toString());
    sp.set('date', todayISO);
    return `/api/weather/date?${sp.toString()}`;
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

      if (json.success && json.data) {
        let base = json.data;

        // If today is outside the stay window, also fetch today's single-day weather and merge it in
        const todayISO = new Date().toISOString().slice(0, 10);
        const startISO = base.startDate;
        const endISO = base.endDate;
        const isTodayInRange = todayISO >= startISO && todayISO <= endISO;

        if (!isTodayInRange && todayUrl) {
          try {
            const tRes = await fetch(todayUrl, { signal: controller.signal, cache: 'no-store' });
            const tJson: { success: boolean; data?: { dailyWeather?: WeatherData[] }; error?: string } = await tRes.json();
            const today = tJson?.data?.dailyWeather?.[0];
            if (tJson.success && today) {
              const exists = base.dailyWeather.some(d => d.date === today.date);
              const mergedDaily = exists ? base.dailyWeather : [...base.dailyWeather, today];
              // Keep base.summary as-is (represents stay window). Only extend daily list for UI.
              base = {
                ...base,
                dailyWeather: mergedDaily.sort((a, b) => a.date.localeCompare(b.date))
              };
            }
          } catch {
            // Non-fatal; keep base data
          }
        }

        setData(base);
      } else if (todayUrl) {
        // Fallback: if range failed, try to at least show today's single-day weather
        try {
          const tRes = await fetch(todayUrl, { signal: controller.signal, cache: 'no-store' });
          const tJson: { success: boolean; data?: { dailyWeather?: WeatherData[] }; error?: string } = await tRes.json();
          const today = tJson?.data?.dailyWeather?.[0];
          if (tJson.success && today) {
            const todayISO = today.date;
            const summary: WeatherSummary = {
              locationId: location?.id,
              startDate: todayISO,
              endDate: todayISO,
              dailyWeather: [today],
              summary: { averageTemp: today.temperature.average, totalPrecipitation: today.precipitation.total, predominantCondition: today.conditions.description }
            };
            setData(summary);
          } else {
            setError(tJson.error || json.error || 'Failed to fetch weather');
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Network error');
        }
      } else {
        setError(json.error || 'Failed to fetch weather');
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return; // ignore aborted requests
      }
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [url, todayUrl, location?.id]);

  // Clear previous data immediately when switching locations/URL to avoid stale display
  useEffect(() => {
    setData(null);
    setError(null);
  }, [url]);

  useEffect(() => { fetchWeather(); }, [fetchWeather]);

  return { data, loading, error, refetch: fetchWeather };
}
