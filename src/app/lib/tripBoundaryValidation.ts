/**
 * Trip Boundary Validation Utilities
 * 
 * Ensures that expenses and travel items belong to the same trip
 * and prevents cross-trip data contamination
 */

import { UnifiedTripData } from './dataMigration';
import { Location, Transportation, Accommodation } from '@/app/types';

/**
 * Validation error types
 */
export enum ValidationErrorType {
  EXPENSE_NOT_FOUND = 'EXPENSE_NOT_FOUND',
  TRAVEL_ITEM_NOT_FOUND = 'TRAVEL_ITEM_NOT_FOUND',
  CROSS_TRIP_REFERENCE = 'CROSS_TRIP_REFERENCE',
  INVALID_TRIP_DATA = 'INVALID_TRIP_DATA',
  MISSING_TRIP_ID = 'MISSING_TRIP_ID'
}

/**
 * Validation error interface
 */
export interface ValidationError {
  type: ValidationErrorType;
  message: string;
  itemId?: string;
  expenseId?: string;
  tripId?: string;
}

/**
 * Validation result interface
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

/**
 * Travel item types for validation
 */
export type TravelItem = Location | Transportation | Accommodation;

/**
 * Travel item type discriminator
 */
export function getTravelItemType(item: TravelItem): 'location' | 'transportation' | 'accommodation' {
  if ('coordinates' in item) return 'location';
  if ('type' in item && 'from' in item && 'to' in item) return 'transportation';
  if ('locationId' in item) return 'accommodation';
  throw new Error('Unknown travel item type');
}

/**
 * Validates that an expense belongs to the specified trip
 */
export function validateExpenseBelongsToTrip(
  expenseId: string,
  tripData: UnifiedTripData
): ValidationResult {
  const errors: ValidationError[] = [];

  if (!tripData) {
    errors.push({
      type: ValidationErrorType.INVALID_TRIP_DATA,
      message: 'Trip data is null or undefined',
      expenseId
    });
    return { isValid: false, errors };
  }

  if (!tripData.id) {
    errors.push({
      type: ValidationErrorType.MISSING_TRIP_ID,
      message: 'Trip data missing ID',
      expenseId
    });
    return { isValid: false, errors };
  }

  const expense = tripData.costData?.expenses?.find(e => e.id === expenseId);
  
  if (!expense) {
    errors.push({
      type: ValidationErrorType.EXPENSE_NOT_FOUND,
      message: `Expense ${expenseId} not found in trip ${tripData.id}`,
      expenseId,
      tripId: tripData.id
    });
    return { isValid: false, errors };
  }

  return { isValid: true, errors: [] };
}

/**
 * Validates that a travel item belongs to the specified trip
 */
export function validateTravelItemBelongsToTrip(
  itemId: string,
  tripData: UnifiedTripData
): ValidationResult {
  const errors: ValidationError[] = [];

  if (!tripData) {
    errors.push({
      type: ValidationErrorType.INVALID_TRIP_DATA,
      message: 'Trip data is null or undefined',
      itemId
    });
    return { isValid: false, errors };
  }

  if (!tripData.id) {
    errors.push({
      type: ValidationErrorType.MISSING_TRIP_ID,
      message: 'Trip data missing ID',
      itemId
    });
    return { isValid: false, errors };
  }

  // Check locations
  const location = tripData.travelData?.locations?.find(l => l.id === itemId);
  if (location) {
    return { isValid: true, errors: [] };
  }

  // Check routes/transportation
  const route = tripData.travelData?.routes?.find(r => r.id === itemId);
  if (route) {
    return { isValid: true, errors: [] };
  }

  // Check accommodations
  const accommodation = tripData.accommodations?.find(a => a.id === itemId);
  if (accommodation) {
    return { isValid: true, errors: [] };
  }

  errors.push({
    type: ValidationErrorType.TRAVEL_ITEM_NOT_FOUND,
    message: `Travel item ${itemId} not found in trip ${tripData.id}`,
    itemId,
    tripId: tripData.id
  });

  return { isValid: false, errors };
}

/**
 * Main validation function that checks if an expense and travel item belong to the same trip
 */
export function validateTripBoundary(
  expenseId: string,
  travelItemId: string,
  tripData: UnifiedTripData
): ValidationResult {
  const errors: ValidationError[] = [];

  // Validate expense belongs to trip
  const expenseValidation = validateExpenseBelongsToTrip(expenseId, tripData);
  if (!expenseValidation.isValid) {
    errors.push(...expenseValidation.errors);
  }

  // Validate travel item belongs to trip
  const travelItemValidation = validateTravelItemBelongsToTrip(travelItemId, tripData);
  if (!travelItemValidation.isValid) {
    errors.push(...travelItemValidation.errors);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validates all cost tracking links for a travel item
 */
export function validateCostTrackingLinks(
  travelItem: TravelItem,
  tripData: UnifiedTripData
): ValidationResult {
  const errors: ValidationError[] = [];
  const costTrackingLinks = travelItem.costTrackingLinks || [];

  for (const link of costTrackingLinks) {
    const validation = validateExpenseBelongsToTrip(link.expenseId, tripData);
    if (!validation.isValid) {
      errors.push(...validation.errors.map(error => ({
        ...error,
        itemId: travelItem.id
      })));
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validates all travel items in a trip for boundary violations
 */
export function validateAllTripBoundaries(tripData: UnifiedTripData): ValidationResult {
  const errors: ValidationError[] = [];

  if (!tripData) {
    errors.push({
      type: ValidationErrorType.INVALID_TRIP_DATA,
      message: 'Trip data is null or undefined'
    });
    return { isValid: false, errors };
  }

  // Validate locations
  if (tripData.travelData?.locations) {
    for (const location of tripData.travelData.locations) {
      const validation = validateCostTrackingLinks(location, tripData);
      errors.push(...validation.errors);
    }
  }

  // Validate routes
  if (tripData.travelData?.routes) {
    for (const route of tripData.travelData.routes) {
      const validation = validateCostTrackingLinks(route, tripData);
      errors.push(...validation.errors);
    }
  }

  // Validate accommodations
  if (tripData.accommodations) {
    for (const accommodation of tripData.accommodations) {
      const validation = validateCostTrackingLinks(accommodation, tripData);
      errors.push(...validation.errors);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Utility function to check if an expense exists in a trip
 */
export function expenseExistsInTrip(expenseId: string, tripData: UnifiedTripData): boolean {
  return !!tripData.costData?.expenses?.find(e => e.id === expenseId);
}

/**
 * Utility function to check if a travel item exists in a trip
 */
export function travelItemExistsInTrip(itemId: string, tripData: UnifiedTripData): boolean {
  // Check locations
  if (tripData.travelData?.locations?.find(l => l.id === itemId)) {
    return true;
  }

  // Check routes
  if (tripData.travelData?.routes?.find(r => r.id === itemId)) {
    return true;
  }

  // Check accommodations
  if (tripData.accommodations?.find(a => a.id === itemId)) {
    return true;
  }

  return false;
}

/**
 * Utility function to get all expense IDs in a trip
 */
export function getAllExpenseIds(tripData: UnifiedTripData): string[] {
  return tripData.costData?.expenses?.map(e => e.id) || [];
}

/**
 * Utility function to get all travel item IDs in a trip
 */
export function getAllTravelItemIds(tripData: UnifiedTripData): string[] {
  const ids: string[] = [];

  // Add location IDs
  if (tripData.travelData?.locations) {
    ids.push(...tripData.travelData.locations.map(l => l.id));
  }

  // Add route IDs
  if (tripData.travelData?.routes) {
    ids.push(...tripData.travelData.routes.map(r => r.id));
  }

  // Add accommodation IDs
  if (tripData.accommodations) {
    ids.push(...tripData.accommodations.map(a => a.id));
  }

  return ids;
}

/**
 * Utility function to find a travel item by ID
 */
export function findTravelItemById(itemId: string, tripData: UnifiedTripData): TravelItem | null {
  // Check locations
  const location = tripData.travelData?.locations?.find(l => l.id === itemId);
  if (location) return location;

  // Check routes
  const route = tripData.travelData?.routes?.find(r => r.id === itemId);
  if (route) return route;

  // Check accommodations
  const accommodation = tripData.accommodations?.find(a => a.id === itemId);
  if (accommodation) return accommodation;

  return null;
}