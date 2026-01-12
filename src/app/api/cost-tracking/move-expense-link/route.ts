
import { NextResponse } from 'next/server';
import { loadUnifiedTripData, saveUnifiedTripData } from '@/app/lib/unifiedDataService';
import { CostTrackingLink } from '@/app/types';

export async function POST(request: Request) {
  try {
    const { tripId, expenseId, newTravelItemId, newLinkDescription } = await request.json();

    if (!tripId || !expenseId || !newTravelItemId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const tripData = await loadUnifiedTripData(tripId);
    if (!tripData) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    // Find and remove the old link
    let linkRemoved = false;
    
    // Handle locations and routes from travelData
    const travelItemTypes = ['locations', 'routes'] as const;
    for (const itemType of travelItemTypes) {
        const items = tripData.travelData?.[itemType];
        if (items) {
            for (const item of items) {
                const initialLinkCount = item.costTrackingLinks?.length || 0;
                if (item.costTrackingLinks) {
                    item.costTrackingLinks = item.costTrackingLinks.filter(link => link.expenseId !== expenseId);
                }
                if (item.costTrackingLinks && item.costTrackingLinks.length < initialLinkCount) {
                    linkRemoved = true;
                }

                if (itemType === 'routes') {
                    const routeItem = item as { subRoutes?: Array<{ costTrackingLinks?: CostTrackingLink[] }> };
                    if (routeItem.subRoutes) {
                        for (const segment of routeItem.subRoutes) {
                            const segmentLinkCount = segment.costTrackingLinks?.length || 0;
                            if (segment.costTrackingLinks) {
                                segment.costTrackingLinks = segment.costTrackingLinks.filter((link: CostTrackingLink) => link.expenseId !== expenseId);
                            }
                            if (segment.costTrackingLinks && segment.costTrackingLinks.length < segmentLinkCount) {
                                linkRemoved = true;
                            }
                        }
                    }
                }
            }
        }
    }

    // Handle accommodations separately
    if (tripData.accommodations) {
        for (const item of tripData.accommodations) {
            const initialLinkCount = item.costTrackingLinks?.length || 0;
            if (item.costTrackingLinks) {
                item.costTrackingLinks = item.costTrackingLinks.filter(link => link.expenseId !== expenseId);
            }
            if (item.costTrackingLinks && item.costTrackingLinks.length < initialLinkCount) {
                linkRemoved = true;
            }
        }
    }

    if (!linkRemoved) {
      // This could happen if the index is stale. We can proceed to add the new link anyway.
      console.warn(`Expense link for expenseId: ${expenseId} not found in trip: ${tripId}. Proceeding to add new link.`);
    }

    // Add the new link
    let linkAdded = false;
    
    // Check locations and routes
    for (const itemType of travelItemTypes) {
        const items = tripData.travelData?.[itemType];
        if (items) {
            const item = items.find(i => i.id === newTravelItemId);
            if (item) {
                if (!item.costTrackingLinks) {
                    item.costTrackingLinks = [];
                }
                const newLink: CostTrackingLink = { expenseId };
                if (newLinkDescription) {
                    newLink.description = newLinkDescription;
                }
                item.costTrackingLinks.push(newLink);
                linkAdded = true;
                break;
            }

            if (itemType === 'routes') {
                const routeItem = items.find(i =>
                    (i as { subRoutes?: Array<{ id: string }> }).subRoutes?.some(segment => segment.id === newTravelItemId)
                ) as { subRoutes?: Array<{ id: string; costTrackingLinks?: CostTrackingLink[] }> } | undefined;

                const segment = routeItem?.subRoutes?.find(segment => segment.id === newTravelItemId);
                if (segment) {
                    if (!segment.costTrackingLinks) {
                        segment.costTrackingLinks = [];
                    }
                    const newLink: CostTrackingLink = { expenseId };
                    if (newLinkDescription) {
                        newLink.description = newLinkDescription;
                    }
                    segment.costTrackingLinks.push(newLink);
                    linkAdded = true;
                    break;
                }
            }
        }
    }

    // Check accommodations if not found in travelData
    if (!linkAdded && tripData.accommodations) {
        const item = tripData.accommodations.find(i => i.id === newTravelItemId);
        if (item) {
            if (!item.costTrackingLinks) {
                item.costTrackingLinks = [];
            }
            const newLink: CostTrackingLink = { expenseId };
            if (newLinkDescription) {
                newLink.description = newLinkDescription;
            }
            item.costTrackingLinks.push(newLink);
            linkAdded = true;
        }
    }

    if (!linkAdded) {
      return NextResponse.json({ error: 'New travel item not found' }, { status: 404 });
    }

    await saveUnifiedTripData(tripData);

    return NextResponse.json({ message: 'Link moved successfully' });

  } catch (error) {
    console.error('Error moving expense link:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
