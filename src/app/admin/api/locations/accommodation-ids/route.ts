import { NextRequest, NextResponse } from 'next/server';
import { loadUnifiedTripData, saveUnifiedTripData } from '../../../../lib/unifiedDataService';
import { isAdminDomain } from '../../../../lib/server-domains';

export async function PATCH(request: NextRequest) {
  try {
    const isAdmin = await isAdminDomain();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const tripId = body?.tripId;
    const locationId = body?.locationId;
    const accommodationIds = body?.accommodationIds;

    if (typeof tripId !== 'string' || !tripId) {
      return NextResponse.json({ error: 'tripId is required' }, { status: 400 });
    }

    if (typeof locationId !== 'string' || !locationId || locationId === 'temp-location') {
      return NextResponse.json({ error: 'locationId is required' }, { status: 400 });
    }

    if (!Array.isArray(accommodationIds) || accommodationIds.some((id: unknown) => typeof id !== 'string')) {
      return NextResponse.json({ error: 'accommodationIds must be an array of strings' }, { status: 400 });
    }

    const tripData = await loadUnifiedTripData(tripId);
    if (!tripData) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    let updated = false;

    if (tripData.travelData?.locations) {
      tripData.travelData.locations = tripData.travelData.locations.map(location => {
        if (location.id !== locationId) return location;
        updated = true;
        return { ...location, accommodationIds };
      });
    }

    if (tripData.travelData?.days) {
      tripData.travelData.days = tripData.travelData.days.map(day => ({
        ...day,
        locations: (day.locations || []).map(location => {
          if (location.id !== locationId) return location;
          updated = true;
          return { ...location, accommodationIds };
        })
      }));
    }

    if (!updated) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 });
    }

    await saveUnifiedTripData(tripData);

    return NextResponse.json({ success: true, locationId, accommodationIds });
  } catch (error) {
    console.error('Error updating location accommodationIds:', error);
    return NextResponse.json({ error: 'Failed to update location accommodationIds' }, { status: 500 });
  }
}

