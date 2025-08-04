/**
 * Single Source of Truth: Expense-Travel Lookup Service
 * 
 * This service builds a runtime index of expense-to-travel-item mappings
 * from the costTrackingLinks stored in locations, accommodations, and routes.
 * 
 * No duplicate storage - costTrackingLinks are the only source of truth.
 * 
 * Updated for trip isolation: Works with provided trip data instead of fetching externally.
 */

import { Accommodation, Location, Transportation, CostTrackingLink } from '../types';

export interface TravelLinkInfo {
  type: 'location' | 'accommodation' | 'route';
  id: string;
  name: string;
  locationName?: string; // For accommodations, the location they're in
  tripTitle?: string;
}

export interface TripData {
  title: string;
  locations?: Location[];
  accommodations?: Accommodation[];
  routes?: Transportation[];
}

export class ExpenseTravelLookup {
  private expenseToTravelMap = new Map<string, TravelLinkInfo>();
  private tripTitle: string = '';

  constructor(_tripId: string, tripData?: TripData) {
    // tripId is used for initialization but not stored
    if (tripData) {
      this.buildIndexFromData(tripData);
    }
  }

  /**
   * Builds the expense-to-travel index from provided trip data
   * Uses BOTH costTrackingLinks (modern) and travelReference (legacy) for maximum compatibility
   */
  buildIndexFromData(tripData: TripData): void {
    this.tripTitle = tripData.title || '';

    // Clear existing mappings
    this.expenseToTravelMap.clear();

    // PHASE 1: Index from costTrackingLinks (modern system)
    // Index locations
    if (tripData.locations) {
      tripData.locations.forEach((location: Location) => {
        if (location.costTrackingLinks) {
          location.costTrackingLinks.forEach((link: CostTrackingLink) => {
            this.expenseToTravelMap.set(link.expenseId, {
              type: 'location',
              id: location.id,
              name: location.name,
              tripTitle: this.tripTitle
            });
          });
        }
      });
    }

    // Index accommodations
    if (tripData.accommodations) {
      tripData.accommodations.forEach((accommodation: Accommodation) => {
        if (accommodation.costTrackingLinks) {
          accommodation.costTrackingLinks.forEach((link: CostTrackingLink) => {
            // Find the location name for this accommodation
            const location = tripData.locations?.find((loc: Location) => loc.id === accommodation.locationId);
            const locationName = location?.name || 'Unknown location';

            this.expenseToTravelMap.set(link.expenseId, {
              type: 'accommodation',
              id: accommodation.id,
              name: accommodation.name,
              locationName: locationName,
              tripTitle: this.tripTitle
            });
          });
        }
      });
    }

    // Index routes
    if (tripData.routes) {
      tripData.routes.forEach((route: Transportation) => {
        if (route.costTrackingLinks) {
          route.costTrackingLinks.forEach((link: CostTrackingLink) => {
            this.expenseToTravelMap.set(link.expenseId, {
              type: 'route',
              id: route.id,
              name: `${route.from} → ${route.to}`,
              tripTitle: this.tripTitle
            });
          });
        }
      });
    }

    // PHASE 2: Index from travelReference (legacy system) - only if not already found
    // This handles cases like Antarctica Hostel where costTrackingLinks is empty but travelReference exists
    if ((tripData as any).costData?.expenses) {
      (tripData as any).costData.expenses.forEach((expense: any) => {
        if (expense.travelReference && !this.expenseToTravelMap.has(expense.id)) {
          const travelRef = expense.travelReference;
          
          // Find the travel item based on the reference
          let travelItem: any = null;
          let locationName: string | undefined = undefined;

          if (travelRef.type === 'location' && travelRef.locationId) {
            travelItem = tripData.locations?.find((loc: Location) => loc.id === travelRef.locationId);
          } else if (travelRef.type === 'accommodation' && travelRef.accommodationId) {
            travelItem = tripData.accommodations?.find((acc: Accommodation) => acc.id === travelRef.accommodationId);
            if (travelItem) {
              const location = tripData.locations?.find((loc: Location) => loc.id === travelItem.locationId);
              locationName = location?.name || 'Unknown location';
            }
          } else if (travelRef.type === 'route' && travelRef.routeId) {
            travelItem = tripData.routes?.find((route: Transportation) => route.id === travelRef.routeId);
          }

          if (travelItem) {
            const linkInfo: TravelLinkInfo = {
              type: travelRef.type,
              id: travelItem.id,
              name: travelRef.description || travelItem.name || `${travelItem.from} → ${travelItem.to}`,
              tripTitle: this.tripTitle
            };

            if (locationName) {
              linkInfo.locationName = locationName;
            }

            this.expenseToTravelMap.set(expense.id, linkInfo);
          }
        }
      });
    }

    console.log('Expense-travel index built:', this.expenseToTravelMap.size, 'mappings (from both costTrackingLinks and travelReference)');
  }

  /**
   * Gets travel link info for a specific expense
   */
  getTravelLinkForExpense(expenseId: string): TravelLinkInfo | null {
    return this.expenseToTravelMap.get(expenseId) || null;
  }

  /**
   * Gets all expense IDs linked to a specific travel item
   */
  getExpensesForTravelItem(itemType: 'location' | 'accommodation' | 'route', itemId: string): string[] {
    const expenseIds: string[] = [];

    for (const [expenseId, linkInfo] of Array.from(this.expenseToTravelMap.entries())) {
      if (linkInfo.type === itemType && linkInfo.id === itemId) {
        expenseIds.push(expenseId);
      }
    }

    return expenseIds;
  }

  /**
   * Gets all travel links as a map (for bulk operations)
   */
  getAllTravelLinks(): Map<string, TravelLinkInfo> {
    return new Map(this.expenseToTravelMap);
  }

  /**
   * Checks if an expense has a travel link
   */
  hasExpenseTravelLink(expenseId: string): boolean {
    return this.expenseToTravelMap.has(expenseId);
  }
}

/**
 * Utility function to create and populate a lookup instance
 * @deprecated Use constructor with tripData parameter instead
 */
export async function createExpenseTravelLookup(tripId: string): Promise<ExpenseTravelLookup> {
  // Use proper baseURL handling for both server and client
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const tripData: TripData = await fetch(`${baseUrl}/api/travel-data?id=${tripId}`).then(r => r.json());

  const lookup = new ExpenseTravelLookup(tripId, tripData);
  return lookup;
}