import { NextRequest, NextResponse } from 'next/server';
import { loadUnifiedTripData, saveUnifiedTripData } from '@/app/lib/unifiedDataService';

interface MoveExpenseRequest {
  tripId: string;
  expenseId: string;
  fromTravelItemId: string;
  toTravelItemId: string;
  toTravelItemType: 'location' | 'accommodation' | 'route';
  description?: string;
}

interface TripData {
  travelData?: {
    locations?: Array<{ id: string; name: string; costTrackingLinks?: Array<{ expenseId: string; description?: string }> }>;
    routes?: Array<{
      id: string;
      from: string;
      to: string;
      costTrackingLinks?: Array<{ expenseId: string; description?: string }>;
      subRoutes?: Array<{
        id: string;
        from: string;
        to: string;
        costTrackingLinks?: Array<{ expenseId: string; description?: string }>;
      }>;
    }>;
  };
  accommodations?: Array<{ id: string; name: string; costTrackingLinks?: Array<{ expenseId: string; description?: string }> }>;
  costData?: {
    expenses?: Array<{ id: string; [key: string]: unknown }>;
  };
}

const findRouteItem = (tripData: TripData, travelItemId: string) => {
  if (!tripData.travelData?.routes) return null;

  for (const route of tripData.travelData.routes) {
    if (route.id === travelItemId) {
      return route;
    }
    const subRoute = route.subRoutes?.find(segment => segment.id === travelItemId);
    if (subRoute) {
      return subRoute;
    }
  }

  return null;
};

// Helper function to find travel item by ID and type
function findTravelItem(tripData: TripData, travelItemId: string, travelItemType: string) {
  switch (travelItemType) {
    case 'location':
      return tripData.travelData?.locations?.find(item => item.id === travelItemId);
    case 'accommodation':
      return tripData.accommodations?.find(item => item.id === travelItemId);
    case 'route':
      return findRouteItem(tripData, travelItemId);
    default:
      return null;
  }
}

// Helper function to remove expense link from all travel items
function removeExpenseLinkFromAll(tripData: TripData, expenseId: string) {
  // Remove from locations
  if (tripData.travelData?.locations) {
    tripData.travelData.locations.forEach(location => {
      if (location.costTrackingLinks) {
        location.costTrackingLinks = location.costTrackingLinks.filter(
          link => link.expenseId !== expenseId
        );
      }
    });
  }

  // Remove from accommodations
  if (tripData.accommodations) {
    tripData.accommodations.forEach(accommodation => {
      if (accommodation.costTrackingLinks) {
        accommodation.costTrackingLinks = accommodation.costTrackingLinks.filter(
          link => link.expenseId !== expenseId
        );
      }
    });
  }

  // Remove from routes
  if (tripData.travelData?.routes) {
    tripData.travelData.routes.forEach(route => {
      if (route.costTrackingLinks) {
        route.costTrackingLinks = route.costTrackingLinks.filter(
          link => link.expenseId !== expenseId
        );
      }

      if (route.subRoutes) {
        route.subRoutes.forEach(segment => {
          if (segment.costTrackingLinks) {
            segment.costTrackingLinks = segment.costTrackingLinks.filter(
              link => link.expenseId !== expenseId
            );
          }
        });
      }
    });
  }
}

// Helper function to add link to travel item
function addLinkToTravelItem(travelItem: { costTrackingLinks?: Array<{ expenseId: string; description?: string }> }, expenseId: string, description?: string) {
  if (!travelItem.costTrackingLinks) {
    travelItem.costTrackingLinks = [];
  }
  
  const newLink: { expenseId: string; description?: string } = { expenseId };
  if (description) {
    newLink.description = description;
  }
  
  travelItem.costTrackingLinks.push(newLink);
}

export async function POST(request: NextRequest) {
  try {
    const body: MoveExpenseRequest = await request.json();
    const { tripId, expenseId, fromTravelItemId, toTravelItemId, toTravelItemType, description } = body;

    // Validation
    if (!tripId || !expenseId || !fromTravelItemId || !toTravelItemId || !toTravelItemType) {
      return NextResponse.json({ 
        success: false, 
        error: 'VALIDATION_ERROR' 
      }, { status: 400 });
    }

    // Load trip data
    const tripData = await loadUnifiedTripData(tripId);
    if (!tripData) {
      return NextResponse.json({ 
        success: false, 
        error: 'TRIP_NOT_FOUND' 
      }, { status: 404 });
    }

    // Check if expense exists
    const expenseExists = tripData.costData?.expenses?.some(expense => expense.id === expenseId);
    if (!expenseExists) {
      return NextResponse.json({ 
        success: false, 
        error: 'EXPENSE_NOT_FOUND' 
      }, { status: 404 });
    }

    // Check if destination travel item exists
    const toTravelItem = findTravelItem(tripData, toTravelItemId, toTravelItemType);
    if (!toTravelItem) {
      return NextResponse.json({ 
        success: false, 
        error: 'TRAVEL_ITEM_NOT_FOUND' 
      }, { status: 404 });
    }

    // Remove the expense link from all travel items (including the source)
    removeExpenseLinkFromAll(tripData, expenseId);

    // Add the link to the destination travel item
    addLinkToTravelItem(toTravelItem, expenseId, description);

    // Save the updated data
    await saveUnifiedTripData(tripData);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error moving expense link:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'VALIDATION_ERROR' 
    }, { status: 500 });
  }
}