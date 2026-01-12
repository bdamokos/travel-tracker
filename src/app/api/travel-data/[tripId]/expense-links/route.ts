import { NextRequest, NextResponse } from 'next/server';
import { loadUnifiedTripData } from '@/app/lib/unifiedDataService';

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
    const processedExpenseIds = new Set<string>(); // Track processed expenses to avoid duplicates

    // Get valid expense IDs for filtering
    const validExpenseIds = new Set(
      (tripData.costData?.expenses || []).map(expense => expense.id)
    );

    // PHASE 1: Collect links from costTrackingLinks (modern system)
    // Collect links from locations (only for expenses that exist)
    if (tripData.travelData?.locations) {
      tripData.travelData.locations.forEach(location => {
        if (location.costTrackingLinks) {
          location.costTrackingLinks.forEach(link => {
            // Only include links to expenses that actually exist in this trip
            if (validExpenseIds.has(link.expenseId)) {
              expenseLinks.push({
                expenseId: link.expenseId,
                travelItemId: location.id,
                travelItemName: location.name,
                travelItemType: 'location',
                description: link.description
              });
              processedExpenseIds.add(link.expenseId);
            }
          });
        }
      });
    }

    // Collect links from accommodations (only for expenses that exist)
    if (tripData.accommodations) {
      tripData.accommodations.forEach(accommodation => {
        if (accommodation.costTrackingLinks) {
          accommodation.costTrackingLinks.forEach(link => {
            // Only include links to expenses that actually exist in this trip
            if (validExpenseIds.has(link.expenseId)) {
              expenseLinks.push({
                expenseId: link.expenseId,
                travelItemId: accommodation.id,
                travelItemName: accommodation.name,
                travelItemType: 'accommodation',
                description: link.description
              });
              processedExpenseIds.add(link.expenseId);
            }
          });
        }
      });
    }

    // Collect links from routes (only for expenses that exist)
    if (tripData.travelData?.routes) {
      tripData.travelData.routes.forEach(route => {
        if (route.costTrackingLinks) {
          route.costTrackingLinks.forEach(link => {
            // Only include links to expenses that actually exist in this trip
            if (validExpenseIds.has(link.expenseId)) {
              expenseLinks.push({
                expenseId: link.expenseId,
                travelItemId: route.id,
                travelItemName: `${route.from} → ${route.to}`,
                travelItemType: 'route',
                description: link.description
              });
              processedExpenseIds.add(link.expenseId);
            }
          });
        }

        route.subRoutes?.forEach(segment => {
          if (segment.costTrackingLinks) {
            segment.costTrackingLinks.forEach(link => {
              if (validExpenseIds.has(link.expenseId)) {
                expenseLinks.push({
                  expenseId: link.expenseId,
                  travelItemId: segment.id,
                  travelItemName: `${segment.from} → ${segment.to}`,
                  travelItemType: 'route',
                  description: link.description
                });
                processedExpenseIds.add(link.expenseId);
              }
            });
          }
        });
      });
    }

    // PHASE 2: Collect links from travelReference (legacy system) - only for unprocessed expenses
    // This handles cases like Antarctica Hostel where costTrackingLinks is empty but travelReference exists
    if (tripData.costData?.expenses) {
      tripData.costData.expenses.forEach(expense => {
        // Only process if we haven't already found a link for this expense
        if (expense.travelReference && !processedExpenseIds.has(expense.id)) {
          const travelRef = expense.travelReference;
          
          // Find the travel item and create the link
          let travelItemId: string | undefined;
          let travelItemName: string | undefined;
          let travelItemType: 'location' | 'accommodation' | 'route' | undefined;

          if (travelRef.type === 'location' && travelRef.locationId) {
            const location = tripData.travelData?.locations?.find(loc => loc.id === travelRef.locationId);
            if (location) {
              travelItemId = location.id;
              travelItemName = location.name;
              travelItemType = 'location';
            }
          } else if (travelRef.type === 'accommodation' && travelRef.accommodationId) {
            const accommodation = tripData.accommodations?.find(acc => acc.id === travelRef.accommodationId);
            if (accommodation) {
              travelItemId = accommodation.id;
              travelItemName = accommodation.name;
              travelItemType = 'accommodation';
            }
          } else if (travelRef.type === 'route' && travelRef.routeId) {
            const route = tripData.travelData?.routes?.find(r => r.id === travelRef.routeId);
            const subRoute = tripData.travelData?.routes
              ?.flatMap(r => r.subRoutes || [])
              .find(segment => segment.id === travelRef.routeId);

            if (route) {
              travelItemId = route.id;
              travelItemName = `${route.from} → ${route.to}`;
              travelItemType = 'route';
            } else if (subRoute) {
              travelItemId = subRoute.id;
              travelItemName = `${subRoute.from} → ${subRoute.to}`;
              travelItemType = 'route';
            }
          }

          if (travelItemId && travelItemName && travelItemType) {
            expenseLinks.push({
              expenseId: expense.id,
              travelItemId: travelItemId,
              travelItemName: travelItemName,
              travelItemType: travelItemType,
              description: travelRef.description
            });
          }
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