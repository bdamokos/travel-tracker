/**
 * Unit tests for trip boundary validation utilities
 */

import {
  validateTripBoundary,
  validateExpenseBelongsToTrip,
  validateTravelItemBelongsToTrip,
  validateCostTrackingLinks,
  validateAllTripBoundaries,
  expenseExistsInTrip,
  travelItemExistsInTrip,
  getAllExpenseIds,
  getAllTravelItemIds,
  findTravelItemById,
  getTravelItemType,
  ValidationErrorType
} from '../../lib/tripBoundaryValidation';
import { UnifiedTripData } from '../../lib/dataMigration';
import { Location, Transportation, Accommodation, Expense } from '../../types';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { describe } from 'node:test';

describe('Trip Boundary Validation', () => {
  // Test data setup
  const mockExpense: Expense = {
    id: 'expense-1',
    date: new Date('2024-01-01'),
    amount: 100,
    currency: 'EUR',
    category: 'Food',
    country: 'France',
    description: 'Test expense',
    expenseType: 'actual'
  };

  const mockLocation: Location = {
    id: 'location-1',
    name: 'Paris',
    coordinates: [48.8566, 2.3522],
    date: new Date('2024-01-01'),
    costTrackingLinks: [{ expenseId: 'expense-1' }]
  };

  const mockTransportation: Transportation = {
    id: 'transport-1',
    type: 'train',
    from: 'Paris',
    to: 'Lyon',
    costTrackingLinks: [{ expenseId: 'expense-1' }]
  };

  const mockAccommodation: Accommodation = {
    id: 'accommodation-1',
    name: 'Hotel Paris',
    locationId: 'location-1',
    createdAt: '2024-01-01T00:00:00Z',
    costTrackingLinks: [{ expenseId: 'expense-1' }]
  };

  const mockTripData: UnifiedTripData = {
    schemaVersion: 4,
    id: 'trip-1',
    title: 'Test Trip',
    description: 'A test trip',
    startDate: '2024-01-01',
    endDate: '2024-01-10',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    travelData: {
      locations: [mockLocation],
      routes: [mockTransportation]
    },
    accommodations: [mockAccommodation],
    costData: {
      overallBudget: 1000,
      currency: 'EUR',
      countryBudgets: [],
      expenses: [mockExpense]
    }
  };

  describe('validateExpenseBelongsToTrip', () => {
    it('should validate existing expense', () => {
      const result = validateExpenseBelongsToTrip('expense-1', mockTripData);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject non-existing expense', () => {
      const result = validateExpenseBelongsToTrip('expense-999', mockTripData);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe(ValidationErrorType.EXPENSE_NOT_FOUND);
      expect(result.errors[0].expenseId).toBe('expense-999');
    });

    it('should handle null trip data', () => {
      const result = validateExpenseBelongsToTrip('expense-1', null as any);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe(ValidationErrorType.INVALID_TRIP_DATA);
    });

    it('should handle trip data without ID', () => {
      const tripWithoutId = { ...mockTripData, id: '' };
      const result = validateExpenseBelongsToTrip('expense-1', tripWithoutId);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe(ValidationErrorType.MISSING_TRIP_ID);
    });
  });

  describe('validateTravelItemBelongsToTrip', () => {
    it('should validate existing location', () => {
      const result = validateTravelItemBelongsToTrip('location-1', mockTripData);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate existing transportation', () => {
      const result = validateTravelItemBelongsToTrip('transport-1', mockTripData);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate existing accommodation', () => {
      const result = validateTravelItemBelongsToTrip('accommodation-1', mockTripData);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject non-existing travel item', () => {
      const result = validateTravelItemBelongsToTrip('item-999', mockTripData);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe(ValidationErrorType.TRAVEL_ITEM_NOT_FOUND);
      expect(result.errors[0].itemId).toBe('item-999');
    });

    it('should handle null trip data', () => {
      const result = validateTravelItemBelongsToTrip('location-1', null as any);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe(ValidationErrorType.INVALID_TRIP_DATA);
    });
  });

  describe('validateTripBoundary', () => {
    it('should validate when both expense and travel item exist', () => {
      const result = validateTripBoundary('expense-1', 'location-1', mockTripData);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject when expense does not exist', () => {
      const result = validateTripBoundary('expense-999', 'location-1', mockTripData);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe(ValidationErrorType.EXPENSE_NOT_FOUND);
    });

    it('should reject when travel item does not exist', () => {
      const result = validateTripBoundary('expense-1', 'item-999', mockTripData);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe(ValidationErrorType.TRAVEL_ITEM_NOT_FOUND);
    });

    it('should reject when both expense and travel item do not exist', () => {
      const result = validateTripBoundary('expense-999', 'item-999', mockTripData);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].type).toBe(ValidationErrorType.EXPENSE_NOT_FOUND);
      expect(result.errors[1].type).toBe(ValidationErrorType.TRAVEL_ITEM_NOT_FOUND);
    });
  });

  describe('validateCostTrackingLinks', () => {
    it('should validate valid cost tracking links', () => {
      const result = validateCostTrackingLinks(mockLocation, mockTripData);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid cost tracking links', () => {
      const locationWithInvalidLink: Location = {
        ...mockLocation,
        costTrackingLinks: [{ expenseId: 'expense-999' }]
      };
      const result = validateCostTrackingLinks(locationWithInvalidLink, mockTripData);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe(ValidationErrorType.EXPENSE_NOT_FOUND);
      expect(result.errors[0].itemId).toBe('location-1');
    });

    it('should handle travel items without cost tracking links', () => {
      const locationWithoutLinks: Location = {
        ...mockLocation,
        costTrackingLinks: undefined
      };
      const result = validateCostTrackingLinks(locationWithoutLinks, mockTripData);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('validateAllTripBoundaries', () => {
    it('should validate trip with valid boundaries', () => {
      const result = validateAllTripBoundaries(mockTripData);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid boundaries in locations', () => {
      const tripWithInvalidLocation: UnifiedTripData = {
        ...mockTripData,
        travelData: {
          ...mockTripData.travelData!,
          locations: [{
            ...mockLocation,
            costTrackingLinks: [{ expenseId: 'expense-999' }]
          }]
        }
      };
      const result = validateAllTripBoundaries(tripWithInvalidLocation);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe(ValidationErrorType.EXPENSE_NOT_FOUND);
    });

    it('should detect invalid boundaries in accommodations', () => {
      const tripWithInvalidAccommodation: UnifiedTripData = {
        ...mockTripData,
        accommodations: [{
          ...mockAccommodation,
          costTrackingLinks: [{ expenseId: 'expense-999' }]
        }]
      };
      const result = validateAllTripBoundaries(tripWithInvalidAccommodation);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe(ValidationErrorType.EXPENSE_NOT_FOUND);
    });

    it('should handle null trip data', () => {
      const result = validateAllTripBoundaries(null as any);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe(ValidationErrorType.INVALID_TRIP_DATA);
    });
  });

  describe('Utility functions', () => {
    describe('expenseExistsInTrip', () => {
      it('should return true for existing expense', () => {
        expect(expenseExistsInTrip('expense-1', mockTripData)).toBe(true);
      });

      it('should return false for non-existing expense', () => {
        expect(expenseExistsInTrip('expense-999', mockTripData)).toBe(false);
      });
    });

    describe('travelItemExistsInTrip', () => {
      it('should return true for existing location', () => {
        expect(travelItemExistsInTrip('location-1', mockTripData)).toBe(true);
      });

      it('should return true for existing transportation', () => {
        expect(travelItemExistsInTrip('transport-1', mockTripData)).toBe(true);
      });

      it('should return true for existing accommodation', () => {
        expect(travelItemExistsInTrip('accommodation-1', mockTripData)).toBe(true);
      });

      it('should return false for non-existing item', () => {
        expect(travelItemExistsInTrip('item-999', mockTripData)).toBe(false);
      });
    });

    describe('getAllExpenseIds', () => {
      it('should return all expense IDs', () => {
        const ids = getAllExpenseIds(mockTripData);
        expect(ids).toEqual(['expense-1']);
      });

      it('should return empty array for trip without expenses', () => {
        const tripWithoutExpenses = { ...mockTripData, costData: undefined };
        const ids = getAllExpenseIds(tripWithoutExpenses);
        expect(ids).toEqual([]);
      });
    });

    describe('getAllTravelItemIds', () => {
      it('should return all travel item IDs', () => {
        const ids = getAllTravelItemIds(mockTripData);
        expect(ids).toContain('location-1');
        expect(ids).toContain('transport-1');
        expect(ids).toContain('accommodation-1');
        expect(ids).toHaveLength(3);
      });

      it('should return empty array for trip without travel items', () => {
        const tripWithoutItems: UnifiedTripData = {
          ...mockTripData,
          travelData: undefined,
          accommodations: undefined
        };
        const ids = getAllTravelItemIds(tripWithoutItems);
        expect(ids).toEqual([]);
      });
    });

    describe('findTravelItemById', () => {
      it('should find location by ID', () => {
        const item = findTravelItemById('location-1', mockTripData);
        expect(item).toBe(mockLocation);
      });

      it('should find transportation by ID', () => {
        const item = findTravelItemById('transport-1', mockTripData);
        expect(item).toBe(mockTransportation);
      });

      it('should find accommodation by ID', () => {
        const item = findTravelItemById('accommodation-1', mockTripData);
        expect(item).toBe(mockAccommodation);
      });

      it('should return null for non-existing item', () => {
        const item = findTravelItemById('item-999', mockTripData);
        expect(item).toBeNull();
      });
    });

    describe('getTravelItemType', () => {
      it('should identify location type', () => {
        expect(getTravelItemType(mockLocation)).toBe('location');
      });

      it('should identify transportation type', () => {
        expect(getTravelItemType(mockTransportation)).toBe('transportation');
      });

      it('should identify accommodation type', () => {
        expect(getTravelItemType(mockAccommodation)).toBe('accommodation');
      });

      it('should throw error for unknown type', () => {
        const unknownItem = { id: 'unknown' } as any;
        expect(() => getTravelItemType(unknownItem)).toThrow('Unknown travel item type');
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle trip with no cost data', () => {
      const tripWithoutCostData: UnifiedTripData = {
        ...mockTripData,
        costData: undefined
      };

      const expenseValidation = validateExpenseBelongsToTrip('expense-1', tripWithoutCostData);
      expect(expenseValidation.isValid).toBe(false);

      // Since the original trip has cost tracking links that reference expenses,
      // but we removed cost data, the validation should fail
      const boundaryValidation = validateAllTripBoundaries(tripWithoutCostData);
      expect(boundaryValidation.isValid).toBe(false); // Cost links reference non-existent expenses
    });

    it('should handle trip with no travel data', () => {
      const tripWithoutTravelData: UnifiedTripData = {
        ...mockTripData,
        travelData: undefined,
        accommodations: undefined
      };

      const itemValidation = validateTravelItemBelongsToTrip('location-1', tripWithoutTravelData);
      expect(itemValidation.isValid).toBe(false);

      const boundaryValidation = validateAllTripBoundaries(tripWithoutTravelData);
      expect(boundaryValidation.isValid).toBe(true); // No travel items to validate
    });

    it('should handle empty cost tracking links arrays', () => {
      const locationWithEmptyLinks: Location = {
        ...mockLocation,
        costTrackingLinks: []
      };
      const result = validateCostTrackingLinks(locationWithEmptyLinks, mockTripData);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});