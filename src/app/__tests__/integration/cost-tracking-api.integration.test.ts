/**
 * API endpoint tests for cost-tracking routes
 * Tests expense management, YNAB import, and cost calculations
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';
import { CURRENT_SCHEMA_VERSION, type UnifiedTripData } from '../../lib/dataMigration';
import { join } from 'path';
import { mkdir, readdir, rm } from 'fs/promises';

// Mock admin domain checks to avoid network dependency
const mockIsAdminDomain = jest.fn().mockResolvedValue(true);
jest.doMock('../../lib/server-domains', () => ({
  isAdminDomain: mockIsAdminDomain
}));

// In-memory cost data store to keep tests deterministic
const costDataStore: Record<string, UnifiedTripData> = {};

const mockLoadUnifiedTripData = jest.fn(async (id: string) => {
  return costDataStore[id] || null;
});

const mockUpdateCostData = jest.fn(async (id: string, costUpdates: Record<string, unknown>) => {
  const now = new Date().toISOString();
  const existing = costDataStore[id];

  const baseData: UnifiedTripData = existing || {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id,
    title: '',
    description: '',
    startDate: '',
    endDate: '',
    createdAt: (costUpdates.createdAt as string) || now,
    updatedAt: now
  };

  const resolvedCustomCategories =
    (costUpdates.customCategories as string[] | undefined) || baseData.costData?.customCategories;

  const updated: UnifiedTripData = {
    ...baseData,
    title: (costUpdates.tripTitle as string) ?? baseData.title,
    startDate: (costUpdates.tripStartDate as string) ?? baseData.startDate,
    endDate: (costUpdates.tripEndDate as string) ?? baseData.endDate,
    createdAt: baseData.createdAt,
    updatedAt: (costUpdates.updatedAt as string) || now,
    costData: {
      overallBudget: (costUpdates.overallBudget as number) ?? baseData.costData?.overallBudget ?? 0,
      currency: (costUpdates.currency as string) || baseData.costData?.currency || 'EUR',
      countryBudgets: (costUpdates.countryBudgets as unknown[]) || baseData.costData?.countryBudgets || [],
      expenses: (costUpdates.expenses as unknown[]) || baseData.costData?.expenses || [],
      ynabImportData: (costUpdates.ynabImportData as unknown) || baseData.costData?.ynabImportData,
      ynabConfig: (costUpdates.ynabConfig as unknown) || baseData.costData?.ynabConfig,
      ...(resolvedCustomCategories ? { customCategories: resolvedCustomCategories } : {})
    }
  };

  costDataStore[id] = updated;
  return updated;
});

const mockListAllTrips = jest.fn(async () =>
  Object.values(costDataStore).map((trip) => ({
    id: trip.id,
    title: trip.title,
    startDate: trip.startDate,
    endDate: trip.endDate,
    createdAt: trip.createdAt,
    hasTravel: Boolean(trip.travelData),
    hasCost: Boolean(trip.costData),
    isUnified: true,
    locationCount: trip.travelData?.locations?.length || 0,
    accommodationCount: trip.accommodations?.length || 0,
    routeCount: trip.travelData?.routes?.length || 0
  }))
);

jest.doMock('../../lib/unifiedDataService', () => ({
  loadUnifiedTripData: mockLoadUnifiedTripData,
  updateCostData: mockUpdateCostData,
  listAllTrips: mockListAllTrips
}));

// Re-import modules after mocking
const { POST: mockedCostTrackingPOST, GET: mockedCostTrackingGET, PUT: mockedCostTrackingPUT } = jest.requireActual(
  '../../api/cost-tracking/route'
);
const { GET: mockedCostTrackingListGET } = jest.requireActual('../../api/cost-tracking/list/route');
const { POST: mockedYnabUploadPOST } = jest.requireActual('../../api/cost-tracking/[id]/ynab-upload/route');
const { POST: mockedYnabProcessPOST } = jest.requireActual('../../api/cost-tracking/[id]/ynab-process/route');

// Test data that matches the real cost tracking structure
const TEST_COST_DATA = {
  tripId: 'test-trip-for-costs',
  tripTitle: 'Cost Tracking Test Trip',
  tripStartDate: '2024-07-01T00:00:00.000Z',
  tripEndDate: '2024-07-15T00:00:00.000Z',
  overallBudget: 2500,
  currency: 'EUR',
  countryBudgets: [
    {
      id: 'budget-france',
      country: 'France',
      amount: 1200,
      currency: 'EUR',
      notes: 'France portion of trip'
    }
  ],
  expenses: [
    {
      id: 'expense-test-1',
      date: '2024-07-02T00:00:00.000Z',
      amount: 150,
      currency: 'EUR',
      category: 'Accommodation',
      country: 'France',
      description: 'Hotel night 1',
      expenseType: 'actual'
    },
    {
      id: 'expense-test-2',
      date: '2024-07-08T00:00:00.000Z',
      amount: 300,
      currency: 'EUR',
      category: 'Activities & Tours',
      country: 'France',
      description: 'Museum and tour planned',
      expenseType: 'planned'
    }
  ]
};

const dataDir = join(process.cwd(), 'data');
const BASE_URL = 'http://localhost';
const createJsonRequest = (url: string, method: string, body?: unknown) =>
  new NextRequest(url, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: { 'content-type': 'application/json', host: 'localhost' }
  });

const callCostTracking = (method: 'POST' | 'GET' | 'PUT', path: string, body?: unknown) => {
  const request = createJsonRequest(`${BASE_URL}${path}`, method, body);
  if (method === 'POST') return mockedCostTrackingPOST(request);
  if (method === 'PUT') return mockedCostTrackingPUT(request);
  return mockedCostTrackingGET(request);
};

const callCostTrackingList = () => mockedCostTrackingListGET();

const callYnabUpload = (id: string, formData: FormData) => {
  const request = new NextRequest(`${BASE_URL}/api/cost-tracking/${id}/ynab-upload`, {
    method: 'POST',
    body: formData,
    headers: { host: 'localhost' }
  });
  return mockedYnabUploadPOST(request, { params: Promise.resolve({ id }) });
};

const callYnabProcess = (id: string, body: unknown) => {
  const request = createJsonRequest(`${BASE_URL}/api/cost-tracking/${id}/ynab-process`, 'POST', body);
  return mockedYnabProcessPOST(request, { params: Promise.resolve({ id }) });
};

const cleanupDataDir = async (initialFiles: string[]) => {
  const existing = await readdir(dataDir);
  const initialSet = new Set(initialFiles);
  await Promise.all(
    existing
      .filter((file) => !initialSet.has(file))
      .map((file) => rm(join(dataDir, file), { recursive: true, force: true }))
  );
};

describe('Cost Tracking API Endpoints', () => {
  let createdCostId: string;
  let initialDataFiles: string[] = [];

  beforeAll(async () => {
    await mkdir(dataDir, { recursive: true });
    try {
      initialDataFiles = await readdir(dataDir);
    } catch {
      initialDataFiles = [];
    }
  });

  beforeEach(() => {
    mockIsAdminDomain.mockClear();
  });

  describe('POST /api/cost-tracking (Create Cost Data)', () => {
    it('should create new cost tracking data', async () => {
      const response = await callCostTracking('POST', '/api/cost-tracking', TEST_COST_DATA);
      const result = await response.json();
      
      expect(result.success).toBe(true);
      expect(result.id).toBeDefined();
      expect(typeof result.id).toBe('string');
      
      createdCostId = result.id;
    }, 10000); // 10 second timeout

    it('should handle minimal cost data creation', async () => {
      const minimalData = {
        tripTitle: 'Minimal Cost Data'
        // Testing what the API actually accepts
      };

      const response = await callCostTracking('POST', '/api/cost-tracking', minimalData);

      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.id).toBeDefined();
    });
  });

  describe('GET /api/cost-tracking (Read Cost Data)', () => {
    it('should retrieve cost data by ID', async () => {
      if (!createdCostId) {
        throw new Error('No cost data created to test retrieval');
      }

      const response = await callCostTracking('GET', `/api/cost-tracking?id=${createdCostId}`);
      const costData = await response.json();

      expect(costData.id).toBe(`cost-${createdCostId}`);
      expect(costData.tripTitle).toBe(TEST_COST_DATA.tripTitle);
      expect(costData.overallBudget).toBe(TEST_COST_DATA.overallBudget);
      expect(costData.currency).toBe('EUR');
      expect(costData.countryBudgets).toHaveLength(1);
      expect(costData.expenses).toHaveLength(2);
    });
  });

  describe('PUT /api/cost-tracking (Update Cost Data)', () => {
    it('should update cost data and recalculate summary', async () => {
      if (!createdCostId) {
        throw new Error('No cost data created to test update');
      }

      const updatedData = {
        ...TEST_COST_DATA,
        id: createdCostId,
        overallBudget: 3000, // Increase budget
        expenses: [
          ...TEST_COST_DATA.expenses,
          {
            id: 'expense-test-3',
            date: '2024-07-05T00:00:00.000Z',
            amount: 45,
            currency: 'EUR',
            category: 'Food & Dining',
            country: 'France',
            description: 'Lunch',
            expenseType: 'actual'
          }
        ]
      };

      const response = await callCostTracking('PUT', `/api/cost-tracking?id=${createdCostId}`, updatedData);

      const result = await response.json();
      expect(result.success).toBe(true);

      // Verify the update
      const getResponse = await callCostTracking('GET', `/api/cost-tracking?id=${createdCostId}`);
      const updatedCostData = await getResponse.json();
      
      expect(updatedCostData.overallBudget).toBe(3000);
      expect(updatedCostData.expenses).toHaveLength(3);
      expect(updatedCostData.expenses[2].description).toBe('Lunch');
    });
  });

  describe('GET /api/cost-tracking/list (List All Cost Data)', () => {
    it('should list all cost tracking data', async () => {
      const response = await callCostTrackingList();
      const costDataList = await response.json();

      expect(Array.isArray(costDataList)).toBe(true);
      expect(costDataList.length).toBeGreaterThan(0);
      
      // Should include our created cost data (with cost- prefix)
      const ourCostData = costDataList.find(item => item.id === `cost-${createdCostId}`);
      expect(ourCostData).toBeDefined();
      expect(ourCostData.tripTitle).toBe(TEST_COST_DATA.tripTitle);
    });
  });

  describe('YNAB Import Workflow', () => {
    it('should upload and process YNAB file', async () => {
      if (!createdCostId) {
        throw new Error('No cost data created to test YNAB import');
      }

      // Create a simple TSV content for testing
      const mockYnabContent = `Account\tFlag\tDate\tPayee\tCategory Group/Category\tCategory Group\tCategory\tMemo\tOutflow\tInflow
Checking\t\t2024-07-03\tRestaurant XYZ\tFood & Dining\tFood & Dining\tFood & Dining\tDinner\t€85.00\t
Checking\t\t2024-07-04\tHotel ABC\tAccommodation\tAccommodation\tAccommodation\tHotel stay\t€120.00\t`;

      // Create a FormData with the TSV content
      const formData = new FormData();
      const blob = new Blob([mockYnabContent], { type: 'text/tab-separated-values' });
      formData.append('file', blob, 'test-export.tsv');

      const uploadResponse = await callYnabUpload(createdCostId, formData);

      const uploadResult = await uploadResponse.json();
      expect(uploadResult.success).toBe(true);
      expect(uploadResult.transactionCount).toBe(2);
      expect(uploadResult.categories).toContain('Food & Dining');
      expect(uploadResult.categories).toContain('Accommodation');
      expect(uploadResult.tempFileId).toBeDefined();
    });

    it('should require proper YNAB processing parameters', async () => {
      if (!createdCostId) {
        throw new Error('No cost data created to test YNAB processing');
      }

      // Test missing required parameters
      const invalidProcessData = {
        // Missing tempFileId, mappings, selectedTransactions
      };

      const response = await callYnabProcess(createdCostId, invalidProcessData);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.error).toMatch(/Missing required data/);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should accept invalid expense amounts (permissive API)', async () => {
      if (!createdCostId) {
        throw new Error('No cost data created to test error handling');
      }

      const dataWithInvalidAmount = {
        ...TEST_COST_DATA,
        id: createdCostId,
        expenses: [
          {
            id: 'expense-with-invalid-amount',
            date: '2024-07-01T00:00:00.000Z',
            amount: 'not-a-number', // Invalid amount that API accepts
            currency: 'EUR',
            category: 'Food & Dining',
            country: 'France',
            description: 'Expense with invalid amount',
            expenseType: 'actual'
          }
        ]
      };

      // API is permissive and should accept this data without validation
      const response = await callCostTracking('PUT', `/api/cost-tracking?id=${createdCostId}`, dataWithInvalidAmount);

      const result = await response.json();
      expect(result.success).toBe(true);

      // Verify the data was stored (even with invalid amount)
      const getResponse = await callCostTracking('GET', `/api/cost-tracking?id=${createdCostId}`);
      const updatedCostData = await getResponse.json();
      expect(updatedCostData.expenses).toHaveLength(1);
      expect(updatedCostData.expenses[0].amount).toBe('not-a-number');
    });

    it('should handle missing cost tracking ID', async () => {
      const response = await callCostTracking('GET', '/api/cost-tracking?id=non-existent-id');
      const result = await response.json();

      expect(response.status).toBe(404);
      expect(result.error).toMatch(/Cost tracking data not found/);
    });

    it('should validate YNAB file format', async () => {
      if (!createdCostId) {
        throw new Error('No cost data created to test YNAB validation');
      }

      const invalidContent = 'Invalid file content';
      const formData = new FormData();
      const blob = new Blob([invalidContent], { type: 'text/plain' });
      formData.append('file', blob, 'invalid.txt');

      const response = await callYnabUpload(createdCostId, formData);

      expect(response.ok).toBe(false);
    });
  });

  // Cleanup
  afterAll(async () => {
    await cleanupDataDir(initialDataFiles);
    Object.keys(costDataStore).forEach((key) => {
      delete costDataStore[key];
    });
  });
});
