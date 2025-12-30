/**
 * Data Migration System for Travel Tracker
 * 
 * Handles unified data model and schema migrations
 */

import { Journey, CostTrackingData, Location, Transportation, Accommodation, Expense } from '../types';

/**
 * Unified data model that contains both travel and cost data
 */
export interface UnifiedTripData {
  // Schema version for future migrations
  schemaVersion: number;
  
  // Core trip metadata
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
  
  // Travel data (can be null for cost-only trips in future)
  travelData?: {
    // Legacy format
    locations?: Location[];
    routes?: Transportation[];
    // New Journey format
    days?: Journey['days'];
  };
  
  // Accommodations data
  accommodations?: Accommodation[];
  
  // Cost tracking data (can be null for travel-only trips)
  costData?: {
    overallBudget: number;
    currency: string;
    countryBudgets: CostTrackingData['countryBudgets'];
    expenses: CostTrackingData['expenses'];
    customCategories?: CostTrackingData['customCategories'];
    ynabImportData?: CostTrackingData['ynabImportData'];
    ynabConfig?: CostTrackingData['ynabConfig']; // YNAB API configuration for direct integration
  };
}

/**
 * Checks if data is already in unified format
 */
export function isUnifiedFormat(data: unknown): data is UnifiedTripData {
  return data !== null && typeof data === 'object' && 'schemaVersion' in data && typeof (data as UnifiedTripData).schemaVersion === 'number' && (data as UnifiedTripData).schemaVersion >= 1;
}

/**
 * Current schema version - increment when introducing breaking changes
 */
export const CURRENT_SCHEMA_VERSION = 7;

/**
 * Migrate from schema v6 to v7 - Repair orphaned accommodation references
 *
 * Real-world corruption case:
 * - Locations can gain new `accommodationIds` via the accommodations API/SWR layer.
 * - Autosave may later persist travel data with a stale `accommodations` array, unintentionally
 *   dropping the newly created accommodation objects while keeping the IDs on the locations.
 *
 * This migration restores referential integrity by creating placeholder accommodations for any
 * missing IDs (and re-attaching expense links when possible).
 */
export function migrateFromV6ToV7(data: UnifiedTripData): UnifiedTripData {
  const tripId = data.id;
  const created: string[] = [];

  const locations = data.travelData?.locations || [];
  const expenses = data.costData?.expenses || [];

  const accommodations: Accommodation[] = Array.isArray(data.accommodations) ? [...data.accommodations] : [];
  const accommodationById = new Map(accommodations.map(acc => [acc.id, acc]));

  const ensureAccommodation = (id: string, locationId: string | null, nameHint: string | null) => {
    if (accommodationById.has(id)) return;

    const linkedExpenses = expenses.filter(
      expense => expense.travelReference?.type === 'accommodation' && expense.travelReference.accommodationId === id
    );

    const now = new Date().toISOString();
    const placeholder: Accommodation = {
      id,
      name: nameHint || 'Recovered accommodation',
      locationId: locationId || 'unknown-location',
      accommodationData: '',
      isAccommodationPublic: false,
      createdAt: now,
      updatedAt: now,
      costTrackingLinks: linkedExpenses.map(expense => ({
        expenseId: expense.id,
        description: expense.travelReference?.description || expense.description || ''
      }))
    };

    accommodations.push(placeholder);
    accommodationById.set(id, placeholder);
    created.push(id);
  };

  // 1) Create placeholders for any IDs referenced by locations
  for (const location of locations) {
    const ids = Array.isArray(location.accommodationIds) ? location.accommodationIds : [];
    for (const id of ids) {
      ensureAccommodation(id, location.id, location.name ? `Recovered accommodation (${location.name})` : null);
    }
  }

  // 2) Create placeholders for any expenses referencing missing accommodations
  for (const expense of expenses) {
    if (expense.travelReference?.type !== 'accommodation') continue;
    const accommodationId = expense.travelReference.accommodationId;
    if (!accommodationId) continue;
    ensureAccommodation(accommodationId, null, expense.travelReference.description || expense.description || null);
  }

  if (created.length > 0) {
    console.log(`Trip ${tripId} v6→v7 migration created placeholder accommodations:`, created);
  }

  return {
    ...data,
    accommodations,
    schemaVersion: 7,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Migrates from version 1 to version 2 - extracts accommodations from locations
 */
export function migrateFromV1ToV2(data: UnifiedTripData): UnifiedTripData {
  const extractedAccommodations: Accommodation[] = [];
  
  if (data.travelData?.locations) {
    data.travelData.locations = data.travelData.locations.map(location => {
      // If location has accommodation data, extract it
      if (location.accommodationData) {
        const accommodation: Accommodation = {
          id: `acc-${location.id}-${Date.now()}`,
          name: 'Accommodation', // Default name for legacy accommodations
          locationId: location.id,
          accommodationData: location.accommodationData,
          isAccommodationPublic: location.isAccommodationPublic || false,
          costTrackingLinks: location.costTrackingLinks || [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        extractedAccommodations.push(accommodation);
        
        // Update location to reference the accommodation
        return {
          ...location,
          accommodationIds: [accommodation.id],
          // Keep legacy fields for backward compatibility
          costTrackingLinks: [] // Move to accommodation
        };
      }
      
      return location;
    });
  }
  
  return {
    ...data,
    accommodations: extractedAccommodations,
    schemaVersion: 2,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Migrates from version 2 to version 3 - properly extracts accommodations from locations
 * This fixes the incomplete v2 migration that didn't actually create accommodations
 */
export function migrateFromV2ToV3(data: UnifiedTripData): UnifiedTripData {
  const extractedAccommodations: Accommodation[] = [];
  const accommodationMap = new Map<string, string>(); // locationId -> accommodationId
  
  // First, if accommodations already exist, create a map of existing ones
  if (data.accommodations) {
    data.accommodations.forEach(acc => {
      accommodationMap.set(acc.locationId, acc.id);
      extractedAccommodations.push(acc);
    });
  }
  
  // Process locations: create accommodations only for locations that have accommodationData
  if (data.travelData?.locations) {
    data.travelData.locations.forEach(location => {
      // Only create accommodations for locations that have accommodationData
      if (location.accommodationData && !accommodationMap.has(location.id)) {
        const accommodationId = `acc-${location.id}-${Date.now()}`;
        
        // For locations with accommodation data, move accommodation-related expenses to the accommodation
        const accommodationExpenses = (location.costTrackingLinks || []).filter(link => {
          const expense = data.costData?.expenses?.find(e => e.id === link.expenseId);
          return expense?.category === 'Accommodation' || 
                 expense?.travelReference?.type === 'accommodation';
        });
        

        
        const accommodation: Accommodation = {
          id: accommodationId,
          name: 'Accommodation', // Default name for legacy accommodations
          locationId: location.id,
          accommodationData: location.accommodationData,
          isAccommodationPublic: location.isAccommodationPublic || false,
          costTrackingLinks: accommodationExpenses,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        extractedAccommodations.push(accommodation);
        accommodationMap.set(location.id, accommodationId);
      }
    });
    
    // Second pass: update all locations
    data.travelData.locations = data.travelData.locations.map(location => {
      const accommodationId = accommodationMap.get(location.id);
      
      if (accommodationId) {
        // Location has accommodation - reference it and update cost links
        
        const locationExpenses = (location.costTrackingLinks || []).filter(link => {
          const expense = data.costData?.expenses?.find(e => e.id === link.expenseId);
          return !(expense?.category === 'Accommodation' || 
                  expense?.travelReference?.type === 'accommodation');
        });
        
        return {
          ...location,
          accommodationIds: [accommodationId],
          costTrackingLinks: locationExpenses
        };
      } else {
        // Location has no accommodation - keep all cost tracking links and ensure accommodationIds is empty array
        return {
          ...location,
          accommodationIds: []
        };
      }
    });
  }
  
  return {
    ...data,
    accommodations: extractedAccommodations,
    schemaVersion: 3,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Migrates from version 3 to version 4 - removes cross-trip expense links
 * This ensures that all expense links only reference expenses that exist within the same trip
 */
export function migrateFromV3ToV4(data: UnifiedTripData): UnifiedTripData {
  const tripId = data.id;
  const cleanupLog: string[] = [];
  
  // Clean up locations
  if (data.travelData?.locations) {
    data.travelData.locations = data.travelData.locations.map(location => ({
      ...location,
      costTrackingLinks: (location.costTrackingLinks || []).filter(link => {
        const expense = data.costData?.expenses?.find(e => e.id === link.expenseId);
        const isValid = !!expense; // Expense must exist in same trip
        if (!isValid) {
          cleanupLog.push(`Removed invalid expense link ${link.expenseId} from location ${location.id}`);
        }
        return isValid;
      })
    }));
  }
  
  // Clean up accommodations
  if (data.accommodations) {
    data.accommodations = data.accommodations.map(accommodation => ({
      ...accommodation,
      costTrackingLinks: (accommodation.costTrackingLinks || []).filter(link => {
        const expense = data.costData?.expenses?.find(e => e.id === link.expenseId);
        const isValid = !!expense;
        if (!isValid) {
          cleanupLog.push(`Removed invalid expense link ${link.expenseId} from accommodation ${accommodation.id}`);
        }
        return isValid;
      })
    }));
  }
  
  // Clean up routes
  if (data.travelData?.routes) {
    data.travelData.routes = data.travelData.routes.map(route => ({
      ...route,
      costTrackingLinks: (route.costTrackingLinks || []).filter(link => {
        const expense = data.costData?.expenses?.find(e => e.id === link.expenseId);
        const isValid = !!expense;
        if (!isValid) {
          cleanupLog.push(`Removed invalid expense link ${link.expenseId} from route ${route.id}`);
        }
        return isValid;
      })
    }));
  }
  
  // Log cleanup actions
  if (cleanupLog.length > 0) {
    console.log(`Trip ${tripId} v3→v4 migration cleanup:`, cleanupLog);
  }
  
  return {
    ...data,
    schemaVersion: 4,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Migrate from schema v4 to v5 - Synchronize travelReference and costTrackingLinks
 * This migration ensures that:
 * 1. All expenses with travelReference have corresponding costTrackingLinks in travel items
 * 2. All costTrackingLinks have corresponding travelReference in expenses
 */
export function migrateFromV4ToV5(data: UnifiedTripData): UnifiedTripData {
  const tripId = data.id;
  const syncLog: string[] = [];
  
  // Helper function to get travel item by type and ID
  const getTravelItem = (type: string, id: string) => {
    switch (type) {
      case 'location':
        return data.travelData?.locations?.find(l => l.id === id);
      case 'accommodation':
        return data.accommodations?.find(a => a.id === id);
      case 'route':
        return data.travelData?.routes?.find(r => r.id === id);
      default:
        return undefined;
    }
  };
  
  // Step 1: Add missing costTrackingLinks based on travelReference in expenses
  if (data.costData?.expenses) {
    data.costData.expenses.forEach(expense => {
      if (expense.travelReference) {
        const { type, locationId, accommodationId, routeId, description } = expense.travelReference;
        const travelItemId = locationId || accommodationId || routeId;
        
        if (travelItemId) {
          const travelItem = getTravelItem(type, travelItemId);
          if (travelItem) {
            // Initialize costTrackingLinks array if it doesn't exist
            if (!travelItem.costTrackingLinks) {
              travelItem.costTrackingLinks = [];
            }
            
            // Check if link already exists
            const existingLink = travelItem.costTrackingLinks.find(link => link.expenseId === expense.id);
            if (!existingLink) {
              // Add the missing link
              travelItem.costTrackingLinks.push({
                expenseId: expense.id,
                description: description || expense.description || ''
              });
              syncLog.push(`Added missing costTrackingLink for expense ${expense.id} to ${type} ${travelItemId}`);
            }
          } else {
            syncLog.push(`Warning: Expense ${expense.id} references non-existent ${type} ${travelItemId}`);
          }
        }
      }
    });
  }
  
  // Step 2: Add missing travelReference based on costTrackingLinks
  // (This step ensures bidirectional consistency in case costTrackingLinks exist without travelReference)
  const addTravelReference = (expense: Expense, travelItemType: 'location' | 'accommodation' | 'route', travelItemId: string, travelItemName: string) => {
    if (!expense.travelReference) {
      expense.travelReference = {
        type: travelItemType,
        description: travelItemName
      };
      
      // Set the appropriate ID field based on type
      switch (travelItemType) {
        case 'location':
          expense.travelReference.locationId = travelItemId;
          break;
        case 'accommodation':
          expense.travelReference.accommodationId = travelItemId;
          break;
        case 'route':
          expense.travelReference.routeId = travelItemId;
          break;
      }
      
      syncLog.push(`Added missing travelReference for expense ${expense.id} to ${travelItemType} ${travelItemId}`);
    }
  };
  
  // Check locations
  if (data.travelData?.locations) {
    data.travelData.locations.forEach(location => {
      if (location.costTrackingLinks) {
        location.costTrackingLinks.forEach(link => {
          const expense = data.costData?.expenses?.find(e => e.id === link.expenseId);
          if (expense) {
            addTravelReference(expense, 'location', location.id, location.name);
          }
        });
      }
    });
  }
  
  // Check accommodations
  if (data.accommodations) {
    data.accommodations.forEach(accommodation => {
      if (accommodation.costTrackingLinks) {
        accommodation.costTrackingLinks.forEach(link => {
          const expense = data.costData?.expenses?.find(e => e.id === link.expenseId);
          if (expense) {
            addTravelReference(expense, 'accommodation', accommodation.id, accommodation.name);
          }
        });
      }
    });
  }
  
  // Check routes
  if (data.travelData?.routes) {
    data.travelData.routes.forEach(route => {
      if (route.costTrackingLinks) {
        route.costTrackingLinks.forEach(link => {
          const expense = data.costData?.expenses?.find(e => e.id === link.expenseId);
          if (expense) {
            const routeName = `${route.from} → ${route.to}`;
            addTravelReference(expense, 'route', route.id, routeName);
          }
        });
      }
    });
  }
  
  // Log synchronization actions
  if (syncLog.length > 0) {
    console.log(`Trip ${tripId} v4→v5 migration synchronization:`, syncLog);
  }
  
  return {
    ...data,
    schemaVersion: 5,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Migrate from schema v5 to v6 - Fix temp-location accommodation assignments
 * This migration fixes accommodations that have "temp-location" as locationId
 * by finding the correct location based on accommodation dates and location names
 */
export function migrateFromV5ToV6(data: UnifiedTripData): UnifiedTripData {
  const tripId = data.id;
  const fixLog: string[] = [];
  
  if (!data.accommodations || !data.travelData?.locations) {
    return {
      ...data,
      schemaVersion: 6,
      updatedAt: new Date().toISOString()
    };
  }
  
  // Fix accommodations with temp-location by finding which location references them
  data.accommodations = data.accommodations.map(accommodation => {
    if (accommodation.locationId !== 'temp-location') {
      return accommodation;
    }
    
    // Find the location that has this accommodation in its accommodationIds
    const parentLocation = data.travelData?.locations?.find(location => 
      location.accommodationIds?.includes(accommodation.id)
    );
    
    if (parentLocation) {
      fixLog.push(`Fixed accommodation ${accommodation.id} (${accommodation.name}): temp-location → ${parentLocation.id} (${parentLocation.name})`);
      return {
        ...accommodation,
        locationId: parentLocation.id
      };
    } else {
      fixLog.push(`Could not find parent location for accommodation ${accommodation.id} (${accommodation.name})`);
      return accommodation;
    }
  });
  
  // Log fix actions
  if (fixLog.length > 0) {
    console.log(`Trip ${tripId} v5→v6 migration temp-location fixes:`, fixLog);
  }
  
  return {
    ...data,
    schemaVersion: 6,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Migration handler for schema version updates
 */
export function migrateToLatestSchema(data: UnifiedTripData): UnifiedTripData {
  if (!data.schemaVersion || data.schemaVersion < 1) {
    throw new Error('Invalid schema version');
  }
  
  // Handle migrations:
  if (data.schemaVersion < 2) {
    data = migrateFromV1ToV2(data);
  }
  if (data.schemaVersion < 3) {
    data = migrateFromV2ToV3(data);
  }
  if (data.schemaVersion < 4) {
    data = migrateFromV3ToV4(data);
  }
  if (data.schemaVersion < 5) {
    data = migrateFromV4ToV5(data);
  }
  if (data.schemaVersion < 6) {
    data = migrateFromV5ToV6(data);
  }
  if (data.schemaVersion < 7) {
    data = migrateFromV6ToV7(data);
  }
  
  // Ensure current version
  if (data.schemaVersion < CURRENT_SCHEMA_VERSION) {
    data.schemaVersion = CURRENT_SCHEMA_VERSION;
    data.updatedAt = new Date().toISOString();
  }
  
  return data;
}
