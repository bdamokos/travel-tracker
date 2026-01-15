import { NextRequest, NextResponse } from 'next/server';
import { loadUnifiedTripData } from '@/app/lib/unifiedDataService';
import { createExpenseLinkingService } from '@/app/lib/expenseLinkingService';
import { TravelLinkInfo } from '@/app/lib/expenseTravelLookup';

interface ExpenseLink {
  expenseId: string;
  travelItemId: string;
  travelItemName: string;
  travelItemType: 'location' | 'accommodation' | 'route';
  description?: string;
  splitMode?: 'equal' | 'percentage' | 'fixed';
  splitValue?: number;
}

function validateSplitConfiguration(
  links: TravelLinkInfo[],
  expenseAmount: number
): { valid: boolean; error?: string } {
  const percentageLinks = links.filter(l => l.splitMode === 'percentage' && l.splitValue !== undefined);
  const fixedLinks = links.filter(l => l.splitMode === 'fixed' && l.splitValue !== undefined);

  // Validate percentage splits
  if (percentageLinks.length > 0) {
    const totalPercentage = percentageLinks.reduce((sum, link) => sum + (link.splitValue || 0), 0);
    const tolerance = 0.5; // ±0.5% tolerance
    if (Math.abs(totalPercentage - 100) > tolerance) {
      return {
        valid: false,
        error: `Percentage split values must sum to 100% (±${tolerance}%), but got ${totalPercentage.toFixed(2)}%`
      };
    }
  }

  // Validate fixed splits
  if (fixedLinks.length > 0) {
    const totalFixed = fixedLinks.reduce((sum, link) => sum + (link.splitValue || 0), 0);
    const tolerance = 0.01; // 1 cent tolerance
    if (Math.abs(totalFixed - expenseAmount) > tolerance) {
      return {
        valid: false,
        error: `Fixed split values must sum to expense amount ${expenseAmount.toFixed(2)}, but got ${totalFixed.toFixed(2)}`
      };
    }
  }

  return { valid: true };
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
                description: link.description,
                splitMode: link.splitMode,
                splitValue: link.splitValue
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
                description: link.description,
                splitMode: link.splitMode,
                splitValue: link.splitValue
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
                description: link.description,
                splitMode: link.splitMode,
                splitValue: link.splitValue
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
                  description: link.description,
                  splitMode: link.splitMode,
                  splitValue: link.splitValue
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

/**
 * POST - Create or update expense links (supports both single and multi-link)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  try {
    const { tripId } = await params;

    if (!tripId) {
      return NextResponse.json({
        error: 'Trip ID is required'
      }, { status: 400 });
    }

    const body = await request.json();
    const { expenseId, links } = body as {
      expenseId: string;
      links: TravelLinkInfo[] | TravelLinkInfo | undefined
    };

    if (!expenseId) {
      return NextResponse.json({
        error: 'Expense ID is required'
      }, { status: 400 });
    }

    const linkingService = createExpenseLinkingService(tripId);

    // Handle remove operation (no links provided)
    if (!links || (Array.isArray(links) && links.length === 0)) {
      await linkingService.removeLink(expenseId);
      return NextResponse.json({
        success: true,
        message: 'Expense link removed'
      });
    }

    // Handle multi-link operation
    if (Array.isArray(links)) {
      if (links.length > 1) {
        // Validate split configuration before persisting
        const tripData = await loadUnifiedTripData(tripId);
        if (!tripData) {
          return NextResponse.json({
            error: 'Trip data not found'
          }, { status: 404 });
        }

        const expense = tripData.costData?.expenses?.find(exp => exp.id === expenseId);
        const expenseAmount = expense?.amount || 0;

        const validation = validateSplitConfiguration(links, expenseAmount);
        if (!validation.valid) {
          return NextResponse.json({
            error: validation.error,
            code: 'SPLIT_VALIDATION_FAILED'
          }, { status: 400 });
        }

        // Multi-link with split configuration
        await linkingService.createMultipleLinks(expenseId, links);
        return NextResponse.json({
          success: true,
          message: `Expense linked to ${links.length} routes with split configuration`
        });
      } else if (links.length === 1) {
        // Single link from array
        await linkingService.createOrUpdateLink(expenseId, links[0]);
        return NextResponse.json({
          success: true,
          message: 'Expense link created'
        });
      }
    }

    // Handle single-link operation (backward compatibility)
    if (!Array.isArray(links)) {
      await linkingService.createOrUpdateLink(expenseId, links);
      return NextResponse.json({
        success: true,
        message: 'Expense link created'
      });
    }

    return NextResponse.json({
      error: 'Invalid request format'
    }, { status: 400 });

  } catch (error) {
    console.error('Error saving expense links:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 });
  }
}

/**
 * DELETE - Remove expense links
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  try {
    const { tripId } = await params;

    if (!tripId) {
      return NextResponse.json({
        error: 'Trip ID is required'
      }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const expenseId = searchParams.get('expenseId');

    if (!expenseId) {
      return NextResponse.json({
        error: 'Expense ID is required'
      }, { status: 400 });
    }

    const linkingService = createExpenseLinkingService(tripId);
    await linkingService.removeLink(expenseId);

    return NextResponse.json({
      success: true,
      message: 'Expense link removed'
    });

  } catch (error) {
    console.error('Error deleting expense link:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 });
  }
}