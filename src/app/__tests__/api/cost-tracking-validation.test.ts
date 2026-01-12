/**
 * Unit tests for cost tracking API validation functionality
 */

import { validateAllTripBoundaries } from '@/app/lib/tripBoundaryValidation';
import { UnifiedTripData } from '@/app/lib/dataMigration';

describe('Cost Tracking API Validation', () => {
  const createMockTripData = (hasValidLinks = true): UnifiedTripData => ({
    schemaVersion: 4,
    id: 'test-trip-123',
    title: 'Test Trip',
    description: 'Test trip for validation',
    startDate: '2024-01-01',
    endDate: '2024-01-10',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    costData: {
      overallBudget: 1000,
      currency: 'EUR',
      countryBudgets: [],
      expenses: [{
        id: 'expense-1',
        date: new Date('2024-01-05'),
        amount: 100,
        currency: 'EUR',
        category: 'Food',
        country: 'Germany',
        description: 'Test expense',
        notes: '',
        isGeneralExpense: false,
        expenseType: 'actual'
      }],
      ynabImportData: {
        mappings: [],
        importedTransactionHashes: []
      }
    },
    travelData: {
      locations: [{
        id: 'location-1',
        name: 'Test Location',
        coordinates: { lat: 52.5, lng: 13.4 },
        country: 'Germany',
        costTrackingLinks: [{
          expenseId: hasValidLinks ? 'expense-1' : 'non-existent-expense',
          linkType: 'manual',
          notes: 'Test link'
        }]
      }],
      routes: [],
      days: []
    },
    accommodations: []
  });

  describe('Trip Boundary Validation in API Context', () => {
    it('should validate trip with valid expense-travel item links', () => {
      const tripData = createMockTripData(true);
      const validation = validateAllTripBoundaries(tripData);
      
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect invalid expense-travel item links', () => {
      const tripData = createMockTripData(false);
      const validation = validateAllTripBoundaries(tripData);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toHaveLength(1);
      expect(validation.errors[0].type).toBe('EXPENSE_NOT_FOUND');
      expect(validation.errors[0].expenseId).toBe('non-existent-expense');
    });

    it('should handle trip data without cost data', () => {
      const tripData = createMockTripData(true);
      delete tripData.costData;
      
      const validation = validateAllTripBoundaries(tripData);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toHaveLength(1);
      expect(validation.errors[0].type).toBe('EXPENSE_NOT_FOUND');
    });

    it('should handle trip data without travel data', () => {
      const tripData = createMockTripData(true);
      delete tripData.travelData;
      delete tripData.accommodations;
      
      const validation = validateAllTripBoundaries(tripData);
      
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should validate multiple expense links correctly', () => {
      const tripData = createMockTripData(true);
      
      // Add another expense
      tripData.costData!.expenses.push({
        id: 'expense-2',
        date: new Date('2024-01-06'),
        amount: 50,
        currency: 'EUR',
        category: 'Transport',
        country: 'Germany',
        description: 'Bus ticket',
        notes: '',
        isGeneralExpense: false,
        expenseType: 'actual'
      });

      // Add another location with valid link
      tripData.travelData!.locations.push({
        id: 'location-2',
        name: 'Train Station',
        coordinates: { lat: 52.6, lng: 13.5 },
        country: 'Germany',
        costTrackingLinks: [{
          expenseId: 'expense-2',
          linkType: 'manual',
          notes: 'Transport expense'
        }]
      });

      const validation = validateAllTripBoundaries(tripData);
      
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect mixed valid and invalid links', () => {
      const tripData = createMockTripData(true);
      
      // Add location with invalid link
      tripData.travelData!.locations.push({
        id: 'location-2',
        name: 'Invalid Location',
        coordinates: { lat: 52.6, lng: 13.5 },
        country: 'Germany',
        costTrackingLinks: [{
          expenseId: 'non-existent-expense',
          linkType: 'manual',
          notes: 'Invalid link'
        }]
      });

      const validation = validateAllTripBoundaries(tripData);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toHaveLength(1);
      expect(validation.errors[0].type).toBe('EXPENSE_NOT_FOUND');
      expect(validation.errors[0].itemId).toBe('location-2');
    });
  });

  describe('Validation Error Reporting', () => {
    it('should provide detailed error information', () => {
      const tripData = createMockTripData(false);
      const validation = validateAllTripBoundaries(tripData);
      
      expect(validation.errors[0]).toMatchObject({
        type: 'EXPENSE_NOT_FOUND',
        message: expect.stringContaining('non-existent-expense'),
        expenseId: 'non-existent-expense',
        itemId: 'location-1',
        tripId: 'test-trip-123'
      });
    });

    it('should handle multiple error types', () => {
      const tripData = createMockTripData(true);
      
      // Add accommodation with invalid expense link
      tripData.accommodations = [{
        id: 'accommodation-1',
        name: 'Test Hotel',
        locationId: 'location-1',
        checkIn: '2024-01-02',
        checkOut: '2024-01-04',
        costTrackingLinks: [{
          expenseId: 'another-non-existent-expense',
          linkType: 'manual',
          notes: 'Invalid accommodation link'
        }]
      }];

      const validation = validateAllTripBoundaries(tripData);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toHaveLength(1);
      expect(validation.errors[0].type).toBe('EXPENSE_NOT_FOUND');
      expect(validation.errors[0].itemId).toBe('accommodation-1');
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle large numbers of expenses and links efficiently', () => {
      const tripData = createMockTripData(true);
      
      // Add many expenses
      for (let i = 2; i <= 100; i++) {
        tripData.costData!.expenses.push({
          id: `expense-${i}`,
          date: new Date('2024-01-05'),
          amount: 10,
          currency: 'EUR',
          category: 'Food',
          country: 'Germany',
          description: `Test expense ${i}`,
          notes: '',
          isGeneralExpense: false,
          expenseType: 'actual'
        });
      }

      // Add many locations with valid links
      for (let i = 2; i <= 50; i++) {
        tripData.travelData!.locations.push({
          id: `location-${i}`,
          name: `Location ${i}`,
          coordinates: { lat: 52.5 + i * 0.01, lng: 13.4 + i * 0.01 },
          country: 'Germany',
          costTrackingLinks: [{
            expenseId: `expense-${i}`,
            linkType: 'manual',
            notes: `Link ${i}`
          }]
        });
      }

      const startTime = Date.now();
      const validation = validateAllTripBoundaries(tripData);
      const endTime = Date.now();
      
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(endTime - startTime).toBeLessThan(100); // Should complete in under 100ms
    });

    it('should handle empty cost tracking links arrays', () => {
      const tripData = createMockTripData(true);
      tripData.travelData!.locations[0].costTrackingLinks = [];
      
      const validation = validateAllTripBoundaries(tripData);
      
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should handle undefined cost tracking links', () => {
      const tripData = createMockTripData(true);
      delete tripData.travelData!.locations[0].costTrackingLinks;
      
      const validation = validateAllTripBoundaries(tripData);
      
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });
});