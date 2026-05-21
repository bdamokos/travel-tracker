import { NextRequest, NextResponse } from 'next/server';
import { isAdminHost } from '@/app/lib/server-domains';

type OsrmProfile = 'car' | 'bike' | 'foot';

const DEFAULT_OSRM_BASE_URL = 'https://router.project-osrm.org';
const OSRM_TIMEOUT_MS = 15_000;
const OSRM_PROFILE_PATHS = {
  car: 'car',
  bike: 'bike',
  foot: 'foot',
} as const satisfies Record<OsrmProfile, string>;

const parseFinite = (value: string | null): number | null => {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return null;
  }

  const parsed = Number(trimmedValue);
  return Number.isFinite(parsed) ? parsed : null;
};

const getOsrmProfilePath = (value: string | null): string | null => {
  if (!value || !Object.hasOwn(OSRM_PROFILE_PATHS, value)) {
    return null;
  }

  return OSRM_PROFILE_PATHS[value as OsrmProfile];
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

const normalizeHostForInternalCheck = (host: string | null): string => {
  const normalized = host?.trim().toLowerCase().replace(/\.$/, '') ?? '';
  const ipv6Match = normalized.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (ipv6Match) {
    return ipv6Match[1];
  }

  return normalized.replace(/:\d+$/, '');
};

const isLocalProxyHost = (host: string | null): boolean => {
  const hostname = normalizeHostForInternalCheck(host);
  return hostname === 'localhost' || hostname === '::1' || hostname === '127.0.0.1';
};

const getForwardedHost = (request: NextRequest): string | null => {
  const forwardedHost = request.headers.get('x-forwarded-host');
  return forwardedHost?.split(',')[0]?.trim() || null;
};

const hasTrustedForwardedHostSecret = (request: NextRequest): boolean => {
  const expectedSecret = process.env.ADMIN_PROXY_SECRET?.trim();
  if (!expectedSecret) {
    return false;
  }

  return request.headers.get('x-travel-tracker-admin-proxy-secret') === expectedSecret;
};

const isAdminOsrmRequest = (request: NextRequest): boolean => {
  const host = request.headers.get('host');
  if (isAdminHost(host)) {
    return true;
  }

  return (
    isLocalProxyHost(host) &&
    hasTrustedForwardedHostSecret(request) &&
    isAdminHost(getForwardedHost(request))
  );
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAdminOsrmRequest(request)) {
    return NextResponse.json({ error: 'Admin domain required' }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const rawProfile = sp.get('profile');
  const fromLat = parseFinite(sp.get('fromLat'));
  const fromLng = parseFinite(sp.get('fromLng'));
  const toLat = parseFinite(sp.get('toLat'));
  const toLng = parseFinite(sp.get('toLng'));
  const profilePath = getOsrmProfilePath(rawProfile);

  if (!profilePath) {
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

  const upstreamUrl = new URL(
    `/route/v1/${profilePath}/${fromLng},${fromLat};${toLng},${toLat}`,
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
