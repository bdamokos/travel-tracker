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

import { Accommodation, Location, Transportation, CostTrackingLink, Expense } from '../types';

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
  costData?: {
    expenses?: Expense[];
  };
}

export type LocationExpenseTotal = {
  amount: number;
  currency: string;
  unconverted?: Record<string, number>;
  count: number;
};

export class ExpenseTravelLookup {
  private expenseToTravelMap = new Map<string, TravelLinkInfo>();
  private tripTitle: string = '';
  private locations: Location[] = [];
  private accommodations: Accommodation[] = [];
  private routes: Transportation[] = [];
  private travelReferenceHydratedExpenseIds: Set<string> = new Set();

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
    this.locations = tripData.locations ?? [];
    this.accommodations = tripData.accommodations ?? [];
    this.routes = tripData.routes ?? [];
    this.travelReferenceHydratedExpenseIds = new Set();

    // Clear existing mappings
    this.expenseToTravelMap.clear();

    // PHASE 1: Index from costTrackingLinks (modern system)
    // Index locations
    if (this.locations) {
      this.locations.forEach((location: Location) => {
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
    if (this.accommodations) {
      this.accommodations.forEach((accommodation: Accommodation) => {
        if (accommodation.costTrackingLinks) {
          accommodation.costTrackingLinks.forEach((link: CostTrackingLink) => {
            // Find the location name for this accommodation
            const location = this.locations?.find((loc: Location) => loc.id === accommodation.locationId);
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
    if (this.routes) {
      this.routes.forEach((route: Transportation) => {
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
    if (tripData.costData?.expenses) {
      this.hydrateFromExpenses(tripData.costData.expenses);
    }

    console.log('Expense-travel index built:', this.expenseToTravelMap.size, 'mappings (from both costTrackingLinks and travelReference)');
  }

  hydrateFromExpenses(expenses: Expense[]): void {
    if (!expenses || expenses.length === 0) {
      if (this.travelReferenceHydratedExpenseIds.size > 0) {
        this.travelReferenceHydratedExpenseIds.forEach(expenseId => {
          this.expenseToTravelMap.delete(expenseId);
        });
        this.travelReferenceHydratedExpenseIds = new Set();
      }
      return;
    }

    const updatedHydratedIds = new Set<string>();

    expenses.forEach((expense: Expense) => {
      const linkInfo = this.resolveTravelLinkFromReference(expense);

      if (linkInfo) {
        this.expenseToTravelMap.set(expense.id, linkInfo);
        updatedHydratedIds.add(expense.id);
      } else if (this.travelReferenceHydratedExpenseIds.has(expense.id)) {
        this.expenseToTravelMap.delete(expense.id);
      }
    });

    this.travelReferenceHydratedExpenseIds.forEach(expenseId => {
      if (!updatedHydratedIds.has(expenseId)) {
        this.expenseToTravelMap.delete(expenseId);
      }
    });

    this.travelReferenceHydratedExpenseIds = updatedHydratedIds;
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

  private resolveTravelLinkFromReference(expense: Expense): TravelLinkInfo | null {
    const travelRef = expense.travelReference;
    if (!travelRef) {
      return null;
    }

    if (this.expenseToTravelMap.has(expense.id) && !this.travelReferenceHydratedExpenseIds.has(expense.id)) {
      // Existing link came from costTrackingLinks; no need to override
      return null;
    }

    let travelItem: Location | Accommodation | Transportation | null = null;
    let locationName: string | undefined = undefined;

    if (travelRef.type === 'location' && travelRef.locationId) {
      travelItem = this.locations.find((loc: Location) => loc.id === travelRef.locationId) || null;
    } else if (travelRef.type === 'accommodation' && travelRef.accommodationId) {
      travelItem = this.accommodations.find((acc: Accommodation) => acc.id === travelRef.accommodationId) || null;
      if (travelItem) {
        const location = this.locations.find((loc: Location) => loc.id === (travelItem as Accommodation).locationId);
        locationName = location?.name || 'Unknown location';
      }
    } else if (travelRef.type === 'route' && travelRef.routeId) {
      travelItem = this.routes.find((route: Transportation) => route.id === travelRef.routeId) || null;
    }

    if (!travelItem) {
      return null;
    }

    const itemName = 'name' in travelItem ? travelItem.name : `${(travelItem as Transportation).from} → ${(travelItem as Transportation).to}`;
    const linkInfo: TravelLinkInfo = {
      type: travelRef.type,
      id: travelItem.id,
      name: travelRef.description || itemName,
      tripTitle: this.tripTitle
    };

    if (locationName) {
      linkInfo.locationName = locationName;
    }

    return linkInfo;
  }
}

export function calculateExpenseTotalsByLocation({
  expenses,
  travelLookup,
  accommodations,
  trackingCurrency
}: {
  expenses: Expense[];
  travelLookup: ExpenseTravelLookup;
  accommodations?: Accommodation[];
  trackingCurrency: string;
}): Record<string, LocationExpenseTotal> {
  const accommodationLocationMap = new Map<string, string>();
  (accommodations ?? []).forEach(accommodation => {
    if (accommodation.locationId) {
      accommodationLocationMap.set(accommodation.id, accommodation.locationId);
    }
  });

  const totals: Record<string, LocationExpenseTotal> = {};

  expenses.forEach(expense => {
    const link = travelLookup.getTravelLinkForExpense(expense.id);
    if (!link) {
      return;
    }

    let locationId: string | null = null;
    if (link.type === 'location') {
      locationId = link.id;
    } else if (link.type === 'accommodation') {
      locationId = accommodationLocationMap.get(link.id) || null;
    }

    if (!locationId) {
      return;
    }

    const expenseCurrency = expense.currency || trackingCurrency;
    const currentTotal = totals[locationId] ?? { amount: 0, currency: trackingCurrency, count: 0 };
    const nextTotal = { ...currentTotal, count: currentTotal.count + 1 };

    if (expense.cashTransaction?.kind === 'allocation') {
      totals[locationId] = {
        ...nextTotal,
        amount: nextTotal.amount + expense.cashTransaction.baseAmount
      };
      return;
    }

    if (expense.cashTransaction?.kind === 'source') {
      totals[locationId] = {
        ...nextTotal,
        amount: nextTotal.amount + (expense.amount || 0)
      };
      return;
    }

    if (expenseCurrency !== trackingCurrency) {
      totals[locationId] = {
        ...nextTotal,
        unconverted: {
          ...(nextTotal.unconverted || {}),
          [expenseCurrency]: (nextTotal.unconverted?.[expenseCurrency] || 0) + (expense.amount || 0)
        }
      };
      return;
    }

    totals[locationId] = {
      ...nextTotal,
      amount: nextTotal.amount + (expense.amount || 0)
    };
  });

  return totals;
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