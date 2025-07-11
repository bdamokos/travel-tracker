/**
 * Data Migration System for Travel Tracker
 * 
 * Handles unified data model and schema migrations
 */

import { Journey, CostTrackingData, Location, Transportation, Accommodation } from '../types';

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
    ynabImportData?: CostTrackingData['ynabImportData'];
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
export const CURRENT_SCHEMA_VERSION = 3;

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
  
  // Ensure current version
  if (data.schemaVersion < CURRENT_SCHEMA_VERSION) {
    data.schemaVersion = CURRENT_SCHEMA_VERSION;
    data.updatedAt = new Date().toISOString();
  }
  
  return data;
}