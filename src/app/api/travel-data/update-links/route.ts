import { NextRequest, NextResponse } from 'next/server';
import { loadUnifiedTripData, updateTravelData } from '../../../lib/unifiedDataService';
import { CostTrackingLink } from '../../../types';
import { isAdminDomain } from '../../../lib/server-domains';

export async function POST(request: NextRequest) {
  try {
    // Check if request is from admin domain
    const isAdmin = await isAdminDomain();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    const { tripId, travelLinkInfo, expenseId } = await request.json();

    if (!tripId || !expenseId) {
      return NextResponse.json({ error: 'tripId and expenseId are required' }, { status: 400 });
    }

    const unifiedData = await loadUnifiedTripData(tripId);

    if (!unifiedData) {
      return NextResponse.json({ error: 'Trip data not found' }, { status: 404 });
    }

    // Ensure costTrackingLinks exist on all relevant items
    if (!unifiedData.travelData) {
      return NextResponse.json({ error: 'No travelData found in unifiedData' }, { status: 400 });
    }
    unifiedData.travelData.locations = unifiedData.travelData.locations?.map(loc => ({
      ...loc,
      costTrackingLinks: loc.costTrackingLinks || []
    })) || [];
    unifiedData.accommodations = unifiedData.accommodations?.map(acc => ({
      ...acc,
      costTrackingLinks: acc.costTrackingLinks || []
    })) || [];
    unifiedData.travelData.routes = unifiedData.travelData.routes?.map(route => ({
      ...route,
      costTrackingLinks: route.costTrackingLinks || []
    })) || [];

    // First, remove any existing links for this expenseId across all travel items
    unifiedData.travelData.locations.forEach(loc => {
      loc.costTrackingLinks = loc.costTrackingLinks?.filter(link => link.expenseId !== expenseId);
    });
    unifiedData.accommodations.forEach(acc => {
      acc.costTrackingLinks = acc.costTrackingLinks?.filter(link => link.expenseId !== expenseId);
    });
    unifiedData.travelData.routes.forEach(route => {
      route.costTrackingLinks = route.costTrackingLinks?.filter(link => link.expenseId !== expenseId);
    });

    // If a new travelLinkInfo is provided, add the link
    if (travelLinkInfo) {
      const newLink: CostTrackingLink = {
        expenseId: expenseId,
        description: travelLinkInfo.name // Use the name from TravelLinkInfo as description
      };

      if (travelLinkInfo.type === 'location') {
        const location = unifiedData.travelData.locations?.find(loc => loc.id === travelLinkInfo.id);
        if (location) {
          location.costTrackingLinks?.push(newLink);
        }
      } else if (travelLinkInfo.type === 'accommodation') {
        const accommodation = unifiedData.accommodations?.find(acc => acc.id === travelLinkInfo.id);
        if (accommodation) {
          accommodation.costTrackingLinks?.push(newLink);
        }
      } else if (travelLinkInfo.type === 'route') {
        const route = unifiedData.travelData.routes?.find(r => r.id === travelLinkInfo.id);
        if (route) {
          route.costTrackingLinks?.push(newLink);
        }
      }
    }

    await updateTravelData(tripId, unifiedData as unknown as Record<string, unknown>);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating travel links:', error);
    return NextResponse.json(
      { error: 'Failed to update travel links' },
      { status: 500 }
    );
  }
}
