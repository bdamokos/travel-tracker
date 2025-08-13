import { NextRequest, NextResponse } from 'next/server';
import { loadUnifiedTripData } from '@/app/lib/unifiedDataService';
import { filterTravelDataForServer } from '@/app/lib/serverPrivacyUtils';
import { computeNextSteps, matchRouteDestinationToLocation, safePublicLocation, safePublicRoute } from '@/app/lib/nextSteps';
import { weatherService } from '@/app/services/weatherService';
import { wikipediaService } from '@/app/services/wikipediaService';
import { Location, Transportation } from '@/app/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  try {
    const { tripId } = await params;
    if (!tripId) {
      return NextResponse.json({ error: 'tripId is required' }, { status: 400 });
    }

    const unified = await loadUnifiedTripData(tripId);
    if (!unified) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    const host = request.headers.get('host');
    const travelData = filterTravelDataForServer({
      id: unified.id,
      title: unified.title,
      description: unified.description,
      startDate: unified.startDate as unknown as Date,
      endDate: unified.endDate as unknown as Date,
      locations: (unified.travelData?.locations || []) as Location[],
      routes: (unified.travelData?.routes || []) as unknown as Transportation[],
    }, host);

    const { status, currentLocation, nextRoute, nextLocation } = computeNextSteps(
      travelData.locations || [],
      travelData.routes || [],
      unified.startDate,
      unified.endDate
    );

    // If a nextRoute exists but nextLocation is missing, try to match by name
    const inferredNextLocation = nextLocation || matchRouteDestinationToLocation(nextRoute as Transportation | null, travelData.locations || []);

    // Enrichments (best-effort)
    let weatherSummary: unknown = null;
    let wikipediaData: unknown = null;

    try {
      const target = currentLocation || inferredNextLocation || null;
      if (target && target.coordinates) {
        const startISO = (target.date instanceof Date ? target.date : new Date(target.date)).toISOString().slice(0, 10);
        const endDate = target.endDate ? (target.endDate instanceof Date ? target.endDate : new Date(target.endDate)) : (target.date instanceof Date ? target.date : new Date(target.date));
        const endISO = endDate.toISOString().slice(0, 10);
        const summary = await weatherService.getWeatherForLocation({
          id: target.id,
          name: target.name,
          coordinates: target.coordinates,
          date: new Date(startISO),
          endDate: new Date(endISO)
        } as Location);
        weatherSummary = summary;
      }
    } catch {}

    try {
      const target = currentLocation || inferredNextLocation || null;
      if (target) {
        const wiki = await wikipediaService.getLocationData(target as Location);
        wikipediaData = wiki || null;
      }
    } catch {}

    return NextResponse.json({
      trip: {
        id: unified.id,
        title: unified.title,
        startDate: unified.startDate,
        endDate: unified.endDate,
      },
      status,
      currentLocation: currentLocation ? safePublicLocation(currentLocation) : null,
      nextRoute: nextRoute ? safePublicRoute(nextRoute) : null,
      nextLocation: inferredNextLocation ? safePublicLocation(inferredNextLocation) : null,
      enrichments: {
        weather: weatherSummary,
        wikipedia: wikipediaData,
      }
    });
  } catch (err) {
    console.error('[NextStepsAPI] error', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}


