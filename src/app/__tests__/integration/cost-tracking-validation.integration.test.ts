/**
 * Integration tests for cost tracking API endpoints with trip boundary validation
 */

import { NextRequest } from 'next/server';
import { POST as costTrackingPOST, GET as costTrackingGET, PUT as costTrackingPUT } from '../../api/cost-tracking/route';
import { GET as costTrackingListGET } from '../../api/cost-tracking/list/route';
import { POST as ynabProcessPOST } from '../../api/cost-tracking/[id]/ynab-process/route';
import { POST as validatePOST, GET as validateGET } from '../../api/cost-tracking/[id]/validate/route';
import { loadUnifiedTripData, updateCostData } from '../../lib/unifiedDataService';
import { UnifiedTripData } from '../../lib/dataMigration';
import { Expense, BudgetItem, YnabCategoryMapping, YnabTransaction } from '../../types';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { getDataDir } from '../../lib/dataDirectory';

// Mock the admin domain check
jest.mock('../../lib/server-domains', () => ({
  __esModule: true,
  isAdminDomain: jest.fn()
}));

// Mock the unified data service
jest.mock('../../lib/unifiedDataService', () => ({
  __esModule: true,
  loadUnifiedTripData: jest.fn(),
  updateCostData: jest.fn(),
  listAllTrips: jest.fn()
}));

const { isAdminDomain: mockIsAdminDomain } = jest.requireMock('../../lib/server-domains');
const {
  loadUnifiedTripData: mockLoadUnifiedTripData,
  updateCostData: mockUpdateCostData,
  listAllTrips: mockListAllTrips
} = jest.requireMock('../../lib/unifiedDataService');

(mockIsAdminDomain as jest.Mock).mockResolvedValue(true);

describe('Cost Tracking API Validation Integration Tests', () => {
  const mockTripId = 'test-trip-123';
  const mockExpenseId = 'expense-1';
  const mockLocationId = 'location-1';
  const mockAccommodationId = 'accommodation-1';
  const DATA_DIR = getDataDir();

  const createMockUnifiedTripData = (includeExpense = true, includeTravelItems = true): UnifiedTripData => ({
    schemaVersion: 4,
    id: mockTripId,
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
      expenses: includeExpense ? [{
        id: mockExpenseId,
        date: new Date('2024-01-05'),
        amount: 100,
        currency: 'EUR',
        category: 'Food',
        country: 'Germany',
        description: 'Test expense',
        notes: '',
        isGeneralExpense: false,
        expenseType: 'actual'
      }] : [],
      ynabImportData: {
        mappings: [],
        importedTransactionHashes: []
      }
    },
    travelData: includeTravelItems ? {
      locations: [{
        id: mockLocationId,
        name: 'Test Location',
        coordinates: { lat: 52.5, lng: 13.4 },
        country: 'Germany',
        costTrackingLinks: includeExpense ? [{
          expenseId: mockExpenseId,
          linkType: 'manual',
          notes: 'Test link'
        }] : []
      }],
      routes: [],
      days: []
    } : undefined,
    accommodations: includeTravelItems ? [{
      id: mockAccommodationId,
      name: 'Test Hotel',
      locationId: mockLocationId,
      checkIn: '2024-01-02',
      checkOut: '2024-01-04',
      costTrackingLinks: []
    }] : []
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Cost Tracking Main Endpoint', () => {
    it('should validate trip boundaries on GET request', async () => {
      const mockData = createMockUnifiedTripData();
      mockLoadUnifiedTripData.mockResolvedValue(mockData);

      const request = new NextRequest(`http://localhost/api/cost-tracking?id=${mockTripId}`);
      const response = await costTrackingGET(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.tripId).toBe(mockTripId);
      expect(result.expenses).toHaveLength(1);
      expect(result.hasValidationWarnings).toBe(false);
      expect(mockLoadUnifiedTripData).toHaveBeenCalledWith(mockTripId);
    });

    it('should detect validation warnings on GET request with boundary violations', async () => {
      // Create data with cross-trip reference (expense linked to non-existent travel item)
      const mockData = createMockUnifiedTripData();
      mockData.travelData!.locations[0].costTrackingLinks = [{
        expenseId: 'non-existent-expense',
        linkType: 'manual',
        notes: 'Invalid link'
      }];
      mockLoadUnifiedTripData.mockResolvedValue(mockData);

      const request = new NextRequest(`http://localhost/api/cost-tracking?id=${mockTripId}`);
      const response = await costTrackingGET(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.hasValidationWarnings).toBe(true);
    });

    it('should validate trip boundaries on PUT request', async () => {
      const mockData = createMockUnifiedTripData();
      const updatedData = { ...mockData, updatedAt: new Date().toISOString() };
      mockLoadUnifiedTripData.mockResolvedValue(mockData);
      mockUpdateCostData.mockResolvedValue(updatedData);

      const updatePayload = {
        overallBudget: 1200,
        currency: 'EUR',
        expenses: mockData.costData!.expenses
      };

      const request = new NextRequest(`http://localhost/api/cost-tracking?id=${mockTripId}`, {
        method: 'PUT',
        body: JSON.stringify(updatePayload)
      });

      const response = await costTrackingPUT(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(mockUpdateCostData).toHaveBeenCalledWith(mockTripId, updatePayload);
    });
  });

  describe('Cost Tracking List Endpoint', () => {
    it('should validate all trips and include validation status', async () => {
      const mockTrip1 = createMockUnifiedTripData();
      const mockTrip2 = createMockUnifiedTripData();
      mockTrip2.id = 'test-trip-456';

      // Mock listAllTrips to return trips with cost data
      mockListAllTrips.mockResolvedValue([
        { id: mockTripId, hasCost: true, hasTravel: false, isUnified: true, locationCount: 0, accommodationCount: 0, routeCount: 0 },
        { id: 'test-trip-456', hasCost: true, hasTravel: false, isUnified: true, locationCount: 0, accommodationCount: 0, routeCount: 0 }
      ]);

      mockLoadUnifiedTripData
        .mockResolvedValueOnce(mockTrip1)
        .mockResolvedValueOnce(mockTrip2);

      const request = new NextRequest('http://localhost/api/cost-tracking/list');
      const response = await costTrackingListGET();
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result).toHaveLength(2);
      expect(result[0].tripId).toBe(mockTripId);
      expect(result[0].hasValidationWarnings).toBe(false);
      expect(result[1].tripId).toBe('test-trip-456');
      expect(result[1].hasValidationWarnings).toBe(false);
    });
  });

  describe('YNAB Process Endpoint', () => {
    const createTempYnabFile = async (transactions: YnabTransaction[]) => {
      const tempFileId = `temp-ynab-${mockTripId}-${Date.now()}`;
      const tempFilePath = join(DATA_DIR, `${tempFileId}.json`);
      await writeFile(tempFilePath, JSON.stringify({
        transactions,
        categories: ['Food', 'Transport'],
        uploadedAt: new Date().toISOString()
      }));
      return tempFileId;
    };

    afterEach(async () => {
      // Clean up temp files
      try {
        const { readdir } = await import('fs/promises');
        const tempFiles = await readdir(DATA_DIR);
        for (const file of tempFiles) {
          if (file.startsWith('temp-ynab-')) {
            await unlink(join(DATA_DIR, file));
          }
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    });

    it('should validate trip boundaries after YNAB import', async () => {
      const mockData = createMockUnifiedTripData();
      const updatedData = { ...mockData, updatedAt: new Date().toISOString() };
      mockLoadUnifiedTripData.mockResolvedValue(mockData);
      mockUpdateCostData.mockResolvedValue(updatedData);

      const tempFileId = await createTempYnabFile([
        {
          Date: '01/05/2024',
          Payee: 'Restaurant',
          Category: 'Food',
          Outflow: '€25.00',
          Inflow: '',
          Memo: 'Dinner'
        }
      ]);

      const mappings: YnabCategoryMapping[] = [{
        ynabCategory: 'Food',
        mappingType: 'country',
        countryName: 'Germany'
      }];

      const selectedTransactions = [{
        transactionHash: 'hash123',
        expenseCategory: 'Food'
      }];

      const request = new NextRequest(`http://localhost/api/cost-tracking/${mockTripId}/ynab-process`, {
        method: 'POST',
        body: JSON.stringify({
          action: 'import',
          tempFileId,
          mappings,
          selectedTransactions
        })
      });

      const response = await ynabProcessPOST(request, { params: Promise.resolve({ id: mockTripId }) });
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(mockUpdateCostData).toHaveBeenCalled();
    });
  });

  describe('Validation Endpoint', () => {
    it('should validate expense belongs to trip', async () => {
      const mockData = createMockUnifiedTripData();
      mockLoadUnifiedTripData.mockResolvedValue(mockData);

      const request = new NextRequest(`http://localhost/api/cost-tracking/${mockTripId}/validate`, {
        method: 'POST',
        body: JSON.stringify({
          action: 'validate-expense',
          expenseId: mockExpenseId
        })
      });

      const response = await validatePOST(request, { params: Promise.resolve({ id: mockTripId }) });
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.isValid).toBe(true);
      expect(result.tripId).toBe(mockTripId);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid expense not belonging to trip', async () => {
      const mockData = createMockUnifiedTripData();
      mockLoadUnifiedTripData.mockResolvedValue(mockData);

      const request = new NextRequest(`http://localhost/api/cost-tracking/${mockTripId}/validate`, {
        method: 'POST',
        body: JSON.stringify({
          action: 'validate-expense',
          expenseId: 'non-existent-expense'
        })
      });

      const response = await validatePOST(request, { params: Promise.resolve({ id: mockTripId }) });
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('EXPENSE_NOT_FOUND');
    });

    it('should validate expense-travel item link', async () => {
      const mockData = createMockUnifiedTripData();
      mockLoadUnifiedTripData.mockResolvedValue(mockData);

      const request = new NextRequest(`http://localhost/api/cost-tracking/${mockTripId}/validate`, {
        method: 'POST',
        body: JSON.stringify({
          action: 'validate-link',
          expenseId: mockExpenseId,
          travelItemId: mockLocationId
        })
      });

      const response = await validatePOST(request, { params: Promise.resolve({ id: mockTripId }) });
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid cross-trip link', async () => {
      const mockData = createMockUnifiedTripData();
      mockLoadUnifiedTripData.mockResolvedValue(mockData);

      const request = new NextRequest(`http://localhost/api/cost-tracking/${mockTripId}/validate`, {
        method: 'POST',
        body: JSON.stringify({
          action: 'validate-link',
          expenseId: mockExpenseId,
          travelItemId: 'non-existent-location'
        })
      });

      const response = await validatePOST(request, { params: Promise.resolve({ id: mockTripId }) });
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('TRAVEL_ITEM_NOT_FOUND');
    });

    it('should validate all trip boundaries via GET request', async () => {
      const mockData = createMockUnifiedTripData();
      mockLoadUnifiedTripData.mockResolvedValue(mockData);

      const request = new NextRequest(`http://localhost/api/cost-tracking/${mockTripId}/validate`);
      const response = await validateGET(request, { params: Promise.resolve({ id: mockTripId }) });
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.isValid).toBe(true);
      expect(result.summary.totalErrors).toBe(0);
      expect(result.summary.errorTypes).toHaveLength(0);
    });

    it('should provide comprehensive validation summary', async () => {
      // Create data with multiple validation issues
      const mockData = createMockUnifiedTripData();
      mockData.travelData!.locations[0].costTrackingLinks = [
        {
          expenseId: 'non-existent-expense-1',
          linkType: 'manual',
          notes: 'Invalid link 1'
        },
        {
          expenseId: 'non-existent-expense-2',
          linkType: 'manual',
          notes: 'Invalid link 2'
        }
      ];
      mockLoadUnifiedTripData.mockResolvedValue(mockData);

      const request = new NextRequest(`http://localhost/api/cost-tracking/${mockTripId}/validate`);
      const response = await validateGET(request, { params: Promise.resolve({ id: mockTripId }) });
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.isValid).toBe(false);
      expect(result.summary.totalErrors).toBe(2);
      expect(result.summary.errorTypes).toContain('EXPENSE_NOT_FOUND');
      expect(result.summary.affectedTravelItems).toContain(mockLocationId);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing trip data gracefully', async () => {
      mockLoadUnifiedTripData.mockResolvedValue(null);

      const request = new NextRequest(`http://localhost/api/cost-tracking?id=non-existent-trip`);
      const response = await costTrackingGET(request);
      const result = await response.json();

      expect(response.status).toBe(404);
      expect(result.error).toBe('Cost tracking data not found');
    });

    it('should handle validation endpoint errors', async () => {
      mockLoadUnifiedTripData.mockResolvedValue(null);

      const request = new NextRequest(`http://localhost/api/cost-tracking/non-existent-trip/validate`, {
        method: 'POST',
        body: JSON.stringify({
          action: 'validate-expense',
          expenseId: 'test-expense'
        })
      });

      const response = await validatePOST(request, { params: Promise.resolve({ id: 'non-existent-trip' }) });
      const result = await response.json();

      expect(response.status).toBe(404);
      expect(result.error).toBe('Trip not found');
    });

    it('should handle invalid validation actions', async () => {
      const mockData = createMockUnifiedTripData();
      mockLoadUnifiedTripData.mockResolvedValue(mockData);

      const request = new NextRequest(`http://localhost/api/cost-tracking/${mockTripId}/validate`, {
        method: 'POST',
        body: JSON.stringify({
          action: 'invalid-action'
        })
      });

      const response = await validatePOST(request, { params: Promise.resolve({ id: mockTripId }) });
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.error).toContain('Invalid action');
    });
  });
});
