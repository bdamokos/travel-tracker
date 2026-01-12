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
import { Location, Transportation, BudgetItem, Expense, YnabImportData, YnabConfig, JourneyPeriod, Accommodation } from '@/app/types';
import { backupService } from './backupService';
import { getUnifiedTripFilePath, getBackupFilePath } from './dataFilePaths';
import { getDataDir } from './dataDirectory';
import { dateReviver } from './jsonDateReviver';
import { buildTripUpdates } from './tripUpdates';

const getDataDirPath = () => getDataDir();
const getBackupDirPath = () => join(getDataDirPath(), 'backups');

async function ensureBackupDir() {
  try {
    await access(getBackupDirPath());
  } catch {
    await mkdir(getBackupDirPath(), { recursive: true });
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
    const backupPath = getBackupFilePath(backupFilename);

    await writeFile(backupPath, JSON.stringify(backupData, null, 2));
    console.log('Created backup for trip %s at %s', id, backupPath);

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
      console.log('Added backup metadata for trip %s', id);
    } catch (metadataError) {
      console.warn('Failed to add backup metadata for trip %s:', id, metadataError);
      // Don't fail the backup creation if metadata fails
    }
  } catch (error) {
    console.error('Failed to create backup for trip %s:', id, error);
    throw new Error(`Backup creation failed: ${error}`);
  }
}

export async function deleteTripWithBackup(id: string): Promise<void> {
  try {
    // Create backup first
    await createTripBackup(id);

    // Remove unified trip file
    const unifiedPath = getUnifiedTripFilePath(id);
    await unlink(unifiedPath);
    console.log('Deleted unified trip file: %s', unifiedPath);

    console.log('Successfully deleted trip %s with backup', id);
  } catch (error) {
    console.error('Failed to delete trip %s:', id, error);
    throw error;
  }
}

/**
 * Loads and migrates data automatically
 */
export async function loadUnifiedTripData(tripId: string): Promise<UnifiedTripData | null> {
  try {
    // Load unified file
    const unifiedFilePath = getUnifiedTripFilePath(tripId);
    const unifiedContent = await readFile(unifiedFilePath, 'utf-8');
    const parsed = JSON.parse(unifiedContent, dateReviver);

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
  const filePath = getUnifiedTripFilePath(data.id);
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
  locationCount: number;
  accommodationCount: number;
  routeCount: number;
}>> {
  try {
    const files = await readdir(getDataDirPath());
    const trips = new Map<string, {
      id: string;
      title: string;
      startDate: string;
      endDate: string;
      createdAt: string;
      hasTravel: boolean;
      hasCost: boolean;
      isUnified: boolean;
      locationCount: number;
      accommodationCount: number;
      routeCount: number;
    }>();

    // Process unified files only
    const unifiedFiles = files.filter(f => f.startsWith('trip-') && f.endsWith('.json'));
    for (const file of unifiedFiles) {
      const content = await readFile(join(getDataDirPath(), file), 'utf-8');
      const data = JSON.parse(content);

      if (isUnifiedFormat(data)) {
        const locationCount =
          (Array.isArray(data.travelData?.locations) ? data.travelData.locations.length : 0) +
          (Array.isArray(data.travelData?.days)
            ? data.travelData.days.reduce(
                (sum: number, day: { locations?: unknown[] }) => sum + (day.locations?.length || 0),
                0
              )
            : 0);

        const routeCount =
          (Array.isArray(data.travelData?.routes) ? data.travelData.routes.length : 0) +
          (Array.isArray(data.travelData?.days)
            ? data.travelData.days.reduce(
                (sum: number, day: { transportation?: unknown }) => sum + (day.transportation ? 1 : 0),
                0
              )
            : 0);

        const accommodationCount = Array.isArray(data.accommodations) ? data.accommodations.length : 0;

        trips.set(data.id, {
          id: data.id,
          title: data.title,
          startDate: data.startDate,
          endDate: data.endDate,
          createdAt: data.createdAt,
          hasTravel: !!data.travelData,
          hasCost: !!data.costData,
          isUnified: true,
          locationCount,
          accommodationCount,
          routeCount
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
  const newUpdates = existing
    ? buildTripUpdates(existing, {
        locations: travelUpdates.locations as Location[] | undefined,
        routes: travelUpdates.routes as Transportation[] | undefined
      })
    : [];
  const MAX_STORED_UPDATES = 100;
  const mergedUpdates = [...newUpdates, ...(baseData.publicUpdates || [])].slice(0, MAX_STORED_UPDATES);

  const resolvedInstagramUsername = (() => {
    if ('instagramUsername' in travelUpdates) {
      return travelUpdates.instagramUsername as string | undefined;
    }
    const nestedTravelData = travelUpdates.travelData;
    if (typeof nestedTravelData === 'object' && nestedTravelData !== null && 'instagramUsername' in nestedTravelData) {
      return nestedTravelData.instagramUsername as string | undefined;
    }
    return baseData.travelData?.instagramUsername;
  })();

  const updated: UnifiedTripData = {
    ...baseData,
    title: (travelUpdates.title as string) || baseData.title,
    description: (travelUpdates.description as string) || baseData.description,
    startDate: (travelUpdates.startDate as string) || baseData.startDate,
    endDate: (travelUpdates.endDate as string) || baseData.endDate,
    updatedAt: new Date().toISOString(),
    travelData: {
      instagramUsername: resolvedInstagramUsername,
      locations: (() => {
        const newLocations = travelUpdates.locations as Location[];
        const existingLocations = baseData.travelData?.locations || [];

        if (!newLocations) return existingLocations;

        // Merge locations, preserving existing costTrackingLinks and accommodationIds.
        // Both are managed by dedicated endpoints/SWR flows and autosave payloads can be stale.
        return newLocations.map((newLocation) => {
          const existingLocation = existingLocations.find(l => l.id === newLocation.id);
          const { costTrackingLinks: _, accommodationIds: incomingAccommodationIds, ...locationWithoutLinks } = newLocation;
          return {
            ...existingLocation,
            ...locationWithoutLinks,
            // Preserve existing costTrackingLinks - they're managed by the SWR expense linking system
            costTrackingLinks: existingLocation?.costTrackingLinks || [],
            // Preserve existing accommodationIds to avoid reintroducing stale/orphaned IDs after deletes
            accommodationIds: existingLocation?.accommodationIds ?? incomingAccommodationIds ?? []
          };
        });
      })(),
      routes: (() => {
        const newRoutes = travelUpdates.routes as Transportation[];
        const existingRoutes = baseData.travelData?.routes || [];

        if (!newRoutes) return existingRoutes;

        // Merge routes, preserving existing costTrackingLinks (managed by SWR system) and routePoints
        return newRoutes.map((newRoute) => {
          const existingRoute = existingRoutes.find(r => r.id === newRoute.id);
          const { costTrackingLinks: _, ...routeWithoutLinks } = newRoute;

          const mergeSubRoutes = (
            incomingSubRoutes?: Transportation['subRoutes'],
            existingSubRoutes?: Transportation['subRoutes']
          ): Transportation['subRoutes'] => {
            if (!incomingSubRoutes) return existingSubRoutes;

            return incomingSubRoutes.map((subRoute) => {
              const existingSubRoute = existingSubRoutes?.find(existing => existing.id === subRoute.id);
              const { costTrackingLinks: __, ...subRouteWithoutLinks } = subRoute;
              return {
                ...existingSubRoute,
                ...subRouteWithoutLinks,
                // Preserve existing routePoints if not provided in the update
                routePoints: subRoute.routePoints || existingSubRoute?.routePoints,
                // Preserve existing costTrackingLinks - they're managed by the SWR expense linking system
                costTrackingLinks: existingSubRoute?.costTrackingLinks || []
              };
            });
          };

          return {
            ...existingRoute,
            ...routeWithoutLinks,
            // Preserve existing routePoints if not provided in the update
            routePoints: newRoute.routePoints || existingRoute?.routePoints,
            // Preserve existing costTrackingLinks - they're managed by the SWR expense linking system
            costTrackingLinks: existingRoute?.costTrackingLinks || [],
            subRoutes: mergeSubRoutes(newRoute.subRoutes, existingRoute?.subRoutes)
          };
        });
      })(),
      days: (travelUpdates.days as JourneyPeriod[]) || baseData.travelData?.days
    },
    // Preserve accommodations from the existing data.
    // Accommodations are managed via dedicated endpoints/SWR and travel-data autosave can be stale.
    // If we merge from travelUpdates here, we can accidentally overwrite newer accommodation edits.
    accommodations: (() => {
      const existingAccommodations = baseData.accommodations || [];

      // Allow seeding accommodations only when the trip has none yet (e.g., legacy clients or
      // creation payloads). After that, ignore incoming accommodations to avoid stale overwrites.
      if (existingAccommodations.length > 0) {
        return existingAccommodations;
      }

      const newAccommodations = travelUpdates.accommodations as Accommodation[] | undefined;
      return Array.isArray(newAccommodations) ? newAccommodations : [];
    })(),
    publicUpdates: mergedUpdates
  };

  // Fix temp-location references in accommodations
  // This ensures that when locations are saved with accommodations, 
  // the accommodations get their locationId updated from "temp-location" to the actual location ID
  if (updated.accommodations && updated.travelData?.locations) {
    const tempLocationFixLog: string[] = [];

    updated.accommodations = updated.accommodations.map(accommodation => {
      if (accommodation.locationId === 'temp-location') {
        // Find the location that references this accommodation
        const parentLocation = updated.travelData?.locations?.find(location =>
          location.accommodationIds?.includes(accommodation.id)
        );

        if (parentLocation) {
          tempLocationFixLog.push(`Fixed accommodation ${accommodation.id} (${accommodation.name}): temp-location → ${parentLocation.id} (${parentLocation.name})`);
          return {
            ...accommodation,
            locationId: parentLocation.id,
            updatedAt: new Date().toISOString()
          };
        } else {
          // Log warning if no parent location found
          tempLocationFixLog.push(`Warning: Could not find parent location for accommodation ${accommodation.id} (${accommodation.name}) with temp-location`);
        }
      }
      return accommodation;
    });

    // Log fixes if any were made
    if (tempLocationFixLog.length > 0) {
      console.log('Trip %s temp-location cleanup:', tripId, tempLocationFixLog);
    }
  }

  await saveUnifiedTripData(updated);
  return updated;
}

/**
 * Updates cost data in unified format
 */
export async function updateCostData(tripId: string, costUpdates: Record<string, unknown>): Promise<UnifiedTripData> {
  const existing = await loadUnifiedTripData(tripId);

  const incomingOverall = (costUpdates.overallBudget as number) ?? existing?.costData?.overallBudget ?? 0;
  const overallBudget = Math.max(0, incomingOverall);
  const incomingReserved = (costUpdates.reservedBudget as number) ?? existing?.costData?.reservedBudget ?? 0;
  const reservedBudget = Math.min(Math.max(0, incomingReserved), overallBudget);

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

  const incomingCustomCategories = Array.isArray(costUpdates.customCategories)
    ? (costUpdates.customCategories as unknown[]).filter((category): category is string => typeof category === 'string')
    : undefined;

  const resolvedCustomCategories = incomingCustomCategories
    ? [...incomingCustomCategories]
    : baseData.costData?.customCategories
      ? [...baseData.costData.customCategories]
      : undefined;

  const updated: UnifiedTripData = {
    ...baseData,
    title: (costUpdates.tripTitle as string) || baseData.title,
    startDate: (costUpdates.tripStartDate as string) || baseData.startDate,
    endDate: (costUpdates.tripEndDate as string) || baseData.endDate,
    updatedAt: new Date().toISOString(),
    costData: {
      overallBudget,
      reservedBudget,
      currency: (costUpdates.currency as string) || baseData.costData?.currency || 'EUR',
      countryBudgets: (costUpdates.countryBudgets as BudgetItem[]) || baseData.costData?.countryBudgets || [],
      expenses: (costUpdates.expenses as Expense[]) || baseData.costData?.expenses || [],
      ...(resolvedCustomCategories ? { customCategories: resolvedCustomCategories } : {}),
      ynabImportData: (costUpdates.ynabImportData as YnabImportData) || baseData.costData?.ynabImportData,
      ynabConfig: (costUpdates.ynabConfig as YnabConfig) || baseData.costData?.ynabConfig // YNAB API configuration
    }
  };

  await saveUnifiedTripData(updated);
  return updated;
}

/**
 * Cleans up legacy files after successful migration
 */

 
