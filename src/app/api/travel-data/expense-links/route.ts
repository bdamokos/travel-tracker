import { NextRequest, NextResponse } from 'next/server';
import { loadUnifiedTripData, saveUnifiedTripData } from '../../../lib/unifiedDataService';
import { Transportation, TravelReference } from '../../../types';

interface LinkExpenseRequest {
  tripId: string;
  expenseId: string;
  travelItemId: string;
  travelItemType: 'location' | 'accommodation' | 'route';
  description?: string;
}

interface LinkExpenseResponse {
  success: boolean;
  error?: 'DUPLICATE_LINK' | 'EXPENSE_NOT_FOUND' | 'TRAVEL_ITEM_NOT_FOUND' | 'VALIDATION_ERROR';
  existingLink?: {
    travelItemId: string;
    travelItemName: string;
    travelItemType: string;
  };
}

interface UnlinkExpenseRequest {
  tripId: string;
  expenseId: string;
  travelItemId: string;
}

interface TripData {
  travelData?: {
    locations?: Array<{ id: string; name: string; costTrackingLinks?: Array<{ expenseId: string; description?: string }> }>;
    routes?: Array<{ id: string; from: string; to: string; costTrackingLinks?: Array<{ expenseId: string; description?: string }> }>;
  };
  accommodations?: Array<{ id: string; name: string; costTrackingLinks?: Array<{ expenseId: string; description?: string }> }>;
  costData?: {
    expenses?: Array<{ id: string; [key: string]: unknown }>;
  };
}

// Helper function to find where an expense is currently linked
function findExistingExpenseLink(tripData: TripData, expenseId: string) {
  // Check locations
  if (tripData.travelData?.locations) {
    for (const location of tripData.travelData.locations) {
      if (location.costTrackingLinks?.some(link => link.expenseId === expenseId)) {
        return {
          travelItemId: location.id,
          travelItemName: location.name,
          travelItemType: 'location'
        };
      }
    }
  }

  // Check accommodations
  if (tripData.accommodations) {
    for (const accommodation of tripData.accommodations) {
      if (accommodation.costTrackingLinks?.some(link => link.expenseId === expenseId)) {
        return {
          travelItemId: accommodation.id,
          travelItemName: accommodation.name,
          travelItemType: 'accommodation'
        };
      }
    }
  }

  // Check routes
  if (tripData.travelData?.routes) {
    for (const route of tripData.travelData.routes) {
      if (route.costTrackingLinks?.some(link => link.expenseId === expenseId)) {
        return {
          travelItemId: route.id,
          travelItemName: `${route.from} → ${route.to}`,
          travelItemType: 'route'
        };
      }
    }
  }

  return null;
}

// Helper function to find travel item by ID and type  
function findTravelItem(tripData: TripData, travelItemId: string, travelItemType: string) {
  switch (travelItemType) {
    case 'location':
      return tripData.travelData?.locations?.find(item => item.id === travelItemId);
    case 'accommodation':
      return tripData.accommodations?.find(item => item.id === travelItemId);
    case 'route':
      return tripData.travelData?.routes?.find(item => item.id === travelItemId);
    default:
      return null;
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
    const body: LinkExpenseRequest = await request.json();
    const { tripId, expenseId, travelItemId, travelItemType, description } = body;

    // Validation
    if (!tripId || !expenseId || !travelItemId || !travelItemType) {
      return NextResponse.json({
        success: false,
        error: 'VALIDATION_ERROR'
      } as LinkExpenseResponse, { status: 400 });
    }

    // Load trip data
    const tripData = await loadUnifiedTripData(tripId);
    if (!tripData) {
      return NextResponse.json({
        success: false,
        error: 'TRAVEL_ITEM_NOT_FOUND'
      } as LinkExpenseResponse, { status: 404 });
    }

    // Check if expense exists
    const expenseExists = tripData.costData?.expenses?.some(expense => expense.id === expenseId);
    if (!expenseExists) {
      return NextResponse.json({
        success: false,
        error: 'EXPENSE_NOT_FOUND'
      } as LinkExpenseResponse, { status: 404 });
    }

    // Check if travel item exists
    const travelItem = findTravelItem(tripData, travelItemId, travelItemType);
    if (!travelItem) {
      return NextResponse.json({
        success: false,
        error: 'TRAVEL_ITEM_NOT_FOUND'
      } as LinkExpenseResponse, { status: 404 });
    }

    // Check for existing link
    const existingLink = findExistingExpenseLink(tripData, expenseId);
    if (existingLink) {
      return NextResponse.json({
        success: false,
        error: 'DUPLICATE_LINK',
        existingLink
      } as LinkExpenseResponse, { status: 409 });
    }

    // Add the link to the travel item (modern system)
    addLinkToTravelItem(travelItem, expenseId, description);

    // ALSO add/update the travelReference in the expense (legacy system) for maximum compatibility
    if (tripData.costData?.expenses) {
      const expense = tripData.costData.expenses.find(exp => exp.id === expenseId);
      if (expense) {
        // Create the travelReference based on the travel item type
        const itemName = 'name' in travelItem ? travelItem.name : `${(travelItem as Transportation).from} → ${(travelItem as Transportation).to}`;
        const travelReference: TravelReference = {
          type: travelItemType as 'location' | 'accommodation' | 'route',
          description: description || itemName
        };

        if (travelItemType === 'location') {
          travelReference.locationId = travelItemId;
        } else if (travelItemType === 'accommodation') {
          travelReference.accommodationId = travelItemId;
        } else if (travelItemType === 'route') {
          travelReference.routeId = travelItemId;
        }

        expense.travelReference = travelReference;
      }
    }

    // Save the updated data
    await saveUnifiedTripData(tripData);

    return NextResponse.json({
      success: true
    } as LinkExpenseResponse);

  } catch (error) {
    console.error('Error linking expense:', error);
    return NextResponse.json({
      success: false,
      error: 'VALIDATION_ERROR'
    } as LinkExpenseResponse, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body: UnlinkExpenseRequest = await request.json();
    const { tripId, expenseId, travelItemId } = body;

    // Validation
    if (!tripId || !expenseId || !travelItemId) {
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
        error: 'TRAVEL_ITEM_NOT_FOUND' 
      }, { status: 404 });
    }

    // Remove the specific link from the specified travel item (modern system)
    const allTravelItems = [
      ...(tripData.travelData?.locations || []),
      ...(tripData.accommodations || []),
      ...(tripData.travelData?.routes || [])
    ];

    const travelItem = allTravelItems.find(item => item.id === travelItemId);
    if (travelItem && travelItem.costTrackingLinks) {
      travelItem.costTrackingLinks = travelItem.costTrackingLinks.filter(
        link => link.expenseId !== expenseId
      );
    }

    // ALSO remove the travelReference from the expense (legacy system) for consistency
    if (tripData.costData?.expenses) {
      const expense = tripData.costData.expenses.find(exp => exp.id === expenseId);
      if (expense && expense.travelReference) {
        delete expense.travelReference;
      }
    }

    // Save the updated data
    await saveUnifiedTripData(tripData);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error unlinking expense:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'VALIDATION_ERROR' 
    }, { status: 500 });
  }
}