import { NextResponse } from 'next/server';
import { listAllTrips } from '@/app/lib/unifiedDataService';

export async function GET() {
  try {
    const trips = await listAllTrips();
    
    // Transform for travel interface (filter only trips with travel data)
    const travelTrips = trips
      .filter(trip => trip.hasTravel)
      .map(trip => ({
        id: trip.id,
        title: trip.title,
        description: '', // Not available in summary
        startDate: trip.startDate,
        endDate: trip.endDate,
        createdAt: trip.createdAt,
        locationCount: trip.locationCount,
        accommodationCount: trip.accommodationCount,
        routeCount: trip.routeCount
      }));
    
    return NextResponse.json(travelTrips);
  } catch (error) {
    console.error('Error listing travel data:', error);
    return NextResponse.json(
      { error: 'Failed to list travel data' },
      { status: 500 }
    );
  }
} 