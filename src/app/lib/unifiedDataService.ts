/**
 * Unified Data Service
 * 
 * Handles automatic migration and provides a unified interface for accessing
 * both travel and cost data, while maintaining backwards compatibility
 */

import { readFile, writeFile, readdir, unlink, access, mkdir } from 'fs/promises';
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
import { Location, Transportation, BudgetItem, Expense, YnabImportData, JourneyPeriod } from '../types';

const DATA_DIR = join(process.cwd(), 'data');
const BACKUP_DIR = join(DATA_DIR, 'backups');

async function ensureBackupDir() {
  try {
    await access(BACKUP_DIR);
  } catch {
    await mkdir(BACKUP_DIR, { recursive: true });
  }
}

export async function createTripBackup(id: string): Promise<void> {
  try {
    await ensureBackupDir();
    
    const tripData = await loadUnifiedTripData(id);
    if (!tripData) {
      throw new Error(`Trip ${id} not found for backup`);
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupData = {
      ...tripData,
      backupMetadata: {
        deletedAt: new Date().toISOString(),
        originalId: id,
        backupType: 'trip_deletion'
      }
    };
    
    const backupFilename = `deleted-trip-${id}-${timestamp}.json`;
    const backupPath = join(BACKUP_DIR, backupFilename);
    
    await writeFile(backupPath, JSON.stringify(backupData, null, 2));
    console.log(`Created backup for trip ${id} at ${backupPath}`);
  } catch (error) {
    console.error(`Failed to create backup for trip ${id}:`, error);
    throw new Error(`Backup creation failed: ${error}`);
  }
}

export async function deleteTripWithBackup(id: string): Promise<void> {
  try {
    // Create backup first
    await createTripBackup(id);
    
    // Remove unified trip file
    const unifiedPath = join(DATA_DIR, `trip-${id}.json`);
    try {
      await unlink(unifiedPath);
      console.log(`Deleted unified trip file: ${unifiedPath}`);
    } catch (error) {
      // File might not exist, check for legacy files
      console.log(`Unified trip file not found, checking legacy files`);
    }
    
    // Remove legacy files if they exist
    const legacyTravelPath = join(DATA_DIR, `travel-${id}.json`);
    const legacyCostPath = join(DATA_DIR, `cost-${id}.json`);
    
    try {
      await unlink(legacyTravelPath);
      console.log(`Deleted legacy travel file: ${legacyTravelPath}`);
    } catch {
      // Legacy travel file doesn't exist
    }
    
    try {
      await unlink(legacyCostPath);
      console.log(`Deleted legacy cost file: ${legacyCostPath}`);
    } catch {
      // Legacy cost file doesn't exist
    }
    
    console.log(`Successfully deleted trip ${id} with backup`);
  } catch (error) {
    console.error(`Failed to delete trip ${id}:`, error);
    throw error;
  }
}

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
      
      // Apply latest schema migration
      finalData = migrateToLatestSchema(finalData);
      
      // Save the migrated data
      await saveUnifiedTripData(finalData);
      
      // Clean up legacy files only if we actually found legacy data to migrate
      if (travelData || costData) {
        await cleanupLegacyFiles(finalData.id, travelData, costData);
      }
      
      return finalData;
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
    const trips = new Map<string, { id: string; title: string; startDate: string; endDate: string; createdAt: string; hasTravel: boolean; hasCost: boolean; isUnified: boolean; }>();
    
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
          const trip = trips.get(tripId);
          if (trip) {
            trip.hasCost = true;
          }
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
export async function updateTravelData(tripId: string, travelUpdates: Record<string, unknown>): Promise<UnifiedTripData> {
  const existing = await loadUnifiedTripData(tripId);
  
  const defaultData: UnifiedTripData = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: tripId,
    title: (travelUpdates.title as string) || '',
    description: (travelUpdates.description as string) || '',
    startDate: (travelUpdates.startDate as string) || '',
    endDate: (travelUpdates.endDate as string) || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  const baseData = existing || defaultData;
  
  const updated: UnifiedTripData = {
    ...baseData,
    title: (travelUpdates.title as string) || baseData.title,
    description: (travelUpdates.description as string) || baseData.description,
    startDate: (travelUpdates.startDate as string) || baseData.startDate,
    endDate: (travelUpdates.endDate as string) || baseData.endDate,
    updatedAt: new Date().toISOString(),
    travelData: {
      locations: (travelUpdates.locations as Location[]) || baseData.travelData?.locations || [],
      routes: (travelUpdates.routes as Transportation[]) || baseData.travelData?.routes || [],
      days: (travelUpdates.days as JourneyPeriod[]) || baseData.travelData?.days
    }
  };
  
  await saveUnifiedTripData(updated);
  return updated;
}

/**
 * Updates cost data in unified format
 */
export async function updateCostData(tripId: string, costUpdates: Record<string, unknown>): Promise<UnifiedTripData> {
  const existing = await loadUnifiedTripData(tripId);
  
  const defaultData: UnifiedTripData = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: tripId,
    title: (costUpdates.tripTitle as string) || '',
    description: '',
    startDate: (costUpdates.tripStartDate as string) || '',
    endDate: (costUpdates.tripEndDate as string) || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  const baseData = existing || defaultData;
  
  const updated: UnifiedTripData = {
    ...baseData,
    title: (costUpdates.tripTitle as string) || baseData.title,
    startDate: (costUpdates.tripStartDate as string) || baseData.startDate,
    endDate: (costUpdates.tripEndDate as string) || baseData.endDate,
    updatedAt: new Date().toISOString(),
    costData: {
      overallBudget: (costUpdates.overallBudget as number) ?? baseData.costData?.overallBudget ?? 0,
      currency: (costUpdates.currency as string) || baseData.costData?.currency || 'EUR',
      countryBudgets: (costUpdates.countryBudgets as BudgetItem[]) || baseData.costData?.countryBudgets || [],
      expenses: (costUpdates.expenses as Expense[]) || baseData.costData?.expenses || [],
      ynabImportData: (costUpdates.ynabImportData as YnabImportData) || baseData.costData?.ynabImportData
    }
  };
  
  await saveUnifiedTripData(updated);
  return updated;
}

/**
 * Cleans up legacy files after successful migration
 */
async function cleanupLegacyFiles(tripId: string, travelData: unknown, costData: unknown): Promise<void> {
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
      const costFilePath = join(DATA_DIR, `cost-${(costData as { id: string }).id}.json`);
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