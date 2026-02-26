import { NextRequest, NextResponse } from 'next/server';

type OsrmProfile = 'car' | 'bike' | 'foot';

const DEFAULT_OSRM_BASE_URL = 'https://router.project-osrm.org';
const OSRM_TIMEOUT_MS = 15_000;
const ALLOWED_PROFILES: Set<OsrmProfile> = new Set(['car', 'bike', 'foot']);

const parseFinite = (value: string | null): number | null => {
  if (!value) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const isValidLatitude = (value: number): boolean => value >= -90 && value <= 90;
const isValidLongitude = (value: number): boolean => value >= -180 && value <= 180;

const getOsrmBaseUrl = (): string => {
  const configuredBaseUrl = process.env.OSRM_BASE_URL?.trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, '');
  }

  return DEFAULT_OSRM_BASE_URL;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const sp = request.nextUrl.searchParams;
  const rawProfile = sp.get('profile');
  const fromLat = parseFinite(sp.get('fromLat'));
  const fromLng = parseFinite(sp.get('fromLng'));
  const toLat = parseFinite(sp.get('toLat'));
  const toLng = parseFinite(sp.get('toLng'));

  if (!rawProfile || !ALLOWED_PROFILES.has(rawProfile as OsrmProfile)) {
    return NextResponse.json({ error: 'Invalid profile' }, { status: 400 });
  }

  if (
    fromLat === null ||
    fromLng === null ||
    toLat === null ||
    toLng === null ||
    !isValidLatitude(fromLat) ||
    !isValidLongitude(fromLng) ||
    !isValidLatitude(toLat) ||
    !isValidLongitude(toLng)
  ) {
    return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 });
  }

  const profile = rawProfile as OsrmProfile;
  const upstreamUrl = new URL(
    `/route/v1/${profile}/${fromLng},${fromLat};${toLng},${toLat}`,
    getOsrmBaseUrl()
  );
  upstreamUrl.searchParams.set('overview', 'full');
  upstreamUrl.searchParams.set('geometries', 'geojson');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);

  try {
    const upstreamResponse = await fetch(upstreamUrl.toString(), {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    const responseText = await upstreamResponse.text();
    let payload: unknown;

    try {
      payload = JSON.parse(responseText);
    } catch {
      payload = {
        error: 'Invalid upstream JSON response',
        upstreamStatus: upstreamResponse.status,
      };
    }

    return NextResponse.json(payload, {
      status: upstreamResponse.status,
      headers: {
        'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800',
      },
    });
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return NextResponse.json({ error: 'OSRM upstream timed out' }, { status: 504 });
    }

    console.warn('[OSRMProxy] upstream request failed:', error);
    return NextResponse.json({ error: 'OSRM upstream request failed' }, { status: 502 });
  } finally {
    clearTimeout(timeoutId);
  }
}
