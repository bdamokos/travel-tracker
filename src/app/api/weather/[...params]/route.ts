import { NextRequest, NextResponse } from 'next/server';
import { weatherService } from '@/app/services/weatherService';
import { Location } from '@/app/types';

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
    const lat = parseFloat(sp.get('lat') || '');
    const lon = parseFloat(sp.get('lon') || '');
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return NextResponse.json({ success: false, error: 'lat and lon are required' }, { status: 400 });
    }

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
      if (!dateStr) return NextResponse.json({ success: false, error: 'date is required' }, { status: 400 });
      const weather = await weatherService.getWeatherForDate([lat, lon], new Date(dateStr));
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
      const days = Math.min(16, Math.max(1, parseInt(sp.get('days') || '7', 10)));
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
    const name = sp.get('name') || 'Location';
    const id = sp.get('id') || `${lat.toFixed(4)},${lon.toFixed(4)}`;
    const location: Location = {
      id,
      name,
      coordinates: [lat, lon],
      date: start ? new Date(start) : new Date(),
      endDate: end ? new Date(end) : undefined
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

