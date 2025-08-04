/**
 * Unified Expense Linking Service
 * 
 * This service provides a consistent interface for managing expense-travel item links
 * across both the trip editor and cost tracker interfaces.
 */

import { loadUnifiedTripData, saveUnifiedTripData } from './unifiedDataService';
import { CostTrackingLink } from '../types';
import { TravelLinkInfo } from './expenseTravelLookup';

export interface ExpenseLinkOperation {
  type: 'add' | 'remove' | 'update';
  expenseId: string;
  travelLinkInfo?: TravelLinkInfo;
  description?: string;
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

  private ensureCostTrackingLinksExist(tripData: any): void {
    // Ensure locations have costTrackingLinks
    if (tripData.travelData?.locations) {
      tripData.travelData.locations.forEach((location: any) => {
        if (!location.costTrackingLinks) {
          location.costTrackingLinks = [];
        }
      });
    }

    // Ensure routes have costTrackingLinks
    if (tripData.travelData?.routes) {
      tripData.travelData.routes.forEach((route: any) => {
        if (!route.costTrackingLinks) {
          route.costTrackingLinks = [];
        }
      });
    }

    // Ensure accommodations have costTrackingLinks
    if (tripData.accommodations) {
      tripData.accommodations.forEach((accommodation: any) => {
        if (!accommodation.costTrackingLinks) {
          accommodation.costTrackingLinks = [];
        }
      });
    }
  }

  private async applyOperation(tripData: any, operation: ExpenseLinkOperation): Promise<void> {
    const { type, expenseId, travelLinkInfo, description } = operation;

    // First, remove any existing links for this expense
    this.removeExistingLinks(tripData, expenseId);

    // If adding or updating, create the new link
    if (type === 'add' || type === 'update') {
      if (!travelLinkInfo) {
        throw new Error('travelLinkInfo is required for add/update operations');
      }

      const travelItem = this.findTravelItem(tripData, travelLinkInfo);
      if (!travelItem) {
        throw new Error(`Travel item ${travelLinkInfo.id} not found`);
      }

      const newLink: CostTrackingLink = {
        expenseId,
        description: description || travelLinkInfo.name
      };

      travelItem.costTrackingLinks.push(newLink);
    }
  }

  private removeExistingLinks(tripData: any, expenseId: string): void {
    // Remove from locations
    if (tripData.travelData?.locations) {
      tripData.travelData.locations.forEach((location: any) => {
        if (location.costTrackingLinks) {
          location.costTrackingLinks = location.costTrackingLinks.filter(
            (link: CostTrackingLink) => link.expenseId !== expenseId
          );
        }
      });
    }

    // Remove from routes
    if (tripData.travelData?.routes) {
      tripData.travelData.routes.forEach((route: any) => {
        if (route.costTrackingLinks) {
          route.costTrackingLinks = route.costTrackingLinks.filter(
            (link: CostTrackingLink) => link.expenseId !== expenseId
          );
        }
      });
    }

    // Remove from accommodations
    if (tripData.accommodations) {
      tripData.accommodations.forEach((accommodation: any) => {
        if (accommodation.costTrackingLinks) {
          accommodation.costTrackingLinks = accommodation.costTrackingLinks.filter(
            (link: CostTrackingLink) => link.expenseId !== expenseId
          );
        }
      });
    }
  }

  private findTravelItem(tripData: any, travelLinkInfo: TravelLinkInfo): any {
    switch (travelLinkInfo.type) {
      case 'location':
        return tripData.travelData?.locations?.find((item: any) => item.id === travelLinkInfo.id);
      case 'accommodation':
        return tripData.accommodations?.find((item: any) => item.id === travelLinkInfo.id);
      case 'route':
        return tripData.travelData?.routes?.find((item: any) => item.id === travelLinkInfo.id);
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
    });
  }

  // Process expenses with travelReference
  if (tripData.costData?.expenses) {
    for (const expense of tripData.costData.expenses) {
      if (expense.travelReference) {
        const travelRef = expense.travelReference;
        let travelItem: any = null;
        let itemType: string = '';

        // Find the travel item
        if (travelRef.type === 'location' && travelRef.locationId) {
          travelItem = tripData.travelData?.locations?.find(loc => loc.id === travelRef.locationId);
          itemType = 'location';
        } else if (travelRef.type === 'accommodation' && travelRef.accommodationId) {
          travelItem = tripData.accommodations?.find(acc => acc.id === travelRef.accommodationId);
          itemType = 'accommodation';
        } else if (travelRef.type === 'route' && travelRef.routeId) {
          travelItem = tripData.travelData?.routes?.find(route => route.id === travelRef.routeId);
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

            travelItem.costTrackingLinks.push(newLink);
            syncedCount++;
            console.log(`Synced expense ${expense.id} to ${itemType} ${travelItem.id} (${travelItem.name || `${travelItem.from} → ${travelItem.to}`})`);
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