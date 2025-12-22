/**
 * TypeScript interfaces for Wikipedia API integration
 * Based on Wikipedia REST API v1 specification
 */

// Wikipedia REST API response structure
export interface WikipediaAPIResponse {
  title: string;
  extract: string;
  thumbnail?: {
    source: string;
    width: number;
    height: number;
  };
  originalimage?: {
    source: string;
    width: number;
    height: number;
  };
  lang: string;
  dir: string;
  timestamp: string;
  description?: string;
  coordinates?: {
    lat: number;
    lon: number;
  };
  content_urls: {
    desktop: {
      page: string;
    };
    mobile?: {
      page: string;
    };
  };
}

// OpenSearch API response for location matching
export interface WikipediaSearchResponse {
  0: string; // Query term
  1: string[]; // Matching titles
  2: string[]; // Descriptions
  3: string[]; // URLs
}

// MediaWiki Geosearch API response
export interface WikipediaGeosearchResponse {
  query?: {
    geosearch?: Array<{
      pageid: number;
      ns: number;
      title: string;
      lat: number;
      lon: number;
      dist: number;
      primary?: boolean;
    }>;
  };
}

// Wikidata API response types
export interface WikidataSitelink {
  title?: string;
}

export interface WikidataEntity {
  sitelinks?: Record<string, WikidataSitelink>;
}

export interface WikidataEntitiesResponse {
  entities?: Record<string, WikidataEntity>;
}

// Stored Wikipedia data structure (for JSON files)
export interface StoredWikipediaData {
  title: string;
  extract: string; // Pre-truncated to 200-300 chars
  thumbnail?: {
    source: string;
    width: number;
    height: number;
    // Note: License info NOT available from REST API
  };
  url: string; // Desktop Wikipedia URL
  attribution: {
    text: string; // "Source: Wikipedia"
    url: string;  // Original article URL
    license: string; // "CC BY-SA 3.0"
    imageDisclaimer: string; // "Image licensing: verify on Wikipedia"
  };
  coordinates?: [number, number];
  lastFetched: number; // Unix timestamp
  refreshStatus: 'success' | 'failed' | 'not_found' | 'disambiguation';
  cacheKey: string; // location name hash for file naming
  apiVersion: string; // Track which API version was used
}

// Location popup data combining trip info with Wikipedia
export interface LocationPopupData {
  location: {
    id: string;
    name: string;
    coordinates: [number, number];
    arrivalTime?: string;
    departureTime?: string;
    date: Date;
    endDate?: Date;
    duration?: number;
    notes?: string;
    instagramPosts?: Array<{
      id: string;
      url: string;
    }>;
    blogPosts?: Array<{
      id: string;
      title: string;
      url: string;
    }>;
  };
  wikipediaData?: StoredWikipediaData;
  tripContext: {
    dates: string;
    duration?: string;
    hasInstagramPosts: boolean;
    hasBlogPosts: boolean;
  };
}

// Wikipedia service configuration
export interface WikipediaServiceConfig {
  userAgent: string;
  rateLimit: {
    requestsPerSecond: number;
    minRequestInterval: number;
  };
  cache: {
    refreshIntervalDays: number;
    maxRetries: number;
  };
  search: {
    geosearchRadius: number; // in meters
    maxSearchResults: number;
  };
}

// Error types for Wikipedia API
export enum WikipediaErrorType {
  NOT_FOUND = 'not_found',
  DISAMBIGUATION = 'disambiguation', 
  RATE_LIMITED = 'rate_limited',
  NETWORK_ERROR = 'network_error',
  INVALID_RESPONSE = 'invalid_response',
  PARSING_ERROR = 'parsing_error'
}

export interface WikipediaError {
  type: WikipediaErrorType;
  message: string;
  statusCode?: number;
  originalError?: Error;
  retryable: boolean;
}

// Location matching types
export interface LocationMatchingResult {
  success: boolean;
  articleTitle?: string;
  matchType: 'exact' | 'variation' | 'geosearch' | 'disambiguation';
  confidence: number; // 0-1 score
  alternatives?: string[]; // Other possible matches
  error?: WikipediaError;
}

// Weekly refresh service types
export interface RefreshJobConfig {
  batchSize: number;
  delayBetweenRequests: number;
  maxRetries: number;
  timeoutMs: number;
}

export interface RefreshResult {
  locationName: string;
  cacheKey: string;
  status: 'success' | 'not_found' | 'error' | 'skipped';
  error?: string;
  wikipediaTitle?: string;
  processingTimeMs: number;
}

export interface RefreshJobSummary {
  startTime: number;
  endTime: number;
  totalLocations: number;
  processed: number;
  successful: number;
  failed: number;
  notFound: number;
  skipped: number;
  results: RefreshResult[];
  errors: Array<{
    locationName: string;
    error: string;
    stack?: string;
  }>;
}

// Metadata stored in data/wikipedia/metadata.json
export interface WikipediaMetadata {
  lastRefresh: number;
  nextScheduledRefresh: number;
  refreshHistory: Array<{
    timestamp: number;
    processed: number;
    successful: number;
    failed: number;
    durationMs: number;
  }>;
  statistics: {
    totalCachedLocations: number;
    oldestCache: number;
    newestCache: number;
    averageRefreshTime: number;
  };
  configuration: {
    refreshIntervalDays: number;
    lastConfigUpdate: number;
  };
}
