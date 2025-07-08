/**
 * Unified Data Service
 * 
 * Handles automatic migration and provides a unified interface for accessing
 * both travel and cost data, while maintaining backwards compatibility
 */

import { readFile, writeFile, readdir, unlink } from 'fs/promises';
import { join } from 'path';
import { 
  UnifiedTripData, 
  migrateLegacyTravelData, 
  migrateLegacyCostData,
  isUnifiedFormat, 
  isLegacyTravelFormat, 
  isLegacyCostFormat,
  migrateToLatestSchema,
  extractLegacyTravelData,
  extractLegacyCostData,
  CURRENT_SCHEMA_VERSION
} from './dataMigration';

const DATA_DIR = join(process.cwd(), 'data');

/**
 * Loads and migrates data automatically
 */
export async function loadUnifiedTripData(tripId: string): Promise<UnifiedTripData | null> {
  try {
    // Try to load unified file first
    const unifiedFilePath = join(DATA_DIR, `trip-${tripId}.json`);
    let unifiedData = null;
    try {
      const unifiedContent = await readFile(unifiedFilePath, 'utf-8');
      const parsed = JSON.parse(unifiedContent);
      
      if (isUnifiedFormat(parsed)) {
        unifiedData = parsed;
      }
    } catch {
      // Unified file doesn't exist, continue to try legacy files
    }
    
    // Try to load legacy travel file
    const travelFilePath = join(DATA_DIR, `travel-${tripId}.json`);
    let travelData = null;
    try {
      const travelContent = await readFile(travelFilePath, 'utf-8');
      const parsed = JSON.parse(travelContent);
      if (isLegacyTravelFormat(parsed)) {
        travelData = parsed;
      }
    } catch {
      // Travel file doesn't exist
    }
    
    // Try to find corresponding cost file
    let costData = null;
    try {
      const files = await readdir(DATA_DIR);
      const costFiles = files.filter(f => f.startsWith('cost-') && f.endsWith('.json'));
      
      for (const costFile of costFiles) {
        const costContent = await readFile(join(DATA_DIR, costFile), 'utf-8');
        const parsed = JSON.parse(costContent);
        
        if (isLegacyCostFormat(parsed) && parsed.tripId === tripId) {
          costData = parsed;
          break;
        }
      }
    } catch {
      // No cost files or error reading them
    }
    
    // Merge unified data with any legacy data found
    if (unifiedData || travelData || costData) {
      let finalData: UnifiedTripData;
      
      if (unifiedData) {
        // We have unified data - merge any additional legacy data
        finalData = { ...unifiedData };
        
        // Merge travel data if it's missing and we found legacy travel data
        if (!finalData.travelData && travelData) {
          finalData.travelData = {
            locations: travelData.locations || [],
            routes: travelData.routes || [],
            days: travelData.days
          };
          finalData.title = travelData.title || finalData.title;
          finalData.description = travelData.description || finalData.description;
        }
        
        // Merge cost data if it's missing and we found legacy cost data
        if (!finalData.costData && costData) {
          finalData.costData = {
            overallBudget: costData.overallBudget,
            currency: costData.currency,
            countryBudgets: costData.countryBudgets,
            expenses: costData.expenses,
            ynabImportData: costData.ynabImportData
          };
        }
        
        // Update metadata if we have travel data
        if (travelData) {
          finalData.title = travelData.title || finalData.title;
          finalData.description = travelData.description || finalData.description;
          finalData.startDate = travelData.startDate || finalData.startDate;
          finalData.endDate = travelData.endDate || finalData.endDate;
          finalData.updatedAt = new Date().toISOString();
        }
      } else {
        // No unified data - migrate from legacy
        finalData = travelData 
          ? migrateLegacyTravelData(travelData, costData || undefined)
          : migrateLegacyCostData(costData!);
      }
      
      // Save the merged/migrated data
      await saveUnifiedTripData(finalData);
      
      // Clean up legacy files only if we actually found legacy data to migrate
      if (travelData || costData) {
        await cleanupLegacyFiles(finalData.id, travelData, costData);
      }
      
      return migrateToLatestSchema(finalData);
    }
    
    return null;
  } catch (error) {
    console.error('Error loading unified trip data:', error);
    return null;
  }
}

/**
 * Saves data in unified format
 */
export async function saveUnifiedTripData(data: UnifiedTripData): Promise<void> {
  const filePath = join(DATA_DIR, `trip-${data.id}.json`);
  await writeFile(filePath, JSON.stringify(data, null, 2));
}

/**
 * Lists all trips (unified and legacy)
 */
export async function listAllTrips(): Promise<Array<{
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  hasTravel: boolean;
  hasCost: boolean;
  isUnified: boolean;
}>> {
  try {
    const files = await readdir(DATA_DIR);
    const trips = new Map<string, any>();
    
    // Process unified files
    const unifiedFiles = files.filter(f => f.startsWith('trip-') && f.endsWith('.json'));
    for (const file of unifiedFiles) {
      const content = await readFile(join(DATA_DIR, file), 'utf-8');
      const data = JSON.parse(content);
      
      if (isUnifiedFormat(data)) {
        trips.set(data.id, {
          id: data.id,
          title: data.title,
          startDate: data.startDate,
          endDate: data.endDate,
          createdAt: data.createdAt,
          hasTravel: !!data.travelData,
          hasCost: !!data.costData,
          isUnified: true
        });
      }
    }
    
    // Process legacy travel files
    const travelFiles = files.filter(f => f.startsWith('travel-') && f.endsWith('.json'));
    for (const file of travelFiles) {
      const content = await readFile(join(DATA_DIR, file), 'utf-8');
      const data = JSON.parse(content);
      
      if (isLegacyTravelFormat(data) && !trips.has(data.id)) {
        trips.set(data.id, {
          id: data.id,
          title: data.title,
          startDate: data.startDate,
          endDate: data.endDate,
          createdAt: data.createdAt || data.updatedAt || new Date().toISOString(),
          hasTravel: true,
          hasCost: false,
          isUnified: false
        });
      }
    }
    
    // Check for corresponding cost files for legacy travel
    const costFiles = files.filter(f => f.startsWith('cost-') && f.endsWith('.json'));
    for (const file of costFiles) {
      const content = await readFile(join(DATA_DIR, file), 'utf-8');
      const data = JSON.parse(content);
      
      if (isLegacyCostFormat(data)) {
        const tripId = data.tripId;
        if (trips.has(tripId)) {
          trips.get(tripId).hasCost = true;
        } else {
          // Standalone cost tracker
          trips.set(tripId, {
            id: tripId,
            title: data.tripTitle,
            startDate: data.tripStartDate,
            endDate: data.tripEndDate,
            createdAt: data.createdAt,
            hasTravel: false,
            hasCost: true,
            isUnified: false
          });
        }
      }
    }
    
    return Array.from(trips.values()).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch (error) {
    console.error('Error listing trips:', error);
    return [];
  }
}

/**
 * Backwards compatibility: Get travel data in legacy format
 */
export async function getLegacyTravelData(tripId: string) {
  const unifiedData = await loadUnifiedTripData(tripId);
  return unifiedData ? extractLegacyTravelData(unifiedData) : null;
}

/**
 * Backwards compatibility: Get cost data in legacy format
 */
export async function getLegacyCostData(tripId: string) {
  const unifiedData = await loadUnifiedTripData(tripId);
  return unifiedData ? extractLegacyCostData(unifiedData) : null;
}

/**
 * Updates travel data in unified format
 */
export async function updateTravelData(tripId: string, travelUpdates: any): Promise<UnifiedTripData> {
  const existing = await loadUnifiedTripData(tripId);
  
  const defaultData: UnifiedTripData = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: tripId,
    title: travelUpdates.title || '',
    description: travelUpdates.description || '',
    startDate: travelUpdates.startDate || '',
    endDate: travelUpdates.endDate || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  const baseData = existing || defaultData;
  
  const updated: UnifiedTripData = {
    ...baseData,
    title: travelUpdates.title || baseData.title,
    description: travelUpdates.description || baseData.description,
    startDate: travelUpdates.startDate || baseData.startDate,
    endDate: travelUpdates.endDate || baseData.endDate,
    updatedAt: new Date().toISOString(),
    travelData: {
      locations: travelUpdates.locations || baseData.travelData?.locations || [],
      routes: travelUpdates.routes || baseData.travelData?.routes || [],
      days: travelUpdates.days || baseData.travelData?.days
    }
  };
  
  await saveUnifiedTripData(updated);
  return updated;
}

/**
 * Updates cost data in unified format
 */
export async function updateCostData(tripId: string, costUpdates: any): Promise<UnifiedTripData> {
  const existing = await loadUnifiedTripData(tripId);
  
  const defaultData: UnifiedTripData = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: tripId,
    title: costUpdates.tripTitle || '',
    description: '',
    startDate: costUpdates.tripStartDate || '',
    endDate: costUpdates.tripEndDate || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  const baseData = existing || defaultData;
  
  const updated: UnifiedTripData = {
    ...baseData,
    title: costUpdates.tripTitle || baseData.title,
    startDate: costUpdates.tripStartDate || baseData.startDate,
    endDate: costUpdates.tripEndDate || baseData.endDate,
    updatedAt: new Date().toISOString(),
    costData: {
      overallBudget: costUpdates.overallBudget ?? baseData.costData?.overallBudget ?? 0,
      currency: costUpdates.currency || baseData.costData?.currency || 'EUR',
      countryBudgets: costUpdates.countryBudgets || baseData.costData?.countryBudgets || [],
      expenses: costUpdates.expenses || baseData.costData?.expenses || [],
      ynabImportData: costUpdates.ynabImportData || baseData.costData?.ynabImportData
    }
  };
  
  await saveUnifiedTripData(updated);
  return updated;
}

/**
 * Cleans up legacy files after successful migration
 */
async function cleanupLegacyFiles(tripId: string, travelData: any, costData: any): Promise<void> {
  try {
    const promises = [];
    
    // Remove legacy travel file if it was migrated
    if (travelData) {
      const travelFilePath = join(DATA_DIR, `travel-${tripId}.json`);
      promises.push(
        unlink(travelFilePath).catch(() => {
          // File might not exist, ignore error
        })
      );
    }
    
    // Remove legacy cost file if it was migrated
    if (costData) {
      const costFilePath = join(DATA_DIR, `cost-${costData.id}.json`);
      promises.push(
        unlink(costFilePath).catch(() => {
          // File might not exist, ignore error
        })
      );
    }
    
    await Promise.all(promises);
    console.log(`Cleaned up legacy files for trip ${tripId}`);
  } catch (error) {
    console.warn('Error cleaning up legacy files:', error);
    // Don't throw - cleanup failure shouldn't break the migration
  }
}