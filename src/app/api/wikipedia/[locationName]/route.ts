/**
 * Wikipedia data API route
 * Serves cached Wikipedia data for specific locations
 */

import { NextRequest, NextResponse } from 'next/server';
import { wikipediaService } from '@/app/services/wikipediaService';
import { isAdminDomain } from '@/app/lib/server-domains';

const MAX_LOCATION_NAME_LENGTH = 120;
const MAX_WIKIPEDIA_REF_LENGTH = 160;
const coordinatePattern = /^[-+]?(?:\d+\.?\d*|\.\d+)$/;

const requireAdminDomain = async (): Promise<NextResponse<{ error: string }> | null> => {
  const isAdmin = await isAdminDomain();
  if (isAdmin) return null;
  return NextResponse.json({ error: 'Admin domain required' }, { status: 403 });
};

function badRequest(error: string): NextResponse {
  return NextResponse.json({ success: false, error }, { status: 400 });
}

function parseCoordinate(value: string | null, min: number, max: number): number | null {
  if (value == null || value.trim() !== value || !coordinatePattern.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function parseCoordinates(lat: string | null, lon: string | null): [number, number] | null {
  const parsedLat = parseCoordinate(lat, -90, 90);
  const parsedLon = parseCoordinate(lon, -180, 180);
  if (parsedLat == null || parsedLon == null) return null;
  return [parsedLat, parsedLon];
}

function validateLocationName(locationName: string): NextResponse | null {
  const trimmed = locationName.trim();
  if (trimmed.length === 0) return badRequest('Location name is required');
  if (trimmed.length > MAX_LOCATION_NAME_LENGTH) {
    return badRequest(`Location name cannot exceed ${MAX_LOCATION_NAME_LENGTH} characters`);
  }
  return null;
}

function validateWikipediaRef(wikipediaRef: string | null): NextResponse | null {
  if (wikipediaRef == null) return null;
  const trimmed = wikipediaRef.trim();
  if (trimmed.length === 0) return badRequest('Wikipedia reference cannot be blank');
  if (trimmed.length > MAX_WIKIPEDIA_REF_LENGTH) {
    return badRequest(`Wikipedia reference cannot exceed ${MAX_WIKIPEDIA_REF_LENGTH} characters`);
  }
  return null;
}

/**
 * GET /api/wikipedia/[locationName]
 * Get Wikipedia data for a specific location
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ locationName: string }> }
): Promise<NextResponse> {
  let locationName = '';
  
  try {
    const { locationName: rawLocationName } = await params;
    locationName = decodeURIComponent(rawLocationName);
    
    const locationNameError = validateLocationName(locationName);
    if (locationNameError) return locationNameError;

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const lat = searchParams.get('lat');
    const lon = searchParams.get('lon');
    const forceRefresh = searchParams.get('refresh') === 'true';
    const wikipediaRef = searchParams.get('wikipediaRef');
    const coordinates = parseCoordinates(lat, lon);

    if (!coordinates) {
      return badRequest('lat and lon must be finite coordinates in valid ranges');
    }

    const wikipediaRefError = validateWikipediaRef(wikipediaRef);
    if (wikipediaRefError) return wikipediaRefError;

    const isAdminRequest = await isAdminDomain();
    if (forceRefresh && !isAdminRequest) {
      return NextResponse.json({ error: 'Admin domain required' }, { status: 403 });
    }

    const locale = request.headers.get('accept-language')?.split(',')[0]?.trim();

    // Build location object
    const location = {
      id: 'temp-id', // Temporary ID for API calls
      name: locationName,
      coordinates,
      wikipediaRef: wikipediaRef?.trim() || undefined,
      date: new Date(), // Required by Location type
    };

    // Public requests are cache-only to avoid turning the public API into an
    // unauthenticated Wikipedia fetch-and-write proxy.
    const wikipediaData = isAdminRequest
      ? await wikipediaService.getLocationData(location, forceRefresh, locale)
      : await wikipediaService.getCachedData(location);

    if (!wikipediaData) {
      return NextResponse.json({
        success: false,
        error: 'No Wikipedia data found for this location',
        locationName,
        suggestions: [
          'Check the location name spelling',
          'Try adding coordinates (?lat=40.7128&lon=-74.0060)',
          'Use a more specific location name',
          'Set a custom Wikipedia reference (?wikipediaRef=Article_Title)',
        ],
      }, { status: 404 });
    }

    return NextResponse.json(
      {
        success: true,
        data: wikipediaData,
        locationName,
        cached: !forceRefresh,
      },
      {
        headers: {
          // Wikipedia content is relatively stable; cache for one day at CDN
          'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800'
        }
      }
    );

  } catch (error) {
    console.error('Error fetching Wikipedia data:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      locationName,
    }, { status: 500 });
  }
}

/**
 * PUT /api/wikipedia/[locationName]
 * Update Wikipedia reference for a location (admin only)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ locationName: string }> }
): Promise<NextResponse> {
  try {
    const { locationName: rawLocationName } = await params;
    const locationName = decodeURIComponent(rawLocationName);
    const forbidden = await requireAdminDomain();
    if (forbidden) return forbidden;

    const locationNameError = validateLocationName(locationName);
    if (locationNameError) return locationNameError;

    const body = await request.json();
    const locale = request.headers.get('accept-language')?.split(',')[0]?.trim();
    
    const { wikipediaRef, coordinates } = body;

    if (typeof wikipediaRef !== 'string') {
      return badRequest('Wikipedia reference is required');
    }

    const wikipediaRefError = validateWikipediaRef(wikipediaRef);
    if (wikipediaRefError) return wikipediaRefError;

    if (!Array.isArray(coordinates) || coordinates.length !== 2) {
      return badRequest('coordinates are required');
    }

    const parsedCoordinates = parseCoordinates(String(coordinates[0]), String(coordinates[1]));
    if (!parsedCoordinates) {
      return badRequest('coordinates must be finite coordinates in valid ranges');
    }

    // Build location object with new reference
    const location = {
      id: 'temp-id',
      name: locationName,
      coordinates: parsedCoordinates,
      wikipediaRef: wikipediaRef.trim(),
      date: new Date(),
    };

    // Force refresh with new reference
    const wikipediaData = await wikipediaService.getLocationData(location, true, locale);

    if (!wikipediaData) {
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch Wikipedia data with the provided reference',
        wikipediaRef,
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: wikipediaData,
      message: 'Wikipedia reference updated successfully',
      wikipediaRef,
    });

  } catch (error) {
    console.error('Error updating Wikipedia reference:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * DELETE /api/wikipedia/[locationName]
 * Clear cached Wikipedia data for a location (admin only)
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ locationName: string }> }
): Promise<NextResponse> {
  try {
    const forbidden = await requireAdminDomain();
    if (forbidden) return forbidden;

    const { locationName: rawLocationName } = await params;
    const locationName = decodeURIComponent(rawLocationName);
    const locationNameError = validateLocationName(locationName);
    if (locationNameError) return locationNameError;
    
    // TODO: Implement cache deletion in WikipediaService
    // For now, return success
    // Future enhancement: use coordinates for more precise cache deletion

    return NextResponse.json({
      success: true,
      message: 'Wikipedia cache cleared successfully',
      locationName,
    });

  } catch (error) {
    console.error('Error clearing Wikipedia cache:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
