/**
 * Wikipedia service for fetching, caching, and serving location data
 * Handles rate limiting, attribution, and data persistence
 */

import fs from 'fs/promises';
import path from 'path';
import { 
  WikipediaAPIResponse, 
  WikipediaSearchResponse, 
  WikipediaGeosearchResponse,
  StoredWikipediaData, 
  WikipediaErrorType,
  LocationMatchingResult,
  WikipediaServiceConfig 
} from '../types/wikipedia';
import { Location } from '../types';
import { 
  generateWikipediaFilename, 
  normalizeLocationName, 
  calculateMatchConfidence,
  validateWikipediaResponse,
  truncateExtract,
  isCacheExpired,
  getOptimalThumbnailUrl,
  parseWikipediaReference
} from '../lib/wikipediaUtils';

const DEFAULT_CONFIG: WikipediaServiceConfig = {
  userAgent: 'TravelTracker/1.0 (https://github.com/bdamokos/travel-tracker) BasedOnWikipediaAPI',
  rateLimit: {
    requestsPerSecond: 20,
    minRequestInterval: 50, // Conservative 50ms between requests
  },
  cache: {
    refreshIntervalDays: 7,
    maxRetries: 3,
  },
  search: {
    geosearchRadius: 10000, // 10km
    maxSearchResults: 5,
  },
};

class WikipediaService {
  private config: WikipediaServiceConfig;
  private lastRequestTime = 0;
  private dataDir: string;

  constructor(config: Partial<WikipediaServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.dataDir = path.join(process.cwd(), 'data', 'wikipedia');
  }

  /**
   * Ensure data directory exists
   */
  private async ensureDataDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create Wikipedia data directory:', error);
      throw error;
    }
  }

  /**
   * Rate-limited API request
   */
  private async makeAPIRequest(url: string): Promise<Response> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.config.rateLimit.minRequestInterval) {
      await new Promise(resolve => 
        setTimeout(resolve, this.config.rateLimit.minRequestInterval - timeSinceLastRequest)
      );
    }
    
    this.lastRequestTime = Date.now();

    const response = await fetch(url, {
      headers: {
        'User-Agent': this.config.userAgent,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  }

  /**
   * Fetch Wikipedia page summary
   */
  private async fetchPageSummary(title: string): Promise<WikipediaAPIResponse> {
    const encodedTitle = encodeURIComponent(title);
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodedTitle}`;
    
    const response = await this.makeAPIRequest(url);
    const data = await response.json();
    
    if (!validateWikipediaResponse(data)) {
      throw new Error('Invalid Wikipedia API response structure');
    }
    
    return data as WikipediaAPIResponse;
  }

  /**
   * Search for Wikipedia articles using OpenSearch
   */
  private async searchArticles(query: string): Promise<string[]> {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://en.wikipedia.org/api/rest_v1/page/opensearch/${encodedQuery}`;
    
    const response = await this.makeAPIRequest(url);
    const data = await response.json() as WikipediaSearchResponse;
    
    return data[1] || []; // Array of matching titles
  }

  /**
   * Geosearch using MediaWiki API (fallback for coordinate-based search)
   */
  private async geosearchArticles(lat: number, lon: number): Promise<string[]> {
    const url = `https://en.wikipedia.org/w/api.php?` + new URLSearchParams({
      action: 'query',
      list: 'geosearch',
      gscoord: `${lat}|${lon}`,
      gsradius: this.config.search.geosearchRadius.toString(),
      gslimit: this.config.search.maxSearchResults.toString(),
      format: 'json',
      origin: '*' // Required for CORS
    });

    const response = await this.makeAPIRequest(url);
    const data = await response.json() as WikipediaGeosearchResponse;
    
    return data.query?.geosearch?.map(result => result.title) || [];
  }

  /**
   * Find best Wikipedia article match for a location
   */
  private async findLocationMatch(location: Location): Promise<LocationMatchingResult> {
    const locationName = location.name;

    try {
      // 1. Check if location has explicit Wikipedia reference
      const wikipediaRef = parseWikipediaReference(location.wikipediaRef);
      if (wikipediaRef.isValid) {
        if (wikipediaRef.type === 'article') {
          // Direct article title reference
          return {
            success: true,
            articleTitle: wikipediaRef.value!,
            matchType: 'exact',
            confidence: 1.0,
          };
        } else if (wikipediaRef.type === 'wikidata') {
          // TODO: Implement Wikidata ID to Wikipedia article resolution
          // For now, fall back to name-based search
          console.log(`Wikidata reference ${wikipediaRef.value} not yet implemented, falling back to name search`);
        }
      }

      // 2. Direct name search
      const searchResults = await this.searchArticles(locationName);
      if (searchResults.length > 0) {
        const bestMatch = searchResults[0];
        const confidence = calculateMatchConfidence(locationName, bestMatch, 'exact');
        return {
          success: true,
          articleTitle: bestMatch,
          matchType: 'exact',
          confidence,
          alternatives: searchResults.slice(1),
        };
      }

      // 3. Normalized name search
      const normalizedName = normalizeLocationName(locationName);
      if (normalizedName !== locationName) {
        const normalizedResults = await this.searchArticles(normalizedName);
        if (normalizedResults.length > 0) {
          const bestMatch = normalizedResults[0];
          const confidence = calculateMatchConfidence(locationName, bestMatch, 'variation');
          return {
            success: true,
            articleTitle: bestMatch,
            matchType: 'variation',
            confidence,
            alternatives: normalizedResults.slice(1),
          };
        }
      }

      // 4. Coordinate-based geosearch
      if (location.coordinates) {
        const [lat, lon] = location.coordinates;
        const geoResults = await this.geosearchArticles(lat, lon);
        if (geoResults.length > 0) {
          const bestMatch = geoResults[0];
          const confidence = calculateMatchConfidence(locationName, bestMatch, 'geosearch');
          return {
            success: true,
            articleTitle: bestMatch,
            matchType: 'geosearch',
            confidence,
            alternatives: geoResults.slice(1),
          };
        }
      }

      return {
        success: false,
        matchType: 'exact',
        confidence: 0,
        error: {
          type: WikipediaErrorType.NOT_FOUND,
          message: `No Wikipedia article found for location: ${locationName}`,
          retryable: false,
        },
      };

    } catch (error) {
      return {
        success: false,
        matchType: 'exact',
        confidence: 0,
        error: {
          type: WikipediaErrorType.NETWORK_ERROR,
          message: `Error searching for location: ${error instanceof Error ? error.message : 'Unknown error'}`,
          retryable: true,
          originalError: error instanceof Error ? error : undefined,
        },
      };
    }
  }

  /**
   * Transform Wikipedia API response to stored format
   */
  private transformToStoredData(
    apiResponse: WikipediaAPIResponse,
    cacheKey: string
  ): StoredWikipediaData {
    return {
      title: apiResponse.title,
      extract: truncateExtract(apiResponse.extract, 250),
      thumbnail: apiResponse.thumbnail ? {
        source: getOptimalThumbnailUrl(apiResponse.thumbnail.source, 240),
        width: apiResponse.thumbnail.width,
        height: apiResponse.thumbnail.height,
      } : undefined,
      url: apiResponse.content_urls.desktop.page,
      attribution: {
        text: 'Source: Wikipedia',
        url: apiResponse.content_urls.desktop.page,
        license: 'CC BY-SA 3.0',
        imageDisclaimer: 'Image licensing: verify on Wikipedia',
      },
      coordinates: apiResponse.coordinates ? 
        [apiResponse.coordinates.lat, apiResponse.coordinates.lon] : undefined,
      lastFetched: Date.now(),
      refreshStatus: 'success',
      cacheKey,
      apiVersion: 'rest_v1',
    };
  }

  /**
   * Get cached Wikipedia data for a location
   */
  async getCachedData(location: Location): Promise<StoredWikipediaData | null> {
    try {
      await this.ensureDataDirectory();
      
      const filename = generateWikipediaFilename(location.name, location.coordinates);
      const filePath = path.join(this.dataDir, filename);
      
      const data = await fs.readFile(filePath, 'utf8');
      const parsedData = JSON.parse(data) as StoredWikipediaData;
      
      // Check if cache is expired
      if (isCacheExpired(parsedData.lastFetched, this.config.cache.refreshIntervalDays)) {
        return null;
      }
      
      return parsedData;
    } catch {
      // Cache miss or error - return null
      return null;
    }
  }

  /**
   * Store Wikipedia data to cache
   */
  async storeData(location: Location, data: StoredWikipediaData): Promise<void> {
    try {
      await this.ensureDataDirectory();
      
      const filename = generateWikipediaFilename(location.name, location.coordinates);
      const filePath = path.join(this.dataDir, filename);
      
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
      console.error('Failed to store Wikipedia data:', error);
      throw error;
    }
  }

  /**
   * Fetch fresh Wikipedia data for a location
   */
  async fetchLocationData(location: Location): Promise<StoredWikipediaData | null> {
    try {
      // Find best Wikipedia article match
      const matchResult = await this.findLocationMatch(location);
      
      if (!matchResult.success || !matchResult.articleTitle) {
        console.log(`No Wikipedia article found for location: ${location.name}`);
        return null;
      }

      // Fetch article summary
      const apiResponse = await this.fetchPageSummary(matchResult.articleTitle);
      
      // Transform and return stored data
      const cacheKey = generateWikipediaFilename(location.name, location.coordinates);
      const storedData = this.transformToStoredData(apiResponse, cacheKey);
      
      // Store in cache
      await this.storeData(location, storedData);
      
      return storedData;

    } catch (error) {
      console.error(`Failed to fetch Wikipedia data for ${location.name}:`, error);
      return null;
    }
  }

  /**
   * Get Wikipedia data for a location (cached or fresh)
   */
  async getLocationData(location: Location, forceRefresh = false): Promise<StoredWikipediaData | null> {
    if (!forceRefresh) {
      // Try cache first
      const cachedData = await this.getCachedData(location);
      if (cachedData) {
        return cachedData;
      }
    }

    // Fetch fresh data
    return await this.fetchLocationData(location);
  }

  /**
   * List all cached Wikipedia files
   */
  async listCachedFiles(): Promise<string[]> {
    try {
      await this.ensureDataDirectory();
      const files = await fs.readdir(this.dataDir);
      return files.filter(file => file.endsWith('.json') && file !== 'metadata.json');
    } catch {
      return [];
    }
  }

  /**
   * Clean expired cache files
   */
  async cleanExpiredCache(): Promise<number> {
    const files = await this.listCachedFiles();
    let cleanedCount = 0;

    for (const file of files) {
      try {
        const filePath = path.join(this.dataDir, file);
        const data = await fs.readFile(filePath, 'utf8');
        const parsedData = JSON.parse(data) as StoredWikipediaData;
        
        if (isCacheExpired(parsedData.lastFetched, this.config.cache.refreshIntervalDays)) {
          await fs.unlink(filePath);
          cleanedCount++;
        }
      } catch (error) {
        console.error(`Error cleaning cache file ${file}:`, error);
      }
    }

    return cleanedCount;
  }
}

// Export singleton instance
export const wikipediaService = new WikipediaService();
export default WikipediaService;