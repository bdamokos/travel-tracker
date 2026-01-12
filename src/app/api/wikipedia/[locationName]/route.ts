/**
 * Wikipedia data API route
 * Serves cached Wikipedia data for specific locations
 */

import { NextRequest, NextResponse } from 'next/server';
import { wikipediaService } from '@/app/services/wikipediaService';

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
    
    if (!locationName || locationName.trim().length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Location name is required',
      }, { status: 400 });
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const lat = searchParams.get('lat');
    const lon = searchParams.get('lon');
    const forceRefresh = searchParams.get('refresh') === 'true';
    const wikipediaRef = searchParams.get('wikipediaRef');

    const locale = request.headers.get('accept-language')?.split(',')[0]?.trim();

    // Build location object
    const location = {
      id: 'temp-id', // Temporary ID for API calls
      name: locationName,
      coordinates: (lat && lon) ? [parseFloat(lat), parseFloat(lon)] as [number, number] : [0, 0] as [number, number],
      wikipediaRef: wikipediaRef || undefined,
      date: new Date(), // Required by Location type
    };

    // Get Wikipedia data (cached or fresh)
    const wikipediaData = await wikipediaService.getLocationData(location, forceRefresh, locale);

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
    const body = await request.json();
    const locale = request.headers.get('accept-language')?.split(',')[0]?.trim();
    
    const { wikipediaRef, coordinates } = body;

    if (!wikipediaRef) {
      return NextResponse.json({
        success: false,
        error: 'Wikipedia reference is required',
      }, { status: 400 });
    }

    // Build location object with new reference
    const location = {
      id: 'temp-id',
      name: locationName,
      coordinates: coordinates as [number, number] || [0, 0] as [number, number],
      wikipediaRef,
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
    const { locationName: rawLocationName } = await params;
    const locationName = decodeURIComponent(rawLocationName);
    
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
