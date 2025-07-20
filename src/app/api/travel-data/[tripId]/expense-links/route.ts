import { NextRequest, NextResponse } from 'next/server';
import { loadUnifiedTripData } from '../../../../lib/unifiedDataService';

interface ExpenseLink {
  expenseId: string;
  travelItemId: string;
  travelItemName: string;
  travelItemType: 'location' | 'accommodation' | 'route';
  description?: string;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  try {
    const { tripId } = await params;

    if (!tripId) {
      return NextResponse.json({ 
        error: 'Trip ID is required' 
      }, { status: 400 });
    }

    // Load trip data
    const tripData = await loadUnifiedTripData(tripId);
    if (!tripData) {
      return NextResponse.json({ 
        error: 'Trip not found' 
      }, { status: 404 });
    }

    const expenseLinks: ExpenseLink[] = [];

    // Collect links from locations
    if (tripData.travelData?.locations) {
      tripData.travelData.locations.forEach(location => {
        if (location.costTrackingLinks) {
          location.costTrackingLinks.forEach(link => {
            expenseLinks.push({
              expenseId: link.expenseId,
              travelItemId: location.id,
              travelItemName: location.name,
              travelItemType: 'location',
              description: link.description
            });
          });
        }
      });
    }

    // Collect links from accommodations
    if (tripData.accommodations) {
      tripData.accommodations.forEach(accommodation => {
        if (accommodation.costTrackingLinks) {
          accommodation.costTrackingLinks.forEach(link => {
            expenseLinks.push({
              expenseId: link.expenseId,
              travelItemId: accommodation.id,
              travelItemName: accommodation.name,
              travelItemType: 'accommodation',
              description: link.description
            });
          });
        }
      });
    }

    // Collect links from routes
    if (tripData.travelData?.routes) {
      tripData.travelData.routes.forEach(route => {
        if (route.costTrackingLinks) {
          route.costTrackingLinks.forEach(link => {
            expenseLinks.push({
              expenseId: link.expenseId,
              travelItemId: route.id,
              travelItemName: `${route.from} → ${route.to}`,
              travelItemType: 'route',
              description: link.description
            });
          });
        }
      });
    }

    return NextResponse.json(expenseLinks);

  } catch (error) {
    console.error('Error fetching expense links:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}