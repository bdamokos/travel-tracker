import fs from 'fs/promises';
import path from 'path';
import { addDays, differenceInCalendarDays, formatISO, isAfter, isBefore, isValid, parseISO } from 'date-fns';
import { Location } from '@/app/types';
import { WeatherData, WeatherSummary } from '@/app/types/weather';

type CacheEntry = {
  key: string;
  summary: WeatherSummary;
};

const DATA_DIR = path.join(process.cwd(), 'data', 'weather');

const RATE_LIMIT_MS = 1000; // 1 req/sec conservative
let lastRequestTime = 0;

async function ensureDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
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
  return fetch(url, { headers: { 'Accept': 'application/json' } });
}

async function readCache(key: string): Promise<WeatherSummary | null> {
  try {
    await ensureDir();
    const file = path.join(DATA_DIR, `${key}.json`);
    const raw = await fs.readFile(file, 'utf-8');
    const parsed = JSON.parse(raw) as CacheEntry;
    // Filter out expired per-day entries
    const today = new Date();
    const filtered = parsed.summary.dailyWeather.filter(d => {
      if (!d.expiresAt) return true;
      const exp = parseISO(d.expiresAt);
      return isValid(exp) && isAfter(exp, today);
    });
    return { ...parsed.summary, dailyWeather: filtered };
  } catch {
    return null;
  }
}

async function writeCache(key: string, summary: WeatherSummary): Promise<void> {
  await ensureDir();
  const file = path.join(DATA_DIR, `${key}.json`);
  const entry: CacheEntry = { key, summary };
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

async function fetchOpenMeteoDaily(
  coords: [number, number],
  startISO: string,
  endISO: string,
  endpoint: 'forecast' | 'archive'
): Promise<WeatherData[]> {
  const [lat, lon] = coords;
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
    timezone: 'auto',
    start_date: startISO,
    end_date: endISO
  });
  const base = endpoint === 'archive'
    ? 'https://archive-api.open-meteo.com/v1/archive'
    : 'https://api.open-meteo.com/v1/forecast';
  const url = `${base}?${params.toString()}`;
  try {
    const res = await rateLimitedFetch(url);
    if (!res.ok) return [];
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
    return dates.map((d, idx) => {
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
  } catch {
    return [];
  }
}

async function fetchOpenMeteoRangeSmart(coords: [number, number], startISO: string, endISO: string): Promise<WeatherData[]> {
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
    const list = await fetchOpenMeteoDaily(coords, toISODate(aStart), toISODate(aEnd), 'archive');
    parts.push(...list);
  }

  // Forecast segment
  const fStartCandidate = isAfter(start, forecastStart) ? start : forecastStart;
  if (!isAfter(fStartCandidate, end)) {
    const fStart = fStartCandidate;
    const fEnd = isAfter(end, forecastMaxEnd) ? forecastMaxEnd : end;
    if (!isAfter(fStart, fEnd)) {
      const list = await fetchOpenMeteoDaily(coords, toISODate(fStart), toISODate(fEnd), 'forecast');
      parts.push(...list);
    }
  }

  const seen = new Set<string>();
  const sorted = parts
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter(d => (seen.has(d.date) ? false : (seen.add(d.date), true)));
  return sorted;
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
    const todayISO = toISODate(new Date());
    if (cached) {
      // For today, ensure we have a non-expired entry; otherwise refetch
      const todayEntry = cached.dailyWeather.find(d => d.date === todayISO);
      const isTodayValid = todayEntry ? (!todayEntry.expiresAt || isAfter(parseISO(todayEntry.expiresAt), new Date())) : true;
      if (isTodayValid) {
        return {
          ...cached,
          summary: summarize(cached.dailyWeather)
        };
      }
    }

    const fetched = await fetchOpenMeteoRangeSmart(location.coordinates, startISO, endISO);
    const summary: WeatherSummary = {
      locationId: location.id,
      startDate: startISO,
      endDate: endISO,
      dailyWeather: fetched,
      summary: summarize(fetched)
    };
    await writeCache(key, summary);
    return summary;
  }

  async getWeatherForDate(coords: [number, number], date: Date): Promise<WeatherData> {
    const dayISO = toISODate(date);
    const list = await fetchOpenMeteoRangeSmart(coords, dayISO, dayISO);
    return list[0];
  }

  async getWeatherForecast(coords: [number, number], days: number): Promise<WeatherData[]> {
    const start = new Date();
    const end = addDays(start, Math.max(1, Math.min(16, days)) - 1);
    return fetchOpenMeteoRangeSmart(coords, toISODate(start), toISODate(end));
  }
}

export const weatherService = new WeatherService();

