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
  isUnifiedFormat, 
  migrateToLatestSchema,
  CURRENT_SCHEMA_VERSION
} from './dataMigration';
import { Location, Transportation, BudgetItem, Expense, YnabImportData, JourneyPeriod } from '../types';
import { backupService } from './backupService';

const DATA_DIR = join(process.cwd(), 'data');
const BACKUP_DIR = join(DATA_DIR, 'backups');

async function ensureBackupDir() {
  try {
    await access(BACKUP_DIR);
  } catch {
    await mkdir(BACKUP_DIR, { recursive: true });
  }
}

export async function createTripBackup(id: string, deletionReason?: string): Promise<void> {
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
    
    // Add metadata entry using the new backup service
    try {
      const backupType = tripData.costData ? 'cost' : 'trip';
      await backupService.addBackupMetadata(
        id,
        backupType,
        tripData.title,
        backupPath,
        deletionReason || 'trip_deletion'
      );
      console.log(`Added backup metadata for trip ${id}`);
    } catch (metadataError) {
      console.warn(`Failed to add backup metadata for trip ${id}:`, metadataError);
      // Don't fail the backup creation if metadata fails
    }
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
    await unlink(unifiedPath);
    console.log(`Deleted unified trip file: ${unifiedPath}`);
    
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
    // Load unified file
    const unifiedFilePath = join(DATA_DIR, `trip-${tripId}.json`);
    const unifiedContent = await readFile(unifiedFilePath, 'utf-8');
    const parsed = JSON.parse(unifiedContent);
    
    if (isUnifiedFormat(parsed)) {
      // Apply latest schema migration
      const migratedData = migrateToLatestSchema(parsed);
      
      // Save if migration was applied
      if (migratedData.schemaVersion !== parsed.schemaVersion) {
        await saveUnifiedTripData(migratedData);
      }
      
      return migratedData;
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
    
    // Process unified files only
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
    
    return Array.from(trips.values()).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch (error) {
    console.error('Error listing trips:', error);
    return [];
  }
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
      routes: (() => {
        const newRoutes = travelUpdates.routes as Transportation[];
        const existingRoutes = baseData.travelData?.routes || [];
        
        if (!newRoutes) return existingRoutes;
        
        // Merge routes, preserving routePoints from existing routes when not provided in updates
        return newRoutes.map((newRoute) => {
          const existingRoute = existingRoutes.find(r => r.id === newRoute.id);
          return {
            ...newRoute,
            // Preserve existing routePoints if not provided in the update
            routePoints: newRoute.routePoints || existingRoute?.routePoints
          };
        });
      })(),
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
