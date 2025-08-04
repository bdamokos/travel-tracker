import { NextRequest, NextResponse } from 'next/server';
import { loadUnifiedTripData, saveUnifiedTripData } from '../../../lib/unifiedDataService';
import { CostTrackingLink } from '../../../types';
import { isAdminDomain } from '../../../lib/server-domains';
import { validateTripBoundary, ValidationErrorType } from '../../../lib/tripBoundaryValidation';

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

    // First, remove any existing links for this expenseId across all travel items (modern system)
    unifiedData.travelData.locations.forEach(loc => {
      loc.costTrackingLinks = loc.costTrackingLinks?.filter(link => link.expenseId !== expenseId);
    });
    unifiedData.accommodations.forEach(acc => {
      acc.costTrackingLinks = acc.costTrackingLinks?.filter(link => link.expenseId !== expenseId);
    });
    unifiedData.travelData.routes.forEach(route => {
      route.costTrackingLinks = route.costTrackingLinks?.filter(link => link.expenseId !== expenseId);
    });

    // ALSO remove the travelReference from the expense (legacy system) for consistency
    if (unifiedData.costData?.expenses) {
      const expense = unifiedData.costData.expenses.find(exp => exp.id === expenseId);
      if (expense && expense.travelReference) {
        delete expense.travelReference;
      }
    }

    // If a new travelLinkInfo is provided, validate and add the link
    if (travelLinkInfo) {
      // Validate trip boundaries before creating the link
      const validation = validateTripBoundary(expenseId, travelLinkInfo.id, unifiedData);
      
      if (!validation.isValid) {
        const errorMessages = validation.errors.map(error => error.message);
        const errorTypes = validation.errors.map(error => error.type);
        
        // Return specific error based on validation failure type
        if (errorTypes.includes(ValidationErrorType.EXPENSE_NOT_FOUND)) {
          return NextResponse.json({ 
            error: 'Expense does not belong to this trip',
            validationErrors: errorMessages,
            code: 'CROSS_TRIP_EXPENSE'
          }, { status: 400 });
        }
        
        if (errorTypes.includes(ValidationErrorType.TRAVEL_ITEM_NOT_FOUND)) {
          return NextResponse.json({ 
            error: 'Travel item does not belong to this trip',
            validationErrors: errorMessages,
            code: 'CROSS_TRIP_TRAVEL_ITEM'
          }, { status: 400 });
        }
        
        // Generic validation error
        return NextResponse.json({ 
          error: 'Trip boundary validation failed',
          validationErrors: errorMessages,
          code: 'VALIDATION_FAILED'
        }, { status: 400 });
      }

      const newLink: CostTrackingLink = {
        expenseId: expenseId,
        description: travelLinkInfo.name // Use the name from TravelLinkInfo as description
      };

      // Add to travel item (modern system)
      let travelItem: any = null;
      if (travelLinkInfo.type === 'location') {
        travelItem = unifiedData.travelData.locations?.find(loc => loc.id === travelLinkInfo.id);
        if (travelItem) {
          travelItem.costTrackingLinks?.push(newLink);
        }
      } else if (travelLinkInfo.type === 'accommodation') {
        travelItem = unifiedData.accommodations?.find(acc => acc.id === travelLinkInfo.id);
        if (travelItem) {
          travelItem.costTrackingLinks?.push(newLink);
        }
      } else if (travelLinkInfo.type === 'route') {
        travelItem = unifiedData.travelData.routes?.find(r => r.id === travelLinkInfo.id);
        if (travelItem) {
          travelItem.costTrackingLinks?.push(newLink);
        }
      }

      // ALSO add/update the travelReference in the expense (legacy system) for maximum compatibility
      if (travelItem && unifiedData.costData?.expenses) {
        const expense = unifiedData.costData.expenses.find(exp => exp.id === expenseId);
        if (expense) {
          // Create the travelReference based on the travel item type
          let travelReference: any = {
            type: travelLinkInfo.type,
            description: travelLinkInfo.name
          };

          if (travelLinkInfo.type === 'location') {
            travelReference.locationId = travelLinkInfo.id;
          } else if (travelLinkInfo.type === 'accommodation') {
            travelReference.accommodationId = travelLinkInfo.id;
          } else if (travelLinkInfo.type === 'route') {
            travelReference.routeId = travelLinkInfo.id;
          }

          expense.travelReference = travelReference;
        }
      }
    }

    await saveUnifiedTripData(unifiedData);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating travel links:', error);
    return NextResponse.json(
      { error: 'Failed to update travel links' },
      { status: 500 }
    );
  }
}
