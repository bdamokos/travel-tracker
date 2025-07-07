/**
 * Data Migration System for Travel Tracker
 * 
 * Handles migration from separate travel/cost files to unified data model
 * while maintaining backwards compatibility and future-proofing
 */

import { Journey, CostTrackingData } from '../types';

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
    locations?: any[];
    routes?: any[];
    // New Journey format
    days?: Journey['days'];
  };
  
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
 * Legacy travel data format
 */
interface LegacyTravelData {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  locations: any[];
  routes: any[];
  days?: any[];
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Legacy cost data format
 */
interface LegacyCostData {
  id: string;
  tripId: string;
  tripTitle: string;
  tripStartDate: string;
  tripEndDate: string;
  overallBudget: number;
  currency: string;
  countryBudgets: any[];
  expenses: any[];
  ynabImportData?: any;
  createdAt: string;
  updatedAt?: string;
}

/**
 * Migrates legacy travel data to unified format
 */
export function migrateLegacyTravelData(
  travelData: LegacyTravelData, 
  costData?: LegacyCostData
): UnifiedTripData {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: travelData.id,
    title: travelData.title,
    description: travelData.description,
    startDate: travelData.startDate,
    endDate: travelData.endDate,
    createdAt: travelData.createdAt || new Date().toISOString(),
    updatedAt: travelData.updatedAt || new Date().toISOString(),
    
    travelData: {
      locations: travelData.locations || [],
      routes: travelData.routes || [],
      days: travelData.days
    },
    
    costData: costData ? {
      overallBudget: costData.overallBudget,
      currency: costData.currency,
      countryBudgets: costData.countryBudgets,
      expenses: costData.expenses,
      ynabImportData: costData.ynabImportData
    } : undefined
  };
}

/**
 * Migrates legacy cost data to unified format (for standalone cost trackers)
 */
export function migrateLegacyCostData(costData: LegacyCostData): UnifiedTripData {
  // Clean the trip ID to avoid duplicate prefixes if cost ID was used as tripId (handle multiple repeated prefixes)
  const cleanTripId = costData.tripId.replace(/^(cost-)+/, '');
  
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: cleanTripId, // Use clean tripId as the unified ID
    title: costData.tripTitle,
    description: '',
    startDate: costData.tripStartDate,
    endDate: costData.tripEndDate,
    createdAt: costData.createdAt,
    updatedAt: costData.updatedAt || new Date().toISOString(),
    
    // No travel data for cost-only entries
    travelData: undefined,
    
    costData: {
      overallBudget: costData.overallBudget,
      currency: costData.currency,
      countryBudgets: costData.countryBudgets,
      expenses: costData.expenses,
      ynabImportData: costData.ynabImportData
    }
  };
}

/**
 * Checks if data is already in unified format
 */
export function isUnifiedFormat(data: any): data is UnifiedTripData {
  return data && typeof data.schemaVersion === 'number' && data.schemaVersion >= 1;
}

/**
 * Checks if data is legacy travel format
 */
export function isLegacyTravelFormat(data: any): data is LegacyTravelData {
  return data && data.locations && Array.isArray(data.locations) && !data.schemaVersion;
}

/**
 * Checks if data is legacy cost format
 */
export function isLegacyCostFormat(data: any): data is LegacyCostData {
  return data && data.tripId && data.expenses && Array.isArray(data.expenses) && !data.schemaVersion;
}

/**
 * Current schema version - increment when introducing breaking changes
 */
export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Future migration handler for schema version updates
 */
export function migrateToLatestSchema(data: UnifiedTripData): UnifiedTripData {
  if (!data.schemaVersion || data.schemaVersion < 1) {
    throw new Error('Invalid schema version');
  }
  
  // Handle future migrations here:
  // if (data.schemaVersion < 2) {
  //   data = migrateFromV1ToV2(data);
  // }
  // if (data.schemaVersion < 3) {
  //   data = migrateFromV2ToV3(data);
  // }
  
  // Ensure current version
  if (data.schemaVersion < CURRENT_SCHEMA_VERSION) {
    data.schemaVersion = CURRENT_SCHEMA_VERSION;
    data.updatedAt = new Date().toISOString();
  }
  
  return data;
}

/**
 * Extracts legacy travel data format from unified data
 * (for backwards compatibility with existing components)
 */
export function extractLegacyTravelData(unifiedData: UnifiedTripData): LegacyTravelData {
  return {
    id: unifiedData.id,
    title: unifiedData.title,
    description: unifiedData.description,
    startDate: unifiedData.startDate,
    endDate: unifiedData.endDate,
    locations: unifiedData.travelData?.locations || [],
    routes: unifiedData.travelData?.routes || [],
    days: unifiedData.travelData?.days,
    createdAt: unifiedData.createdAt,
    updatedAt: unifiedData.updatedAt
  };
}

/**
 * Extracts legacy cost data format from unified data
 * (for backwards compatibility with existing components)
 */
export function extractLegacyCostData(unifiedData: UnifiedTripData): LegacyCostData | null {
  if (!unifiedData.costData) return null;
  
  // Clean the trip ID to avoid duplicate prefixes (handle multiple repeated prefixes)
  const cleanTripId = unifiedData.id.replace(/^(cost-)+/, '');
  
  return {
    id: `cost-${cleanTripId}`, // Generate cost ID from clean trip ID
    tripId: cleanTripId, // Use clean trip ID
    tripTitle: unifiedData.title,
    tripStartDate: unifiedData.startDate,
    tripEndDate: unifiedData.endDate,
    overallBudget: unifiedData.costData.overallBudget,
    currency: unifiedData.costData.currency,
    countryBudgets: unifiedData.costData.countryBudgets,
    expenses: unifiedData.costData.expenses,
    ynabImportData: unifiedData.costData.ynabImportData,
    createdAt: unifiedData.createdAt,
    updatedAt: unifiedData.updatedAt
  };
}