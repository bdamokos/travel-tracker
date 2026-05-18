import { NextRequest, NextResponse } from 'next/server';
import {
  MAX_LOCATION_WEATHER_SPAN_DAYS,
  parseWeatherDateInput,
  weatherService
} from '@/app/services/weatherService';
import { Location } from '@/app/types';

const coordinatePattern = /^[-+]?(?:\d+\.?\d*|\.\d+)$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function badRequest(error: string): NextResponse {
  return NextResponse.json({ success: false, error }, { status: 400 });
}

function parseCoordinate(value: string | null, min: number, max: number): number | null {
  if (value == null || value.trim() !== value || !coordinatePattern.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function inclusiveDaySpan(start: Date, end: Date): number {
  const startMs = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endMs = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.floor((endMs - startMs) / MS_PER_DAY) + 1;
}

function parseForecastDays(value: string | null): number | null {
  if (value == null) return 7;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return null;
  return Math.min(16, parsed);
}

// GET /api/weather/[...params]
// Path options:
// - /api/weather/location?lat=..&lon=..&start=YYYY-MM-DD&end=YYYY-MM-DD&name=Paris&id=loc-123
// - /api/weather/date?lat=..&lon=..&date=YYYY-MM-DD
// - /api/weather/forecast?lat=..&lon=..&days=7
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ params: string[] }> }
) {
  try {
    const { params: pathParams } = await params;
    const segment = pathParams?.[0] || 'location';
    const sp = request.nextUrl.searchParams;
    const lat = parseCoordinate(sp.get('lat'), -90, 90);
    const lon = parseCoordinate(sp.get('lon'), -180, 180);
    if (lat == null || lon == null) return badRequest('lat and lon must be finite coordinates in valid ranges');

    // Server log request
    console.log('[WeatherAPI]', segment, {
      lat,
      lon,
      start: sp.get('start'),
      end: sp.get('end'),
      date: sp.get('date'),
      days: sp.get('days'),
      name: sp.get('name'),
      id: sp.get('id')
    });

    if (segment === 'date') {
      const dateStr = sp.get('date');
      if (!dateStr) return badRequest('date is required');
      const date = parseWeatherDateInput(dateStr);
      if (!date) return badRequest('date must use YYYY-MM-DD');
      const weather = await weatherService.getWeatherForDate([lat, lon], date);
      return NextResponse.json(
        { success: true, data: { dailyWeather: [weather] } },
        {
          headers: {
            // Weather for a specific day changes rarely; cache for 6 hours at CDN
            'Cache-Control': 'public, max-age=0, s-maxage=21600, stale-while-revalidate=86400'
          }
        }
      );
    }
    
    if (segment === 'forecast') {
      const days = parseForecastDays(sp.get('days'));
      if (days == null) return badRequest('days must be a positive integer');
      const list = await weatherService.getWeatherForecast([lat, lon], days);
      return NextResponse.json(
        { success: true, data: { dailyWeather: list } },
        {
          headers: {
            // Forecast updates a few times a day; cache 30 minutes at CDN
            'Cache-Control': 'public, max-age=0, s-maxage=1800, stale-while-revalidate=86400'
          }
        }
      );
    }

    // default: location range
    const start = sp.get('start');
    const end = sp.get('end');
    const startDate = start ? parseWeatherDateInput(start) : new Date();
    const endDate = end ? parseWeatherDateInput(end) : startDate;
    if (!startDate) return badRequest('start must use YYYY-MM-DD');
    if (!endDate) return badRequest('end must use YYYY-MM-DD');
    const spanDays = inclusiveDaySpan(startDate, endDate);
    if (spanDays < 1) return badRequest('start must be before or equal to end');
    if (spanDays > MAX_LOCATION_WEATHER_SPAN_DAYS) {
      return badRequest(`Weather date range cannot exceed ${MAX_LOCATION_WEATHER_SPAN_DAYS} days`);
    }
    const name = sp.get('name') || 'Location';
    const id = sp.get('id') || `${lat.toFixed(4)},${lon.toFixed(4)}`;
    const location: Location = {
      id,
      name,
      coordinates: [lat, lon],
      date: startDate,
      endDate: end ? endDate : undefined
    } as Location;
    const summary = await weatherService.getWeatherForLocation(location);
    console.log('[WeatherAPI] result', { count: summary.dailyWeather.length });
    return NextResponse.json(
      { success: true, data: summary },
      {
        headers: {
          // Range queries combine historical/forecast; cache 2 hours at CDN
          'Cache-Control': 'public, max-age=0, s-maxage=7200, stale-while-revalidate=86400'
        }
      }
    );
  } catch (err) {
    console.error('[WeatherAPI] error', err);
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
