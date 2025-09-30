import fs from 'fs/promises';
import path from 'path';
import { addDays, differenceInCalendarDays, formatISO, isAfter, isBefore, isValid, parseISO } from 'date-fns';
import { Location } from '@/app/types';
import { WeatherData, WeatherSummary } from '@/app/types/weather';

type CacheSources = {
  hasHistoricalAverage: boolean;
  hasForecast: boolean;
  hasRecorded: boolean;
};

type CacheEntry = {
  key: string;
  summary: WeatherSummary;
  fetchedAt: string;
  sources: CacheSources;
};

const LEGACY_FETCHED_AT = '1970-01-01T00:00:00.000Z';

const DATA_DIR = path.join(process.cwd(), 'data', 'weather');

const RATE_LIMIT_MS = 1000; // 1 req/sec conservative
let lastRequestTime = 0;

async function ensureDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function log(...args: unknown[]) {
  // Centralized server-side logging for weather

  console.log('[Weather]', ...args);
}

function toISODate(date: Date): string {
  return formatISO(date, { representation: 'date' });
}

// intentionally unused for now; keep helper ready for future range clamping

function buildCacheKey(coords: [number, number], startISO: string, endISO: string): string {
  const [lat, lon] = coords.map(n => Number(n).toFixed(4));
  return `${lat}_${lon}_${startISO}_${endISO}`;
}

function expirationForDate(target: Date, today: Date): number {
  const diff = differenceInCalendarDays(target, today);
  if (diff < -5) return Infinity; // historical far past: never expire
  if (diff <= 0) return 60 * 60; // current/near past: 1h
  if (diff <= 3) return 6 * 60 * 60; // short-term forecast: 6h
  return 12 * 60 * 60; // long-term: 12h
}

function openMeteoIconAndDesc(code: number | null): { icon: string; description: string } {
  // Basic mapping. Could be replaced with richer icon set.
  const map: Record<number, { icon: string; description: string }> = {
    0: { icon: '☀️', description: 'Clear sky' },
    1: { icon: '🌤️', description: 'Mainly clear' },
    2: { icon: '⛅', description: 'Partly cloudy' },
    3: { icon: '☁️', description: 'Overcast' },
    45: { icon: '🌫️', description: 'Fog' },
    48: { icon: '🌫️', description: 'Depositing rime fog' },
    51: { icon: '🌦️', description: 'Light drizzle' },
    53: { icon: '🌦️', description: 'Moderate drizzle' },
    55: { icon: '🌧️', description: 'Dense drizzle' },
    61: { icon: '🌦️', description: 'Slight rain' },
    63: { icon: '🌧️', description: 'Moderate rain' },
    65: { icon: '🌧️', description: 'Heavy rain' },
    71: { icon: '🌨️', description: 'Slight snow' },
    73: { icon: '🌨️', description: 'Moderate snow' },
    75: { icon: '❄️', description: 'Heavy snow' },
    80: { icon: '🌦️', description: 'Rain showers' },
    81: { icon: '🌧️', description: 'Rain showers' },
    82: { icon: '🌧️', description: 'Violent rain showers' },
    95: { icon: '⛈️', description: 'Thunderstorm' },
  };
  if (code != null && map[code]) return map[code];
  return { icon: '❓', description: 'Unknown' };
}

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const wait = Math.max(0, RATE_LIMIT_MS - (now - lastRequestTime));
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastRequestTime = Date.now();
  log('HTTP GET', url);
  return fetch(url, { headers: { 'Accept': 'application/json' } });
}

async function readCache(key: string): Promise<CacheEntry | null> {
  try {
    await ensureDir();
    const file = path.join(DATA_DIR, `${key}.json`);
    const raw = await fs.readFile(file, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<CacheEntry> & { summary: WeatherSummary };
    if (!parsed.summary) return null;
    // Filter out expired per-day entries
    const today = new Date();
    const filtered = parsed.summary.dailyWeather.filter(d => {
      if (!d.expiresAt) return true;
      const exp = parseISO(d.expiresAt);
      return isValid(exp) && isAfter(exp, today);
    });
    const summary: WeatherSummary = { ...parsed.summary, dailyWeather: filtered };
    const fetchedAt = typeof parsed.fetchedAt === 'string' ? parsed.fetchedAt : LEGACY_FETCHED_AT;
    const entry: CacheEntry = {
      key: parsed.key || key,
      summary,
      fetchedAt,
      sources: computeSources(summary.dailyWeather)
    };
    return entry;
  } catch {
    return null;
  }
}

async function writeCache(key: string, summary: WeatherSummary): Promise<void> {
  await ensureDir();
  const file = path.join(DATA_DIR, `${key}.json`);
  const entry: CacheEntry = {
    key,
    summary,
    fetchedAt: new Date().toISOString(),
    sources: computeSources(summary.dailyWeather)
  };
  await fs.writeFile(file, JSON.stringify(entry, null, 2), 'utf-8');
}

function summarize(daily: WeatherData[]): WeatherSummary['summary'] {
  const temps = daily.map(d => d.temperature.average).filter((v): v is number => v != null);
  const precs = daily.map(d => d.precipitation.total).filter((v): v is number => v != null);
  const avg = temps.length ? Number((temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1)) : null;
  const total = precs.length ? Number(precs.reduce((a, b) => a + b, 0).toFixed(1)) : null;
  // Predominant icon by code frequency
  const codeCount = new Map<number, number>();
  daily.forEach(d => {
    if (d.conditions.code != null) codeCount.set(d.conditions.code, (codeCount.get(d.conditions.code) || 0) + 1);
  });
  let predominant = 'Mixed';
  if (codeCount.size > 0) {
    const best = Array.from(codeCount.entries()).sort((a, b) => b[1] - a[1])[0][0];
    predominant = openMeteoIconAndDesc(best).description;
  }
  return { averageTemp: avg, totalPrecipitation: total, predominantCondition: predominant };
}

function computeSources(daily: WeatherData[]): CacheSources {
  const result: CacheSources = {
    hasHistoricalAverage: false,
    hasForecast: false,
    hasRecorded: false
  };
  daily.forEach(d => {
    if (d.dataSource === 'historical-average') {
      result.hasHistoricalAverage = true;
    }
    if (d.isForecast || (d.dataSource === 'open-meteo' && !d.isHistorical)) {
      result.hasForecast = true;
    }
    if (d.isHistorical && d.dataSource === 'open-meteo') {
      result.hasRecorded = true;
    }
  });
  return result;
}

function enumerateDateStrings(startISO: string, endISO: string): string[] {
  const start = parseISO(startISO);
  const end = parseISO(endISO);
  if (!isValid(start) || !isValid(end) || isAfter(start, end)) return [];
  const dates: string[] = [];
  let cursor = start;
  while (!isAfter(cursor, end)) {
    dates.push(toISODate(cursor));
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function findMissingDates(summary: WeatherSummary): string[] {
  return findMissingDatesForRange(summary.dailyWeather, summary.startDate, summary.endDate);
}

function findMissingDatesForRange(daily: WeatherData[], startISO: string, endISO: string): string[] {
  const want = enumerateDateStrings(startISO, endISO);
  if (want.length === 0) return [];
  const set = new Set(daily.map(d => d.date));
  return want.filter(date => !set.has(date));
}

function needsForecastRefresh(summary: WeatherSummary): boolean {
  const today = new Date();
  const todayISO = toISODate(today);
  const horizonISO = toISODate(addDays(new Date(today.getFullYear(), today.getMonth(), today.getDate()), 16));
  return summary.dailyWeather.some(d => {
    if (d.dataSource !== 'historical-average') return false;
    return d.date >= todayISO && d.date <= horizonISO;
  });
}

async function fetchOpenMeteoDaily(
  coords: [number, number],
  startISO: string,
  endISO: string,
  endpoint: 'forecast' | 'archive'
): Promise<WeatherData[]> {
  const [lat, lon] = coords;
  log('fetchOpenMeteoDaily:start', { endpoint, lat, lon, startISO, endISO });
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lon.toString(),
    daily: [
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_sum',
      'precipitation_probability_mean',
      'windspeed_10m_max',
      'winddirection_10m_dominant',
      'weathercode',
      'cloudcover_mean'
    ].join(','),
    timezone: 'UTC',
    start_date: startISO,
    end_date: endISO
  });
  const base = endpoint === 'archive'
    ? 'https://historical-forecast-api.open-meteo.com/v1/forecast'
    : 'https://api.open-meteo.com/v1/forecast';
  const url = `${base}?${params.toString()}`;
  try {
    const res = await rateLimitedFetch(url);
    if (!res.ok) {
      log('fetchOpenMeteoDaily:non-ok', { status: res.status, statusText: res.statusText, endpoint, lat, lon, startISO, endISO });
      return [];
    }
    const json = await res.json();

    const dates: string[] = json.daily?.time || [];
    const tmax: Array<number | null> = json.daily?.temperature_2m_max || [];
    const tmin: Array<number | null> = json.daily?.temperature_2m_min || [];
    const prec: Array<number | null> = json.daily?.precipitation_sum || [];
    const precProb: Array<number | null> = json.daily?.precipitation_probability_mean || [];
    const wind: Array<number | null> = json.daily?.windspeed_10m_max || [];
    const windDir: Array<number | null> = json.daily?.winddirection_10m_dominant || [];
    const weatherCode: Array<number | null> = json.daily?.weathercode || [];
    const cloud: Array<number | null> = json.daily?.cloudcover_mean || [];

    const today = new Date();
    const result = dates.map((d, idx) => {
      const code = weatherCode[idx] ?? null;
      const { icon, description } = openMeteoIconAndDesc(code);
      const dateObj = parseISO(d);
      const expSecs = expirationForDate(dateObj, today);
      const w: WeatherData = {
        id: `${lat.toFixed(4)}_${lon.toFixed(4)}_${d}`,
        date: d,
        coordinates: [lat, lon],
        temperature: {
          min: tmin[idx] ?? null,
          max: tmax[idx] ?? null,
          average: tmax[idx] != null && tmin[idx] != null ? Number((((tmax[idx] as number) + (tmin[idx] as number)) / 2).toFixed(1)) : (tmax[idx] ?? tmin[idx] ?? null)
        },
        precipitation: {
          total: prec[idx] ?? null,
          probability: precProb[idx] ?? null
        },
        wind: {
          speed: wind[idx] ?? null,
          direction: windDir[idx] ?? null
        },
        conditions: {
          description,
          icon,
          code,
          cloudCover: cloud[idx] ?? null,
          humidity: null
        },
        isHistorical: endpoint === 'archive' || isBefore(dateObj, today),
        isForecast: endpoint === 'forecast' && !isBefore(dateObj, today),
        dataSource: 'open-meteo',
        fetchedAt: new Date().toISOString(),
        expiresAt: expSecs === Infinity ? undefined : new Date(Date.now() + expSecs * 1000).toISOString()
      };
      return w;
    });
    log('fetchOpenMeteoDaily:success', { endpoint, count: result.length, lat, lon, startISO, endISO });
    return result;
  } catch {
    log('fetchOpenMeteoDaily:error', { endpoint, lat, lon, startISO, endISO });
    return [];
  }
}

async function fetchOpenMeteoRangeSmart(coords: [number, number], startISO: string, endISO: string): Promise<WeatherData[]> {
  log('rangeSmart:start', { coords, startISO, endISO });
  const start = parseISO(startISO);
  const end = parseISO(endISO);
  if (!isValid(start) || !isValid(end) || isAfter(start, end)) return [];

  const today = new Date();
  const archiveEnd = addDays(new Date(today.getFullYear(), today.getMonth(), today.getDate()), -5);
  const forecastStart = addDays(archiveEnd, 1);
  const forecastMaxEnd = addDays(new Date(today.getFullYear(), today.getMonth(), today.getDate()), 16);

  const parts: WeatherData[] = [];

  // Archive segment
  if (!isAfter(start, archiveEnd)) {
    const aStart = start;
    const aEnd = isAfter(end, archiveEnd) ? archiveEnd : end;
    log('rangeSmart:archive-segment', { start: toISODate(aStart), end: toISODate(aEnd) });
    const list = await fetchOpenMeteoDaily(coords, toISODate(aStart), toISODate(aEnd), 'archive');
    parts.push(...list);
  }

  // Forecast segment
  const fStartCandidate = isAfter(start, forecastStart) ? start : forecastStart;
  if (!isAfter(fStartCandidate, end)) {
    const fStart = fStartCandidate;
    const fEnd = isAfter(end, forecastMaxEnd) ? forecastMaxEnd : end;
    if (!isAfter(fStart, fEnd)) {
      log('rangeSmart:forecast-segment', { start: toISODate(fStart), end: toISODate(fEnd) });
      const list = await fetchOpenMeteoDaily(coords, toISODate(fStart), toISODate(fEnd), 'forecast');
      parts.push(...list);
    }
  }

  const seen = new Set<string>();
  const sorted = parts
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter(d => (seen.has(d.date) ? false : (seen.add(d.date), true)));
  log('rangeSmart:done', { total: sorted.length });
  return sorted;
}

function safeDate(year: number, month: number, day: number): Date {
  // month is 0-based
  const d = new Date(Date.UTC(year, month, day));
  // If invalid (e.g., Feb 29 non-leap), fallback to Feb 28
  if (isNaN(d.getTime())) {
    return new Date(Date.UTC(year, month, Math.max(1, day - 1)));
  }
  return d;
}

function daysBetweenInclusive(start: Date, end: Date): number {
  const s = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const e = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  const ms = e.getTime() - s.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000)) + 1;
}

async function computeHistoricalAverage(
  coords: [number, number],
  startISO: string,
  endISO: string,
  yearsBack = 10
): Promise<WeatherData[]> {
  log('histAvg:start', { coords, startISO, endISO, yearsBack });
  const start = parseISO(startISO);
  const end = parseISO(endISO);
  if (!isValid(start) || !isValid(end) || isAfter(start, end)) return [];

  const numDays = daysBetweenInclusive(start, end);
  const accum: Array<{
    temps: number[];
    tmax: number[];
    tmin: number[];
    prec: number[];
    precProb: number[];
    wind: number[];
    windDir: number[];
    codes: number[];
    cloud: number[];
  }> = Array.from({ length: numDays }, () => ({
    temps: [], tmax: [], tmin: [], prec: [], precProb: [], wind: [], windDir: [], codes: [], cloud: []
  }));

  const targetDates: Date[] = Array.from({ length: numDays }, (_, i) => addDays(start, i));

  const today = new Date();
  const baseYear = today.getUTCFullYear();
  let usedYears = 0;

  for (let y = 1; y <= yearsBack; y++) {
    const year = baseYear - y;
    // Map range to this year, handling year-crossing by reconstructing dates per offset
    const yStart = safeDate(year, start.getUTCMonth(), start.getUTCDate());
    const yEnd = safeDate(year, end.getUTCMonth(), end.getUTCDate());
    const list = await fetchOpenMeteoDaily(coords, toISODate(yStart), toISODate(yEnd), 'archive');
    if (list.length === 0) continue;
    usedYears++;
    log('histAvg:year-usable', { year, count: list.length });
    // Align by offset from start
    const mapByDate = new Map<string, WeatherData>();
    list.forEach(d => mapByDate.set(d.date, d));
    targetDates.forEach((td, idx) => {
      const d = safeDate(year, td.getUTCMonth(), td.getUTCDate());
      const key = toISODate(d);
      const w = mapByDate.get(key);
      if (!w) return;
      if (w.temperature.average != null) accum[idx].temps.push(w.temperature.average);
      if (w.temperature.max != null) accum[idx].tmax.push(w.temperature.max);
      if (w.temperature.min != null) accum[idx].tmin.push(w.temperature.min);
      if (w.precipitation.total != null) accum[idx].prec.push(w.precipitation.total);
      if (w.precipitation.probability != null) accum[idx].precProb.push(w.precipitation.probability);
      if (w.wind.speed != null) accum[idx].wind.push(w.wind.speed);
      if (w.wind.direction != null) accum[idx].windDir.push(w.wind.direction);
      if (w.conditions.code != null) accum[idx].codes.push(w.conditions.code);
      if (w.conditions.cloudCover != null) accum[idx].cloud.push(w.conditions.cloudCover);
    });
  }

  if (usedYears === 0) return [];

  const [lat, lon] = coords;
  const result = targetDates.map((td, idx) => {
    const bucket = accum[idx];
    const avg = (arr: number[]) => arr.length ? Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1)) : null;
    // predominant weather code
    let code: number | null = null;
    if (bucket.codes.length) {
      const m = new Map<number, number>();
      bucket.codes.forEach(c => m.set(c, (m.get(c) || 0) + 1));
      code = Array.from(m.entries()).sort((a, b) => b[1] - a[1])[0][0];
    }
    const { icon, description } = openMeteoIconAndDesc(code);
    const dateStr = toISODate(td);
    const isFuture = isAfter(td, today);
    let expiresAt: string | undefined;
    if (isFuture) {
      const expiryDate = addDays(td, -15);
      expiresAt = isAfter(expiryDate, today) ? expiryDate.toISOString() : new Date().toISOString();
    }
    const w: WeatherData = {
      id: `${lat.toFixed(4)}_${lon.toFixed(4)}_${dateStr}`,
      date: dateStr,
      coordinates: [lat, lon],
      temperature: {
        min: avg(bucket.tmin),
        max: avg(bucket.tmax),
        average: avg(bucket.temps) ?? avg(bucket.tmax.length && bucket.tmin.length ? [avg(bucket.tmax)!, avg(bucket.tmin)!] : [])
      },
      precipitation: {
        total: avg(bucket.prec),
        probability: avg(bucket.precProb)
      },
      wind: { speed: avg(bucket.wind), direction: avg(bucket.windDir) },
      conditions: { description, icon, code, cloudCover: avg(bucket.cloud), humidity: null },
      isHistorical: true,
      isForecast: false,
      dataSource: 'historical-average',
      fetchedAt: new Date().toISOString(),
      expiresAt
    };
    return w;
  });
  log('histAvg:done', { usedYears, produced: result.length });
  return result;
}

class WeatherService {
  async getWeatherForLocation(location: Location): Promise<WeatherSummary> {
    const start = location.date ? new Date(location.date) : new Date();
    const end = location.endDate ? new Date(location.endDate) : start;
    const clampedStart = start;
    const clampedEnd = end;
    const startISO = toISODate(clampedStart);
    const endISO = toISODate(clampedEnd);
    const key = buildCacheKey(location.coordinates, startISO, endISO);

    const cached = await readCache(key);
    const now = new Date();
    const todayISO = toISODate(now);
    if (cached) {
      const reasons: string[] = [];
      const hasMetadata = cached.fetchedAt !== LEGACY_FETCHED_AT;
      if (!hasMetadata) reasons.push('legacy-entry');
      const hasData = cached.summary.dailyWeather.length > 0;
      if (!hasData) reasons.push('empty');
      const todayEntry = cached.summary.dailyWeather.find(d => d.date === todayISO);
      const isTodayValid = todayEntry ? (!todayEntry.expiresAt || isAfter(parseISO(todayEntry.expiresAt), now)) : true;
      if (!isTodayValid) reasons.push('expired-today');
      const missingDates = findMissingDates(cached.summary);
      if (missingDates.length > 0) reasons.push('missing-dates');
      const forecastRefreshNeeded = needsForecastRefresh(cached.summary);
      if (forecastRefreshNeeded) reasons.push('needs-forecast');

      if (hasData && isTodayValid && missingDates.length === 0 && !forecastRefreshNeeded && hasMetadata) {
        log('cache:hit', { key, count: cached.summary.dailyWeather.length });
        return {
          ...cached.summary,
          summary: summarize(cached.summary.dailyWeather)
        };
      }
      log('cache:skip', { key, reasons });
    }

    let fetched = await fetchOpenMeteoRangeSmart(location.coordinates, startISO, endISO);
    if (fetched.length === 0) {
      // fallback to historical averages for far-future planning
      log('fallback:histAvg', { locationId: location.id, startISO, endISO });
      fetched = await computeHistoricalAverage(location.coordinates, startISO, endISO, 10);
    }

    if (fetched.length > 0) {
      const missingDates = findMissingDatesForRange(fetched, startISO, endISO);
      if (missingDates.length > 0) {
        log('fill:histAvg-missing', { key, count: missingDates.length });
        const hist = await computeHistoricalAverage(location.coordinates, startISO, endISO, 10);
        if (hist.length > 0) {
          const missingSet = new Set(missingDates);
          const map = new Map(fetched.map(d => [d.date, d] as const));
          hist.forEach(item => {
            if (missingSet.has(item.date) && !map.has(item.date)) {
              map.set(item.date, item);
            }
          });
          fetched = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
        } else {
          log('fill:histAvg-missing-failed', { key, count: missingDates.length });
        }
      }
    }

    if (fetched.length === 0) {
      log('fetch:failed-no-data', { key });
    }
    const summary: WeatherSummary = {
      locationId: location.id,
      startDate: startISO,
      endDate: endISO,
      dailyWeather: fetched,
      summary: summarize(fetched)
    };
    if (fetched.length > 0) {
      await writeCache(key, summary);
      log('cache:write', { key, count: fetched.length });
    } else {
      log('cache:not-written-empty', { key });
    }
    return summary;
  }

  async getWeatherForDate(coords: [number, number], date: Date): Promise<WeatherData> {
    const dayISO = toISODate(date);
    let list = await fetchOpenMeteoRangeSmart(coords, dayISO, dayISO);
    if (list.length === 0) {
      log('fallback:histAvg:single', { coords, dayISO });
      list = await computeHistoricalAverage(coords, dayISO, dayISO, 10);
    }
    return list[0];
  }

  async getWeatherForecast(coords: [number, number], days: number): Promise<WeatherData[]> {
    const start = new Date();
    const end = addDays(start, Math.max(1, Math.min(16, days)) - 1);
    return fetchOpenMeteoRangeSmart(coords, toISODate(start), toISODate(end));
  }
}

export const weatherService = new WeatherService();
