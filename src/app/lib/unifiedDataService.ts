/**
 * Unified Data Service
 * 
 * Handles automatic migration and provides a unified interface for accessing
 * both travel and cost data, while maintaining backwards compatibility
 */

import { readFile, writeFile, readdir, unlink, access, mkdir, rename } from 'fs/promises';
import { basename, dirname, join } from 'path';
import {
  UnifiedTripData,
  isUnifiedFormat,
  migrateToLatestSchema,
  CURRENT_SCHEMA_VERSION
} from './dataMigration';
import { Location, Transportation, BudgetItem, Expense, YnabImportData, YnabConfig, JourneyPeriod, Accommodation, CostTrackingLink } from '@/app/types';
import { backupService } from './backupService';
import { getUnifiedTripFilePath, getBackupFilePath } from './dataFilePaths';
import { getDataDir } from './dataDirectory';
import { dateReviver } from './jsonDateReviver';
import { buildTripUpdates } from './tripUpdates';
import { ConflictError, NotFoundError, ValidationError } from './errors';

const getDataDirPath = () => getDataDir();
const getBackupDirPath = () => join(getDataDirPath(), 'backups');
const saveQueues = new Map<string, Promise<void>>();

type DeletionBackupKind = 'trip' | 'cost';

async function ensureBackupDir() {
  try {
    await access(getBackupDirPath());
  } catch {
    await mkdir(getBackupDirPath(), { recursive: true });
  }
}

function getCorruptionCutoffPosition(rawContent: string, error: unknown): number | null {
  if (error instanceof Error) {
    const positionMatch = error.message.match(/position (\d+)/);
    if (positionMatch) {
      const parsed = Number.parseInt(positionMatch[1], 10);
      if (Number.isFinite(parsed) && parsed > 0 && parsed <= rawContent.length) {
        return parsed;
      }
    }
  }

  const firstNull = rawContent.indexOf('\u0000');
  if (firstNull > 0) {
    return firstNull;
  }

  return null;
}

async function recoverCorruptedUnifiedTripFile(
  tripId: string,
  filePath: string,
  fileContent: Buffer,
  parseError: unknown
): Promise<UnifiedTripData | null> {
  const rawContent = fileContent.toString('utf-8');
  const cutoff = getCorruptionCutoffPosition(rawContent, parseError);
  if (!cutoff) {
    return null;
  }

  const candidateContent = rawContent.slice(0, cutoff).trimEnd();
  if (!candidateContent) {
    return null;
  }

  let parsedCandidate: unknown;
  try {
    parsedCandidate = JSON.parse(candidateContent);
  } catch {
    return null;
  }

  if (!isUnifiedFormat(parsedCandidate)) {
    return null;
  }

  const recoveredData = migrateToLatestSchema(parsedCandidate);

  await ensureBackupDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = getBackupFilePath(`corrupted-trip-${tripId}-${timestamp}.json.corrupt`);
  await writeFile(backupPath, fileContent);

  await saveUnifiedTripData(recoveredData);
  console.warn('Recovered corrupted trip file %s (backup: %s)', filePath, backupPath);

  return recoveredData;
}

function clearCostLinksFromTransportation(transportation?: Transportation): Transportation | undefined {
  if (!transportation) return undefined;
  const { subRoutes, ...rest } = transportation;
  return {
    ...(rest as Transportation),
    costTrackingLinks: [],
    subRoutes: Array.isArray(subRoutes)
      ? subRoutes.map((segment) => ({
          ...segment,
          costTrackingLinks: []
        }))
      : subRoutes
  };
}

function clearCostTrackingLinks(tripData: UnifiedTripData): UnifiedTripData {
  const travelData = tripData.travelData;
  const accommodations = Array.isArray(tripData.accommodations)
    ? tripData.accommodations.map((accommodation) => ({
        ...accommodation,
        costTrackingLinks: []
      }))
    : tripData.accommodations;

  if (!travelData) {
    return { ...tripData, accommodations };
  }

  const locations = Array.isArray(travelData.locations)
    ? travelData.locations.map((location) => ({
        ...location,
        costTrackingLinks: []
      }))
    : travelData.locations;

  const routes = Array.isArray(travelData.routes)
    ? travelData.routes.map((route) => clearCostLinksFromTransportation(route) as Transportation)
    : travelData.routes;

  const days = Array.isArray(travelData.days)
    ? travelData.days.map((period) => ({
        ...period,
        locations: Array.isArray(period.locations)
          ? period.locations.map((location) => ({
              ...location,
              costTrackingLinks: []
            }))
          : period.locations,
        transportation: clearCostLinksFromTransportation(period.transportation)
      }))
    : travelData.days;

  return {
    ...tripData,
    travelData: {
      ...travelData,
      locations,
      routes,
      days
    },
    accommodations
  };
}

function mergeCostTrackingLinks(
  existingLinks: CostTrackingLink[] | undefined,
  restoredLinks: CostTrackingLink[] | undefined
): CostTrackingLink[] {
  const existing = Array.isArray(existingLinks) ? existingLinks : [];
  const restored = Array.isArray(restoredLinks) ? restoredLinks : [];
  if (existing.length === 0) return restored;
  if (restored.length === 0) return existing;

  const existingKeys = new Set(existing.map(link => link.expenseId).filter(Boolean));
  const merged = [...existing];
  for (const link of restored) {
    if (link.expenseId && !existingKeys.has(link.expenseId)) {
      merged.push(link);
      existingKeys.add(link.expenseId);
    }
  }
  return merged;
}

function mergeRestoredLinksIntoTrip(current: UnifiedTripData, restored: UnifiedTripData): UnifiedTripData {
  const mergeLocations = (currentLocations?: Location[], restoredLocations?: Location[]) => {
    if (!Array.isArray(currentLocations) || !Array.isArray(restoredLocations)) return currentLocations;
    return currentLocations.map((location) => {
      const restoredLocation = restoredLocations.find((candidate) => candidate.id === location.id);
      if (!restoredLocation) return location;
      return {
        ...location,
        costTrackingLinks: mergeCostTrackingLinks(location.costTrackingLinks, restoredLocation.costTrackingLinks)
      };
    });
  };

  const mergeTransportation = (currentRoute?: Transportation, restoredRoute?: Transportation): Transportation | undefined => {
    if (!currentRoute) return undefined;
    if (!restoredRoute) return currentRoute;
    const currentSubRoutes = Array.isArray(currentRoute.subRoutes) ? currentRoute.subRoutes : [];
    const restoredSubRoutes = Array.isArray(restoredRoute.subRoutes) ? restoredRoute.subRoutes : [];

    return {
      ...currentRoute,
      costTrackingLinks: mergeCostTrackingLinks(currentRoute.costTrackingLinks, restoredRoute.costTrackingLinks),
      subRoutes: currentSubRoutes.length
        ? currentSubRoutes.map((segment) => {
            const restoredSegment = restoredSubRoutes.find((candidate) => candidate.id === segment.id);
            if (!restoredSegment) return segment;
            return {
              ...segment,
              costTrackingLinks: mergeCostTrackingLinks(segment.costTrackingLinks, restoredSegment.costTrackingLinks)
            };
          })
        : currentRoute.subRoutes
    };
  };

  const mergeRoutes = (currentRoutes?: Transportation[], restoredRoutes?: Transportation[]) => {
    if (!Array.isArray(currentRoutes) || !Array.isArray(restoredRoutes)) return currentRoutes;
    return currentRoutes.map((route) => {
      const restoredRoute = restoredRoutes.find((candidate) => candidate.id === route.id);
      return mergeTransportation(route, restoredRoute) as Transportation;
    });
  };

  const mergeDays = (currentDays?: JourneyPeriod[], restoredDays?: JourneyPeriod[]) => {
    if (!Array.isArray(currentDays) || !Array.isArray(restoredDays)) return currentDays;
    return currentDays.map((period) => {
      const restoredPeriod = restoredDays.find((candidate) => candidate.id === period.id);
      if (!restoredPeriod) return period;
      return {
        ...period,
        locations: mergeLocations(period.locations, restoredPeriod.locations) as JourneyPeriod['locations'],
        transportation: mergeTransportation(period.transportation, restoredPeriod.transportation)
      };
    });
  };

  const mergeAccommodations = (currentAcc?: Accommodation[], restoredAcc?: Accommodation[]) => {
    if (!Array.isArray(currentAcc) || !Array.isArray(restoredAcc)) return currentAcc;
    return currentAcc.map((accommodation) => {
      const restoredAccommodation = restoredAcc.find((candidate) => candidate.id === accommodation.id);
      if (!restoredAccommodation) return accommodation;
      return {
        ...accommodation,
        costTrackingLinks: mergeCostTrackingLinks(accommodation.costTrackingLinks, restoredAccommodation.costTrackingLinks)
      };
    });
  };

  const mergedAccommodations = mergeAccommodations(current.accommodations, restored.accommodations);

  if (!current.travelData || !restored.travelData) {
    return {
      ...current,
      accommodations: mergedAccommodations
    };
  }

  return {
    ...current,
    travelData: {
      ...current.travelData,
      locations: mergeLocations(current.travelData.locations, restored.travelData.locations),
      routes: mergeRoutes(current.travelData.routes, restored.travelData.routes),
      days: mergeDays(current.travelData.days as JourneyPeriod[] | undefined, restored.travelData.days as JourneyPeriod[] | undefined)
    },
    accommodations: mergedAccommodations
  };
}

async function createDeletionBackup(
  id: string,
  kind: DeletionBackupKind,
  deletionReason: string
): Promise<void> {
  try {
    await ensureBackupDir();

    const tripData = await loadUnifiedTripData(id);
    if (!tripData) {
      throw new Error(`Trip ${id} not found for backup`);
    }

    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const backupData = {
      ...tripData,
      backupMetadata: {
        deletedAt: now.toISOString(),
        originalId: id,
        backupType: deletionReason
      }
    };

    const backupFilename = kind === 'trip'
      ? `deleted-trip-${id}-${timestamp}.json`
      : `deleted-cost-${id}-${timestamp}.json`;
    const backupPath = getBackupFilePath(backupFilename);

    await writeFile(backupPath, JSON.stringify(backupData, null, 2));
    console.log('Created backup for trip %s at %s', id, backupPath);

    // Add metadata entry using the new backup service
    try {
      await backupService.addBackupMetadata(
        id,
        kind,
        tripData.title,
        backupPath,
        deletionReason
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

export async function createTripBackup(id: string, deletionReason = 'trip_deletion'): Promise<void> {
  await createDeletionBackup(id, 'trip', deletionReason);
}

export async function createCostBackup(id: string, deletionReason = 'cost_tracker_deletion'): Promise<void> {
  await createDeletionBackup(id, 'cost', deletionReason);
}

export async function deleteTripWithBackup(id: string): Promise<void> {
  try {
    // Create backup first
    await createTripBackup(id, 'trip_deletion');

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

export async function deleteCostTrackingWithBackup(tripId: string): Promise<UnifiedTripData> {
  const existing = await loadUnifiedTripData(tripId);
  if (!existing) {
    throw new Error(`Trip ${tripId} not found`);
  }
  if (!existing.costData) {
    throw new Error(`Trip ${tripId} has no cost tracking data to delete`);
  }

  await createCostBackup(tripId, 'cost_tracker_deletion');

  const updated: UnifiedTripData = clearCostTrackingLinks({
    ...existing,
    costData: undefined,
    updatedAt: new Date().toISOString()
  });

  await saveUnifiedTripData(updated);
  return updated;
}

export async function restoreTripFromBackup(backupId: string, targetTripId?: string, overwrite = false): Promise<UnifiedTripData> {
  const backup = await backupService.getBackupById(backupId);
  if (!backup) {
    throw new NotFoundError(`Backup ${backupId} not found`);
  }

  const content = await readFile(backup.filePath, 'utf-8');
  const parsed = JSON.parse(content, dateReviver) as UnifiedTripData & { backupMetadata?: unknown };
  const migrated = migrateToLatestSchema(parsed as UnifiedTripData);

  const restoredTripId = targetTripId || backup.originalId;
  const existing = await loadUnifiedTripData(restoredTripId);
  if (existing && !overwrite) {
    throw new ConflictError(`Trip ${restoredTripId} already exists`);
  }

  const withoutMetadata = { ...(migrated as UnifiedTripData), id: restoredTripId } as UnifiedTripData & { backupMetadata?: unknown };
  delete withoutMetadata.backupMetadata;

  const now = new Date().toISOString();
  const restored: UnifiedTripData = {
    ...withoutMetadata,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    updatedAt: now
  };

  await saveUnifiedTripData(restored);
  return restored;
}

export async function restoreCostTrackingFromBackup(
  backupId: string,
  tripId?: string,
  overwrite = false
): Promise<UnifiedTripData> {
  const backup = await backupService.getBackupById(backupId);
  if (!backup) {
    throw new NotFoundError(`Backup ${backupId} not found`);
  }

  const resolvedTripId = tripId || backup.originalId;
  const current = await loadUnifiedTripData(resolvedTripId);
  if (!current) {
    throw new NotFoundError(`Trip ${resolvedTripId} not found`);
  }
  if (current.costData && !overwrite) {
    throw new ConflictError(`Trip ${resolvedTripId} already has cost tracking data`);
  }

  const content = await readFile(backup.filePath, 'utf-8');
  const parsed = JSON.parse(content, dateReviver) as UnifiedTripData & { backupMetadata?: unknown };
  const migrated = migrateToLatestSchema(parsed as UnifiedTripData);

  if (!migrated.costData) {
    throw new ValidationError(`Backup ${backupId} has no cost tracking data`);
  }

  const withRestoredCost: UnifiedTripData = {
    ...current,
    costData: migrated.costData,
    updatedAt: new Date().toISOString()
  };

  const mergedLinks = mergeRestoredLinksIntoTrip(withRestoredCost, migrated);
  await saveUnifiedTripData(mergedLinks);
  return mergedLinks;
}

/**
 * Loads and migrates data automatically
 */
export async function loadUnifiedTripData(tripId: string): Promise<UnifiedTripData | null> {
  try {
    // Load unified file
    const unifiedFilePath = getUnifiedTripFilePath(tripId);
    const unifiedContent = await readFile(unifiedFilePath);
    let parsed: unknown;

    try {
      parsed = JSON.parse(unifiedContent.toString('utf-8'), dateReviver);
    } catch (parseError) {
      const recoveredData = await recoverCorruptedUnifiedTripFile(
        tripId,
        unifiedFilePath,
        unifiedContent,
        parseError
      );

      if (recoveredData) {
        return recoveredData;
      }

      throw parseError;
    }

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
  const content = JSON.stringify(data, null, 2);

  const previousSave = saveQueues.get(filePath) ?? Promise.resolve();
  const queuedSave = previousSave
    .catch(() => undefined)
    .then(async () => {
      const tempFilePath = join(
        dirname(filePath),
        `.${basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`
      );

      try {
        await writeFile(tempFilePath, content, 'utf-8');
        await rename(tempFilePath, filePath);
      } catch (error) {
        try {
          await unlink(tempFilePath);
        } catch {
          // Ignore cleanup failures; primary error handling happens below.
        }
        throw error;
      }
    });

  saveQueues.set(filePath, queuedSave);

  try {
    await queuedSave;
  } finally {
    if (saveQueues.get(filePath) === queuedSave) {
      saveQueues.delete(filePath);
    }
  }
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

 
