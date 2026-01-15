/**
 * Unified Expense Linking Service
 * 
 * This service provides a consistent interface for managing expense-travel item links
 * across both the trip editor and cost tracker interfaces.
 */

import { loadUnifiedTripData, saveUnifiedTripData } from './unifiedDataService';
import { UnifiedTripData } from './dataMigration';
import { CostTrackingLink, Location, Transportation, Accommodation } from '@/app/types';
import { TravelLinkInfo } from './expenseTravelLookup';

export interface ExpenseLinkOperation {
  type: 'add' | 'remove' | 'update' | 'add_multiple';
  expenseId: string;
  travelLinkInfo?: TravelLinkInfo;
  description?: string;
  // For multi-link operations
  travelLinkInfos?: TravelLinkInfo[];
}

export class ExpenseLinkingService {
  private tripId: string;

  constructor(tripId: string) {
    this.tripId = tripId;
  }

  /**
   * Apply multiple expense linking operations atomically
   */
  async applyLinkOperations(operations: ExpenseLinkOperation[]): Promise<void> {
    const tripData = await loadUnifiedTripData(this.tripId);
    if (!tripData) {
      throw new Error(`Trip ${this.tripId} not found`);
    }

    // Ensure all travel items have costTrackingLinks arrays
    this.ensureCostTrackingLinksExist(tripData);

    // Apply each operation
    for (const operation of operations) {
      await this.applyOperation(tripData, operation);
    }

    // Save the updated data
    await saveUnifiedTripData(tripData);
  }

  /**
   * Create or update an expense-travel link
   */
  async createOrUpdateLink(expenseId: string, travelLinkInfo: TravelLinkInfo, description?: string): Promise<void> {
    await this.applyLinkOperations([{
      type: 'add',
      expenseId,
      travelLinkInfo,
      description
    }]);
  }

  /**
   * Remove an expense-travel link
   */
  async removeLink(expenseId: string): Promise<void> {
    await this.applyLinkOperations([{
      type: 'remove',
      expenseId
    }]);
  }

  /**
   * Create multiple expense-travel links with split configuration
   */
  async createMultipleLinks(expenseId: string, travelLinkInfos: TravelLinkInfo[]): Promise<void> {
    await this.applyLinkOperations([{
      type: 'add_multiple',
      expenseId,
      travelLinkInfos
    }]);
  }

  private ensureCostTrackingLinksExist(tripData: UnifiedTripData): void {
    // Ensure locations have costTrackingLinks
    if (tripData.travelData?.locations) {
      tripData.travelData.locations.forEach((location: Location) => {
        if (!location.costTrackingLinks) {
          location.costTrackingLinks = [];
        }
      });
    }

    // Ensure routes and their subRoutes have costTrackingLinks
    if (tripData.travelData?.routes) {
      tripData.travelData.routes.forEach((route: Transportation) => {
        if (!route.costTrackingLinks) {
          route.costTrackingLinks = [];
        }
        // Also ensure subRoutes have costTrackingLinks
        if (route.subRoutes) {
          route.subRoutes.forEach((subRoute) => {
            if (!subRoute.costTrackingLinks) {
              subRoute.costTrackingLinks = [];
            }
          });
        }
      });
    }

    // Ensure accommodations have costTrackingLinks
    if (tripData.accommodations) {
      tripData.accommodations.forEach((accommodation: Accommodation) => {
        if (!accommodation.costTrackingLinks) {
          accommodation.costTrackingLinks = [];
        }
      });
    }
  }

  private async applyOperation(tripData: UnifiedTripData, operation: ExpenseLinkOperation): Promise<void> {
    const { type, expenseId, travelLinkInfo, travelLinkInfos, description } = operation;

    // First, remove any existing links for this expense
    this.removeExistingLinks(tripData, expenseId);

    // Handle add_multiple for multi-route linking
    if (type === 'add_multiple') {
      if (!travelLinkInfos || travelLinkInfos.length === 0) {
        throw new Error('travelLinkInfos is required for add_multiple operations');
      }

      for (const linkInfo of travelLinkInfos) {
        const travelItem = this.findTravelItem(tripData, linkInfo);
        if (!travelItem) {
          throw new Error(`Travel item ${linkInfo.id} not found`);
        }

        const newLink: CostTrackingLink = {
          expenseId,
          description: linkInfo.name,
          splitMode: linkInfo.splitMode,
          splitValue: linkInfo.splitValue
        };

        if (!travelItem.costTrackingLinks) {
          travelItem.costTrackingLinks = [];
        }
        travelItem.costTrackingLinks.push(newLink);
      }
    }
    // Handle single link add/update
    else if (type === 'add' || type === 'update') {
      if (!travelLinkInfo) {
        throw new Error('travelLinkInfo is required for add/update operations');
      }

      const travelItem = this.findTravelItem(tripData, travelLinkInfo);
      if (!travelItem) {
        throw new Error(`Travel item ${travelLinkInfo.id} not found`);
      }

      const newLink: CostTrackingLink = {
        expenseId,
        description: description || travelLinkInfo.name,
        splitMode: travelLinkInfo.splitMode,
        splitValue: travelLinkInfo.splitValue
      };

      if (!travelItem.costTrackingLinks) {
        travelItem.costTrackingLinks = [];
      }
      travelItem.costTrackingLinks.push(newLink);
    }
  }

  private removeExistingLinks(tripData: UnifiedTripData, expenseId: string): void {
    // Remove from locations
    if (tripData.travelData?.locations) {
      tripData.travelData.locations.forEach((location: Location) => {
        if (location.costTrackingLinks) {
          location.costTrackingLinks = location.costTrackingLinks.filter(
            (link: CostTrackingLink) => link.expenseId !== expenseId
          );
        }
      });
    }

    // Remove from routes and their subRoutes
    if (tripData.travelData?.routes) {
      tripData.travelData.routes.forEach((route: Transportation) => {
        if (route.costTrackingLinks) {
          route.costTrackingLinks = route.costTrackingLinks.filter(
            (link: CostTrackingLink) => link.expenseId !== expenseId
          );
        }

        // Also check subRoutes
        if (route.subRoutes) {
          route.subRoutes.forEach((subRoute) => {
            if (subRoute.costTrackingLinks) {
              subRoute.costTrackingLinks = subRoute.costTrackingLinks.filter(
                (link: CostTrackingLink) => link.expenseId !== expenseId
              );
            }
          });
        }
      });
    }

    // Remove from accommodations
    if (tripData.accommodations) {
      tripData.accommodations.forEach((accommodation: Accommodation) => {
        if (accommodation.costTrackingLinks) {
          accommodation.costTrackingLinks = accommodation.costTrackingLinks.filter(
            (link: CostTrackingLink) => link.expenseId !== expenseId
          );
        }
      });
    }
  }

  private findTravelItem(tripData: UnifiedTripData, travelLinkInfo: TravelLinkInfo): Location | Transportation | Accommodation | null {
    switch (travelLinkInfo.type) {
      case 'location':
        return tripData.travelData?.locations?.find((item: Location) => item.id === travelLinkInfo.id) || null;
      case 'accommodation':
        return tripData.accommodations?.find((item: Accommodation) => item.id === travelLinkInfo.id) || null;
      case 'route': {
        // Search parent routes and subRoutes in a single loop for performance
        for (const route of tripData.travelData?.routes || []) {
          // Check parent route
          if (route.id === travelLinkInfo.id) {
            return route;
          }
          // Check sub-routes in the same iteration
          if (route.subRoutes) {
            const subRoute = route.subRoutes.find((sub) => sub.id === travelLinkInfo.id);
            if (subRoute) {
              return subRoute;
            }
          }
        }
        return null;
      }
      default:
        return null;
    }
  }
}

/**
 * Factory function to create an ExpenseLinkingService instance
 */
export function createExpenseLinkingService(tripId: string): ExpenseLinkingService {
  return new ExpenseLinkingService(tripId);
}

/**
 * Migration utility to sync travelReference (legacy) to costTrackingLinks (modern)
 * This fixes inconsistencies like the Antarctica Hostel issue
 */
export async function syncLegacyTravelReferences(tripId: string): Promise<{
  synced: number;
  errors: string[];
}> {
  const tripData = await loadUnifiedTripData(tripId);
  if (!tripData) {
    throw new Error(`Trip ${tripId} not found`);
  }

  let syncedCount = 0;
  const errors: string[] = [];

  // Ensure all travel items have costTrackingLinks arrays
  if (tripData.travelData?.locations) {
    tripData.travelData.locations.forEach(location => {
      if (!location.costTrackingLinks) {
        location.costTrackingLinks = [];
      }
    });
  }

  if (tripData.accommodations) {
    tripData.accommodations.forEach(accommodation => {
      if (!accommodation.costTrackingLinks) {
        accommodation.costTrackingLinks = [];
      }
    });
  }

  if (tripData.travelData?.routes) {
    tripData.travelData.routes.forEach(route => {
      if (!route.costTrackingLinks) {
        route.costTrackingLinks = [];
      }
      // Also ensure subRoutes have costTrackingLinks
      if (route.subRoutes) {
        route.subRoutes.forEach((subRoute) => {
          if (!subRoute.costTrackingLinks) {
            subRoute.costTrackingLinks = [];
          }
        });
      }
    });
  }

  // Process expenses with travelReference
  if (tripData.costData?.expenses) {
    for (const expense of tripData.costData.expenses) {
      if (expense.travelReference) {
        const travelRef = expense.travelReference;
        let travelItem: Location | Transportation | Accommodation | null = null;
        let itemType: string = '';

        // Find the travel item
        if (travelRef.type === 'location' && travelRef.locationId) {
          travelItem = tripData.travelData?.locations?.find(loc => loc.id === travelRef.locationId) || null;
          itemType = 'location';
        } else if (travelRef.type === 'accommodation' && travelRef.accommodationId) {
          travelItem = tripData.accommodations?.find(acc => acc.id === travelRef.accommodationId) || null;
          itemType = 'accommodation';
        } else if (travelRef.type === 'route' && travelRef.routeId) {
          travelItem = tripData.travelData?.routes?.find(route => route.id === travelRef.routeId) || null;
          itemType = 'route';
        }

        if (travelItem) {
          // Check if the link already exists in costTrackingLinks
          const existingLink = travelItem.costTrackingLinks?.find(
            (link: CostTrackingLink) => link.expenseId === expense.id
          );

          if (!existingLink) {
            // Add the missing link
            const newLink: CostTrackingLink = {
              expenseId: expense.id,
              description: travelRef.description || `Synced from travelReference`
            };

            if (!travelItem.costTrackingLinks) {
              travelItem.costTrackingLinks = [];
            }
            travelItem.costTrackingLinks.push(newLink);
            syncedCount++;
            
            const itemName = 'name' in travelItem ? travelItem.name : `${(travelItem as Transportation).from} → ${(travelItem as Transportation).to}`;
            console.log(`Synced expense ${expense.id} to ${itemType} ${travelItem.id} (${itemName})`);
          }
        } else {
          errors.push(`Expense ${expense.id}: Referenced ${travelRef.type} not found`);
        }
      }
    }
  }

  // Save the updated data if any changes were made
  if (syncedCount > 0) {
    await saveUnifiedTripData(tripData);
  }

  return { synced: syncedCount, errors };
}