/**
 * Wikipedia utilities for location matching, file naming, and data processing
 */

import { createHash } from 'crypto';
import { WikipediaAPIResponse } from '../types/wikipedia';

/**
 * Generate consistent cache key for location data
 */
export function generateLocationCacheKey(
  locationName: string, 
  coordinates?: [number, number]
): string {
  // Normalize location name
  const normalizedName = locationName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-'); // Replace spaces with hyphens

  // Include coordinates for uniqueness if available
  const coordString = coordinates 
    ? `-${coordinates[0].toFixed(4)}-${coordinates[1].toFixed(4)}`
    : '';

  return `location-${normalizedName}${coordString}`;
}

/**
 * Generate hash for location to use as filename
 */
export function generateLocationHash(locationName: string, coordinates?: [number, number]): string {
  const input = coordinates 
    ? `${locationName}-${coordinates[0]}-${coordinates[1]}`
    : locationName;
    
  return createHash('md5').update(input.toLowerCase().trim()).digest('hex').substring(0, 12);
}

/**
 * Generate filename for Wikipedia data storage
 */
export function generateWikipediaFilename(
  locationName: string, 
  coordinates?: [number, number]
): string {
  const cacheKey = generateLocationCacheKey(locationName, coordinates);
  const hash = generateLocationHash(locationName, coordinates);
  return `${cacheKey}-${hash}.json`;
}

/**
 * Normalize location name for Wikipedia search
 */
export function normalizeLocationName(locationName: string): string {
  return locationName
    .trim()
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/[^\w\s,.-]/g, '') // Remove special characters except common punctuation
    .replace(/^(the|a|an)\s+/i, ''); // Remove articles at the beginning
}

/**
 * Calculate confidence score for location match
 */
export function calculateMatchConfidence(
  originalName: string,
  wikipediaTitle: string,
  matchType: 'exact' | 'variation' | 'geosearch' | 'disambiguation'
): number {
  const normalizedOriginal = normalizeLocationName(originalName).toLowerCase();
  const normalizedWikipedia = normalizeLocationName(wikipediaTitle).toLowerCase();
  
  // Exact match gets highest score
  if (normalizedOriginal === normalizedWikipedia) {
    return 1.0;
  }
  
  // Calculate string similarity
  const similarity = calculateStringSimilarity(normalizedOriginal, normalizedWikipedia);
  
  // Adjust based on match type
  const typeMultiplier = {
    exact: 1.0,
    variation: 0.9,
    geosearch: 0.7,
    disambiguation: 0.6,
  };
  
  return Math.min(similarity * typeMultiplier[matchType], 1.0);
}

/**
 * Calculate string similarity using Levenshtein distance
 */
function calculateStringSimilarity(str1: string, str2: string): number {
  const matrix: number[][] = [];
  const len1 = str1.length;
  const len2 = str2.length;
  
  if (len1 === 0) return len2 === 0 ? 1 : 0;
  if (len2 === 0) return 0;
  
  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }
  
  // Calculate distances
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,     // deletion
        matrix[i][j - 1] + 1,     // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  
  const maxLength = Math.max(len1, len2);
  const distance = matrix[len1][len2];
  return (maxLength - distance) / maxLength;
}

/**
 * Extract disambiguation targets from Wikipedia disambiguation page
 */
export function extractDisambiguationTargets(
  extract: string,
  _originalLocation: string
): string[] {
  const targets: string[] = [];
  
  // Look for patterns like "X may refer to:" followed by bullet points
  const lines = extract.split('\n');
  
  for (const line of lines) {
    // Look for lines that might contain location references
    if (line.includes('city') || line.includes('town') || line.includes('municipality') || 
        line.includes('county') || line.includes('state') || line.includes('country')) {
      
      // Extract potential article titles (simple heuristic)
      const matches = line.match(/([A-Z][A-Za-z\s,.-]+?)(?:,|\.|$)/g);
      if (matches) {
        targets.push(...matches.map(m => m.replace(/[,.]$/, '').trim()));
      }
    }
  }
  
  // Filter and deduplicate
  return Array.from(new Set(targets))
    .filter(target => target.length > 2 && target.length < 100)
    .slice(0, 5); // Limit to 5 alternatives
}

/**
 * Validate Wikipedia API response
 */
export function validateWikipediaResponse(data: Partial<WikipediaAPIResponse>): data is WikipediaAPIResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.title === 'string' &&
    typeof data.extract === 'string' &&
    typeof data.content_urls === 'object' &&
    typeof data.content_urls.desktop === 'object' &&
    typeof data.content_urls.desktop.page === 'string'
  );
}

/**
 * Truncate Wikipedia extract to optimal length for previews
 */
export function truncateExtract(extract: string, maxLength: number = 250): string {
  if (extract.length <= maxLength) {
    return extract;
  }
  
  // Find the last complete sentence within the limit
  const truncated = extract.substring(0, maxLength);
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf('!'),
    truncated.lastIndexOf('?')
  );
  
  if (lastSentenceEnd > maxLength * 0.7) {
    // If we found a sentence ending that's not too short, use it
    return truncated.substring(0, lastSentenceEnd + 1);
  } else {
    // Otherwise, truncate at the last word boundary
    const lastSpace = truncated.lastIndexOf(' ');
    return truncated.substring(0, lastSpace) + '...';
  }
}

/**
 * Check if a cache file is expired
 */
export function isCacheExpired(lastFetched: number, refreshIntervalDays: number = 7): boolean {
  const expiryTime = lastFetched + (refreshIntervalDays * 24 * 60 * 60 * 1000);
  return Date.now() > expiryTime;
}

/**
 * Get optimal thumbnail size for different use cases
 */
export function getOptimalThumbnailUrl(
  thumbnailUrl: string,
  targetWidth: number = 240
): string {
  // Wikipedia thumbnail URLs can be resized by changing the width parameter
  // Example: .../320px-Image.jpg -> .../240px-Image.jpg
  return thumbnailUrl.replace(/\/\d+px-/, `/${targetWidth}px-`);
}

/**
 * Parse Wikipedia reference from Location data
 * Supports both article titles and Wikidata identifiers
 */
export function parseWikipediaReference(wikipediaRef?: string): {
  type: 'article' | 'wikidata' | null;
  value: string | null;
  isValid: boolean;
} {
  if (!wikipediaRef) {
    return { type: null, value: null, isValid: false };
  }

  const trimmed = wikipediaRef.trim();

  // Check for Wikidata identifier pattern (Q followed by digits)
  if (/^Q\d+$/.test(trimmed)) {
    return { type: 'wikidata', value: trimmed, isValid: true };
  }

  // Otherwise treat as Wikipedia article title
  if (trimmed.length > 0) {
    return { type: 'article', value: trimmed, isValid: true };
  }

  return { type: null, value: null, isValid: false };
}

/**
 * Build a canonical URL for a parsed Wikipedia reference.
 */
export function buildWikipediaReferenceUrl(reference: {
  type: 'article' | 'wikidata' | null;
  value: string | null;
  isValid: boolean;
}): string | null {
  if (!reference.isValid || !reference.value) {
    return null;
  }

  if (reference.type === 'wikidata') {
    return `https://www.wikidata.org/wiki/${reference.value}`;
  }

  return `https://en.wikipedia.org/wiki/${encodeURIComponent(reference.value).replace(/%20/g, '_')}`;
}
