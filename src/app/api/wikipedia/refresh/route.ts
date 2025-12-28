/**
 * Wikipedia refresh API route
 * Handles weekly batch refresh of Wikipedia data for all locations
 */

import { NextRequest, NextResponse } from 'next/server';
import { listAllTrips, loadUnifiedTripData } from '../../../lib/unifiedDataService';
import { Location } from '../../../types';
import { wikipediaService } from '../../../services/wikipediaService';
import {
  RefreshJobConfig,
  RefreshResult,
  RefreshJobSummary,
  WikipediaMetadata
} from '../../../types/wikipedia';
import fs from 'fs/promises';
import path from 'path';
import { getDataDir } from '../../../lib/dataDirectory';

const DEFAULT_REFRESH_CONFIG: RefreshJobConfig = {
  batchSize: 20, // Process 20 locations at a time
  delayBetweenRequests: 100, // 100ms delay between requests
  maxRetries: 3,
  timeoutMs: 30000, // 30 second timeout per location
};

/**
 * Load or create Wikipedia metadata
 */
async function loadWikipediaMetadata(): Promise<WikipediaMetadata> {
  const metadataPath = path.join(getDataDir(), 'wikipedia', 'metadata.json');
  
  try {
    const data = await fs.readFile(metadataPath, 'utf8');
    return JSON.parse(data);
  } catch {
    // Create default metadata if file doesn't exist
    const defaultMetadata: WikipediaMetadata = {
      lastRefresh: 0,
      nextScheduledRefresh: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days from now
      refreshHistory: [],
      statistics: {
        totalCachedLocations: 0,
        oldestCache: Date.now(),
        newestCache: Date.now(),
        averageRefreshTime: 0,
      },
      configuration: {
        refreshIntervalDays: 7,
        lastConfigUpdate: Date.now(),
      },
    };
    return defaultMetadata;
  }
}

/**
 * Save Wikipedia metadata
 */
async function saveWikipediaMetadata(metadata: WikipediaMetadata): Promise<void> {
  const metadataPath = path.join(getDataDir(), 'wikipedia', 'metadata.json');
  
  // Ensure directory exists
  await fs.mkdir(path.dirname(metadataPath), { recursive: true });
  
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
}

/**
 * Get all unique locations from travel data
 */
async function getAllLocations() {
  try {
    const trips = await listAllTrips();
    const allLocations: Location[] = [];

    for (const trip of trips) {
      const tripData = await loadUnifiedTripData(trip.id);
      if (tripData?.travelData?.days) {
        tripData.travelData.days.forEach(day => {
          if (day.locations) {
            allLocations.push(...day.locations);
          }
        });
      }
    }

    // Deduplicate by name and coordinates
    const uniqueLocations = allLocations.reduce((acc, location) => {
      const key = `${location.name}-${location.coordinates[0]}-${location.coordinates[1]}`;
      if (!acc.has(key)) {
        acc.set(key, location);
      }
      return acc;
    }, new Map());

    return Array.from(uniqueLocations.values());
  } catch (error) {
    console.error('Failed to load travel data:', error);
    return [];
  }
}

/**
 * Process a single location with timeout and retry logic
 */
async function processLocation(
  location: { name: string; coordinates: [number, number]; wikipediaRef?: string },
  config: RefreshJobConfig,
  retryCount = 0
): Promise<RefreshResult> {
  const startTime = Date.now();
  
  try {
    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Timeout')), config.timeoutMs);
    });

    // Fetch Wikipedia data with timeout
    const locationData = {
      ...location,
      id: `temp-${Date.now()}`,
      date: new Date(),
    };
    const dataPromise = wikipediaService.fetchLocationData(locationData);
    const wikipediaData = await Promise.race([dataPromise, timeoutPromise]);
    
    const processingTime = Date.now() - startTime;

    if (wikipediaData) {
      return {
        locationName: location.name,
        cacheKey: wikipediaData.cacheKey,
        status: 'success',
        wikipediaTitle: wikipediaData.title,
        processingTimeMs: processingTime,
      };
    } else {
      return {
        locationName: location.name,
        cacheKey: '', // No cache key for failed requests
        status: 'not_found',
        processingTimeMs: processingTime,
      };
    }

  } catch (error) {
    const processingTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Retry logic
    if (retryCount < config.maxRetries && errorMessage !== 'Timeout') {
      console.log(`Retrying location ${location.name} (attempt ${retryCount + 1}/${config.maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, config.delayBetweenRequests * (retryCount + 1)));
      return processLocation(location, config, retryCount + 1);
    }

    return {
      locationName: location.name,
      cacheKey: '',
      status: 'error',
      error: errorMessage,
      processingTimeMs: processingTime,
    };
  }
}

/**
 * POST /api/wikipedia/refresh
 * Refresh Wikipedia data for all locations
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  console.log('Starting Wikipedia refresh job...');
  
  try {
    // Parse request body for configuration overrides
    const body = await request.json().catch(() => ({}));
    const config: RefreshJobConfig = { ...DEFAULT_REFRESH_CONFIG, ...body.config };

    const startTime = Date.now();
    const results: RefreshResult[] = [];
    const errors: Array<{ locationName: string; error: string; stack?: string }> = [];

    // Load metadata
    const metadata = await loadWikipediaMetadata();

    // Get all locations
    const locations = await getAllLocations();
    console.log(`Found ${locations.length} unique locations to process`);

    if (locations.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No locations found to refresh',
        summary: {
          startTime,
          endTime: Date.now(),
          totalLocations: 0,
          processed: 0,
          successful: 0,
          failed: 0,
          notFound: 0,
          skipped: 0,
          results: [],
          errors: [],
        } as RefreshJobSummary,
      });
    }

    // Process locations in batches
    let processed = 0;
    let successful = 0;
    let failed = 0;
    let notFound = 0;

    for (let i = 0; i < locations.length; i += config.batchSize) {
      const batch = locations.slice(i, i + config.batchSize);
      console.log(`Processing batch ${Math.floor(i / config.batchSize) + 1}/${Math.ceil(locations.length / config.batchSize)}`);

      // Process batch locations in parallel
      const batchPromises = batch.map(location => processLocation(location, config));
      const batchResults = await Promise.all(batchPromises);

      // Collect results
      results.push(...batchResults);
      
      // Update counters
      batchResults.forEach(result => {
        processed++;
        switch (result.status) {
          case 'success':
            successful++;
            break;
          case 'not_found':
            notFound++;
            break;
          case 'error':
            failed++;
            if (result.error) {
              errors.push({
                locationName: result.locationName,
                error: result.error,
              });
            }
            break;
        }
      });

      // Delay between batches to respect rate limits
      if (i + config.batchSize < locations.length) {
        await new Promise(resolve => setTimeout(resolve, config.delayBetweenRequests));
      }
    }

    const endTime = Date.now();
    const durationMs = endTime - startTime;

    // Update metadata
    metadata.lastRefresh = endTime;
    metadata.nextScheduledRefresh = endTime + (metadata.configuration.refreshIntervalDays * 24 * 60 * 60 * 1000);
    metadata.refreshHistory.push({
      timestamp: endTime,
      processed,
      successful,
      failed: failed + notFound,
      durationMs,
    });

    // Keep only last 10 refresh history entries
    if (metadata.refreshHistory.length > 10) {
      metadata.refreshHistory = metadata.refreshHistory.slice(-10);
    }

    // Update statistics
    const cachedFiles = await wikipediaService.listCachedFiles();
    metadata.statistics.totalCachedLocations = cachedFiles.length;
    
    if (results.length > 0) {
      const processingTimes = results
        .filter(r => r.status === 'success')
        .map(r => r.processingTimeMs);
      
      if (processingTimes.length > 0) {
        metadata.statistics.averageRefreshTime = 
          processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length;
      }
    }

    await saveWikipediaMetadata(metadata);

    // Create summary
    const summary: RefreshJobSummary = {
      startTime,
      endTime,
      totalLocations: locations.length,
      processed,
      successful,
      failed,
      notFound,
      skipped: 0,
      results,
      errors,
    };

    console.log(`Wikipedia refresh completed: ${successful}/${locations.length} successful, ${failed} failed, ${notFound} not found`);

    return NextResponse.json({
      success: true,
      message: `Refresh completed: ${successful}/${locations.length} successful`,
      summary,
    });

  } catch (error) {
    console.error('Wikipedia refresh job failed:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    }, { status: 500 });
  }
}

/**
 * GET /api/wikipedia/refresh
 * Get refresh status and metadata
 */
export async function GET(): Promise<NextResponse> {
  try {
    const metadata = await loadWikipediaMetadata();
    const cachedFiles = await wikipediaService.listCachedFiles();
    
    return NextResponse.json({
      success: true,
      metadata: {
        ...metadata,
        statistics: {
          ...metadata.statistics,
          totalCachedLocations: cachedFiles.length,
        },
      },
      isRefreshNeeded: Date.now() > metadata.nextScheduledRefresh,
    });
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
