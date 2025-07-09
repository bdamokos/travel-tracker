/**
 * Single Source of Truth: Expense-Travel Lookup Service
 * 
 * This service builds a runtime index of expense-to-travel-item mappings
 * from the costTrackingLinks stored in locations, accommodations, and routes.
 * 
 * No duplicate storage - costTrackingLinks are the only source of truth.
 */

import { Accommodation, Location, Transportation, CostTrackingLink } from '../types';

export interface TravelLinkInfo {
  type: 'location' | 'accommodation' | 'route';
  id: string;
  name: string;
  locationName?: string; // For accommodations, the location they're in
  tripTitle?: string;
}

export class ExpenseTravelLookup {
  private expenseToTravelMap = new Map<string, TravelLinkInfo>();
  private tripId: string;
  private tripTitle: string = '';
  
  constructor(tripId: string) {
    this.tripId = tripId;
  }
  
  /**
   * Builds the expense-to-travel index from the travel data
   */
  async buildIndex(): Promise<void> {
    try {
      interface TripData {
        title: string;
        locations?: Location[];
        accommodations?: Accommodation[];
        routes?: Transportation[];
      }
      const tripData: TripData = await fetch(`/api/travel-data?id=${this.tripId}`).then(r => r.json());
      this.tripTitle = tripData.title || '';
      
      // Clear existing mappings
      this.expenseToTravelMap.clear();
      
      // Index locations
      if (tripData.locations) {
        tripData.locations.forEach((location: any) => {
          if (location.costTrackingLinks) {
            location.costTrackingLinks.forEach((link: any) => {
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
        tripData.accommodations.forEach((accommodation: any) => {
          if (accommodation.costTrackingLinks) {
            accommodation.costTrackingLinks.forEach((link: any) => {
              // Find the location name for this accommodation
              const location = tripData.locations?.find((loc: any) => loc.id === accommodation.locationId);
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
        tripData.routes.forEach((route: any) => {
          if (route.costTrackingLinks) {
            route.costTrackingLinks.forEach((link: any) => {
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
      
      console.log('Expense-travel index built:', this.expenseToTravelMap.size, 'mappings');
      
    } catch (error) {
      console.error('Error building expense-travel index:', error);
    }
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
 */
export async function createExpenseTravelLookup(tripId: string): Promise<ExpenseTravelLookup> {
  const lookup = new ExpenseTravelLookup(tripId);
  await lookup.buildIndex();
  return lookup;
}