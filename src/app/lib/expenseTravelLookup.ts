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

import { Accommodation, Location, Transportation, CostTrackingLink, Expense } from '@/app/types';

export interface TravelLinkInfo {
  type: 'location' | 'accommodation' | 'route';
  id: string;
  name: string;
  locationName?: string; // For accommodations, the location they're in
  tripTitle?: string;
  // Multi-route expense distribution
  splitMode?: 'equal' | 'percentage' | 'fixed';
  splitValue?: number; // For 'percentage' (0-100) or 'fixed' (amount in expense currency)
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

export type LocationExpenseCategoryTotal = {
  category: string;
  count: number;
  amount: number;
};

export type LocationExpenseTotal = {
  amount: number;
  currency: string;
  unconverted?: Record<string, number>;
  count: number;
  categories?: Record<string, LocationExpenseCategoryTotal>;
};

export class ExpenseTravelLookup {
  private expenseToTravelMap = new Map<string, TravelLinkInfo[]>();
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
   * Helper method to add a link to the expense map
   * Accumulates links instead of overwriting (supports multi-route expenses)
   */
  private addLinkToMap(expenseId: string, link: TravelLinkInfo): void {
    const existing = this.expenseToTravelMap.get(expenseId);
    if (existing) {
      existing.push(link);
    } else {
      this.expenseToTravelMap.set(expenseId, [link]);
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
            this.addLinkToMap(link.expenseId, {
              type: 'location',
              id: location.id,
              name: location.name,
              tripTitle: this.tripTitle,
              splitMode: link.splitMode,
              splitValue: link.splitValue
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

            this.addLinkToMap(link.expenseId, {
              type: 'accommodation',
              id: accommodation.id,
              name: accommodation.name,
              locationName: locationName,
              tripTitle: this.tripTitle,
              splitMode: link.splitMode,
              splitValue: link.splitValue
            });
          });
        }
      });
    }

    // Index routes (including subRoutes)
    if (this.routes) {
      this.routes.forEach((route: Transportation) => {
        // Index parent route
        if (route.costTrackingLinks) {
          route.costTrackingLinks.forEach((link: CostTrackingLink) => {
            this.addLinkToMap(link.expenseId, {
              type: 'route',
              id: route.id,
              name: `${route.from} → ${route.to}`,
              tripTitle: this.tripTitle,
              splitMode: link.splitMode,
              splitValue: link.splitValue
            });
          });
        }

        // Index subRoutes
        if (route.subRoutes) {
          route.subRoutes.forEach((subRoute) => {
            if (subRoute.costTrackingLinks) {
              subRoute.costTrackingLinks.forEach((link: CostTrackingLink) => {
                this.addLinkToMap(link.expenseId, {
                  type: 'route',
                  id: subRoute.id,
                  name: `${subRoute.from} → ${subRoute.to}`,
                  tripTitle: this.tripTitle,
                  splitMode: link.splitMode,
                  splitValue: link.splitValue
                });
              });
            }
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
        // For legacy travelReference, add as a single link (no multi-route support)
        this.addLinkToMap(expense.id, linkInfo);
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
   * Gets travel link info for a specific expense (backward compatible - returns first link only)
   * @deprecated Use getTravelLinksForExpense() for multi-route support
   */
  getTravelLinkForExpense(expenseId: string): TravelLinkInfo | null {
    const links = this.expenseToTravelMap.get(expenseId);
    return links && links.length > 0 ? links[0] : null;
  }

  /**
   * Gets all travel links for a specific expense (supports multi-route)
   */
  getTravelLinksForExpense(expenseId: string): TravelLinkInfo[] {
    return this.expenseToTravelMap.get(expenseId) || [];
  }

  /**
   * Gets all expense IDs linked to a specific travel item
   */
  getExpensesForTravelItem(itemType: 'location' | 'accommodation' | 'route', itemId: string): string[] {
    const expenseIds: string[] = [];

    for (const [expenseId, links] of Array.from(this.expenseToTravelMap.entries())) {
      // Check if any of the links match this travel item
      if (links.some(link => link.type === itemType && link.id === itemId)) {
        expenseIds.push(expenseId);
      }
    }

    return expenseIds;
  }

  /**
   * Gets all travel links as a map (for bulk operations)
   */
  getAllTravelLinks(): Map<string, TravelLinkInfo[]> {
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

/**
 * Calculate the split amount for an expense based on the cost tracking link configuration
 *
 * @param expenseAmount The full expense amount
 * @param link The cost tracking link with split configuration
 * @param allLinksForExpense All links for this expense (needed for 'equal' mode)
 * @returns The split amount allocated to this specific link
 */
export function calculateSplitAmount(
  expenseAmount: number,
  link: CostTrackingLink,
  allLinksForExpense?: CostTrackingLink[]
): number {
  // If no split mode is set, this is a legacy single-link expense (100% allocation)
  if (!link.splitMode) {
    return expenseAmount;
  }

  switch (link.splitMode) {
    case 'equal': {
      // Divide equally among all links
      const linkCount = allLinksForExpense?.length || 1;
      return expenseAmount / linkCount;
    }
    case 'percentage': {
      // Use the percentage value (0-100)
      const percentage = link.splitValue || 0;
      return (expenseAmount * percentage) / 100;
    }
    case 'fixed': {
      // Use the fixed amount value
      return link.splitValue || 0;
    }
    default:
      return expenseAmount;
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

  const updateCategoryTotals = (
    currentTotal: LocationExpenseTotal,
    category: string,
    amount: number
  ): LocationExpenseTotal => {
    const categories = { ...(currentTotal.categories ?? {}) };
    const existing = categories[category] ?? { category, count: 0, amount: 0 };

    categories[category] = {
      category,
      count: existing.count + 1,
      amount: existing.amount + amount
    };

    return { ...currentTotal, categories };
  };

  const applyTrackedAmount = (
    locationId: string,
    nextTotal: LocationExpenseTotal,
    category: string,
    amount: number
  ) => {
    totals[locationId] = {
      ...updateCategoryTotals(nextTotal, category, amount),
      amount: nextTotal.amount + amount
    };
  };

  expenses.forEach(expense => {
    const links = travelLookup.getTravelLinksForExpense(expense.id);
    if (!links || links.length === 0) {
      return;
    }

    const expenseCurrency = expense.currency || trackingCurrency;
    const category = expense.category?.trim() || 'Uncategorized';
    const expenseAmount = expense.amount || 0;

    // Get all costTrackingLinks for split calculation
    // Convert TravelLinkInfo to CostTrackingLink format for calculateSplitAmount
    const allCostTrackingLinks: CostTrackingLink[] = links.map(link => ({
      expenseId: expense.id,
      description: link.name,
      splitMode: link.splitMode,
      splitValue: link.splitValue
    }));

    // Find the first link that will actually be processed (has a valid locationId)
    // This is important for counting: we only want to increment count once per expense,
    // and it should be on the first link that actually gets tallied to a location
    const firstValidLink = links.find(link => {
      if (link.type === 'location') return true;
      if (link.type === 'accommodation') {
        return accommodationLocationMap.has(link.id);
      }
      return false;
    });

    // Process each link (for multi-route expenses, split the amount)
    links.forEach(link => {
      let locationId: string | null = null;
      if (link.type === 'location') {
        locationId = link.id;
      } else if (link.type === 'accommodation') {
        locationId = accommodationLocationMap.get(link.id) || null;
      }

      if (!locationId) {
        return;
      }

      const currentTotal = totals[locationId] ?? { amount: 0, currency: trackingCurrency, count: 0 };

      // For multi-route expenses, only count the expense once (against the first valid link)
      // "First valid link" = first link that actually has a locationId and gets processed
      // This prevents issues where the first link in the array is a route (no locationId) and gets skipped
      const isFirstValidLink = firstValidLink === link;
      const nextTotal = {
        ...currentTotal,
        count: isFirstValidLink ? currentTotal.count + 1 : currentTotal.count
      };

      // Calculate split amount for this link
      const costTrackingLink: CostTrackingLink = {
        expenseId: expense.id,
        description: link.name,
        splitMode: link.splitMode,
        splitValue: link.splitValue
      };

      let amountForThisLink = expenseAmount;

      // Apply split calculation only if there are multiple links
      if (links.length > 1) {
        amountForThisLink = calculateSplitAmount(expenseAmount, costTrackingLink, allCostTrackingLinks);
      }

      if (expense.cashTransaction?.kind === 'allocation') {
        const baseAmount = expense.cashTransaction.baseAmount;
        // Split the base amount too
        const splitBaseAmount = links.length > 1
          ? calculateSplitAmount(baseAmount, costTrackingLink, allCostTrackingLinks)
          : baseAmount;
        applyTrackedAmount(locationId, nextTotal, category, splitBaseAmount);
        return;
      }

      if (expense.cashTransaction?.kind === 'source') {
        applyTrackedAmount(locationId, nextTotal, category, amountForThisLink);
        return;
      }

      if (expenseCurrency !== trackingCurrency) {
        totals[locationId] = {
          ...updateCategoryTotals(nextTotal, category, 0),
          unconverted: {
            ...(nextTotal.unconverted || {}),
            [expenseCurrency]: (nextTotal.unconverted?.[expenseCurrency] || 0) + amountForThisLink
          }
        };
        return;
      }

      applyTrackedAmount(locationId, nextTotal, category, amountForThisLink);
    });
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
  const response = await fetch(`${baseUrl}/api/travel-data?id=${tripId}`);
  if (!response.ok) {
    throw new Error(`Failed to load trip data (${response.status})`);
  }
  const tripData: TripData = await response.json();

  const lookup = new ExpenseTravelLookup(tripId, tripData);
  return lookup;
}