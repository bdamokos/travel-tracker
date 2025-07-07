import { Location, Transportation, Journey, JourneyPeriod } from '../types';

/**
 * Privacy utilities for filtering private/public data
 * Used to ensure embeddable/public views only show public information
 */

export interface PrivacyOptions {
  isAdminView: boolean; // If true, show all data; if false, filter private data
}

/**
 * Filter location data based on privacy settings
 */
export function filterLocationForPrivacy(location: Location, options: PrivacyOptions): Location {
  if (options.isAdminView) {
    return location; // Admin sees everything
  }

  // Public view - filter private data
  const filteredLocation: Location = {
    ...location,
    // Remove private fields
    costTrackingLinks: undefined,
    // Handle accommodation privacy
    accommodationData: location.isAccommodationPublic ? location.accommodationData : undefined,
    isAccommodationPublic: undefined, // Don't expose the privacy flag itself
  };

  return filteredLocation;
}

/**
 * Filter transportation data based on privacy settings
 */
export function filterTransportationForPrivacy(
  transportation: Transportation, 
  options: PrivacyOptions
): Transportation {
  if (options.isAdminView) {
    return transportation; // Admin sees everything
  }

  // Public view - filter private data
  const filteredTransportation: Transportation = {
    ...transportation,
    // Remove private fields
    privateNotes: undefined,
    costTrackingLinks: undefined,
  };

  return filteredTransportation;
}

/**
 * Filter journey period data based on privacy settings
 */
export function filterJourneyPeriodForPrivacy(
  period: JourneyPeriod, 
  options: PrivacyOptions
): JourneyPeriod {
  return {
    ...period,
    locations: period.locations.map(location => 
      filterLocationForPrivacy(location, options)
    ),
    transportation: period.transportation 
      ? filterTransportationForPrivacy(period.transportation, options)
      : undefined,
  };
}

/**
 * Filter complete journey data based on privacy settings
 */
export function filterJourneyForPrivacy(journey: Journey, options: PrivacyOptions): Journey {
  return {
    ...journey,
    days: journey.days.map(period => 
      filterJourneyPeriodForPrivacy(period, options)
    ),
  };
}

/**
 * Check if location has any public accommodation data
 */
export function hasPublicAccommodation(location: Location): boolean {
  return Boolean(location.accommodationData && location.isAccommodationPublic);
}

/**
 * Parse accommodation data from YAML frontmatter or return as plain text
 */
export interface ParsedAccommodation {
  isStructured: boolean;
  data: {
    name?: string;
    address?: string;
    website?: string;
    phone?: string;
    checkin?: string;
    checkout?: string;
    notes?: string;
  } | null;
  rawText: string;
}

export function parseAccommodationData(accommodationData: string): ParsedAccommodation {
  if (!accommodationData) {
    return { isStructured: false, data: null, rawText: '' };
  }

  // Try to parse as YAML frontmatter
  const yamlMatch = accommodationData.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (yamlMatch) {
    try {
      const yamlContent = yamlMatch[1];
      const additionalNotes = yamlMatch[2].trim();
      
      // Simple YAML parser for basic key-value pairs
      const parsed: any = {};
      const lines = yamlContent.split('\n');
      let currentKey = '';
      let multilineValue = '';
      let inMultiline = false;
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;
        
        if (inMultiline) {
          if (trimmedLine.startsWith(' ') || trimmedLine.startsWith('\t')) {
            multilineValue += '\n' + trimmedLine.replace(/^[\s]+/, '');
          } else {
            parsed[currentKey] = multilineValue.trim();
            inMultiline = false;
            multilineValue = '';
          }
        }
        
        if (!inMultiline) {
          const colonIndex = trimmedLine.indexOf(':');
          if (colonIndex > 0) {
            const key = trimmedLine.substring(0, colonIndex).trim();
            const value = trimmedLine.substring(colonIndex + 1).trim();
            
            if (value === '|' || value === '>') {
              // Multiline value
              currentKey = key;
              inMultiline = true;
              multilineValue = '';
            } else {
              parsed[key] = value;
            }
          }
        }
      }
      
      // Handle any remaining multiline value
      if (inMultiline && multilineValue) {
        parsed[currentKey] = multilineValue.trim();
      }
      
      // Add additional notes if present
      if (additionalNotes) {
        parsed.notes = parsed.notes ? `${parsed.notes}\n\n${additionalNotes}` : additionalNotes;
      }
      
      return {
        isStructured: true,
        data: parsed,
        rawText: accommodationData
      };
    } catch (error) {
      // Failed to parse, treat as plain text
      return {
        isStructured: false,
        data: null,
        rawText: accommodationData
      };
    }
  }
  
  // Not YAML frontmatter, treat as plain text
  return {
    isStructured: false,
    data: null,
    rawText: accommodationData
  };
}

/**
 * Generate accommodation template
 */
export function generateAccommodationTemplate(): string {
  return `---
name: 
address: 
website: 
phone: 
checkin: 
checkout: 
notes: |
  
---`;
}