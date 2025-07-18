/**
 * Integration tests for YNAB import filtering functionality
 * Tests the remember last imported transaction feature
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

const BASE_URL = process.env.TEST_API_BASE_URL || 'http://localhost:3000';

// Test data that matches the real application structure
const TEST_TRAVEL_DATA = {
  title: 'YNAB Filtering Test Trip',
  description: 'Test trip for YNAB filtering functionality',
  startDate: '2024-01-01T00:00:00.000Z',
  endDate: '2024-01-15T00:00:00.000Z',
  locations: [
    {
      id: 'test-location-1',
      name: 'Test City',
      coordinates: [40.7128, -74.0060],
      date: '2024-01-01T00:00:00.000Z',
      notes: 'Test location for YNAB filtering'
    }
  ],
  routes: []
};

const TEST_COST_DATA = {
  tripTitle: 'YNAB Filtering Test Trip',
  tripStartDate: '2024-01-01T00:00:00.000Z',
  tripEndDate: '2024-01-15T00:00:00.000Z',
  overallBudget: 1000,
  currency: 'EUR',
  countryBudgets: [
    {
      id: 'budget-test-country',
      country: 'TestCountry',
      amount: 500,
      currency: 'EUR',
      notes: 'Test budget for YNAB filtering'
    }
  ],
  expenses: []
};

// Mock YNAB transaction data
const MOCK_YNAB_TRANSACTIONS = [
  {
    Account: 'Test Account',
    Flag: '',
    Date: '01/01/2024',
    Payee: 'Restaurant A',
    'Category Group/Category': 'Food',
    'Category Group': 'Food',
    Category: 'Food',
    Memo: 'Lunch',
    Outflow: '€25,00',
    Inflow: '€0,00',
    Cleared: 'C'
  },
  {
    Account: 'Test Account',
    Flag: '',
    Date: '02/01/2024',
    Payee: 'Restaurant B',
    'Category Group/Category': 'Food',
    'Category Group': 'Food',
    Category: 'Food',
    Memo: 'Dinner',
    Outflow: '€35,00',
    Inflow: '€0,00',
    Cleared: 'C'
  },
  {
    Account: 'Test Account',
    Flag: '',
    Date: '03/01/2024',
    Payee: 'Restaurant C',
    'Category Group/Category': 'Food',
    'Category Group': 'Food',
    Category: 'Food',
    Memo: 'Breakfast',
    Outflow: '€15,00',
    Inflow: '€0,00',
    Cleared: 'C'
  }
];

describe('YNAB Import Filtering Integration', () => {
  let testTripId: string;
  let testCostId: string;

  const apiCall = async (endpoint: string, options: RequestInit = {}) => {
    const url = `${BASE_URL}${endpoint}`;
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });
    
    return response;
  };

  const createTempYnabFile = async (transactions: typeof MOCK_YNAB_TRANSACTIONS) => {
    const tsvContent = [
      'Account\tFlag\tDate\tPayee\tCategory Group/Category\tCategory Group\tCategory\tMemo\tOutflow\tInflow\tCleared',
      ...transactions.map(t => `${t.Account}\t${t.Flag}\t${t.Date}\t${t.Payee}\t${t['Category Group/Category']}\t${t['Category Group']}\t${t.Category}\t${t.Memo}\t${t.Outflow}\t${t.Inflow}\t${t.Cleared}`)
    ].join('\n');

    const formData = new FormData();
    const blob = new Blob([tsvContent], { type: 'text/tab-separated-values' });
    formData.append('file', blob, 'test-transactions.tsv');

    const uploadResponse = await apiCall(`/api/cost-tracking/${testCostId}/ynab-upload`, {
      method: 'POST',
      body: formData
    });

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed: ${uploadResponse.status}`);
    }

    const uploadData = await uploadResponse.json();
    return uploadData.tempFileId;
  };

  beforeAll(async () => {
    // Create test trip
    const createTripResponse = await apiCall('/api/travel-data', {
      method: 'POST',
      body: JSON.stringify(TEST_TRAVEL_DATA)
    });

    if (!createTripResponse.ok) {
      throw new Error(`Failed to create test trip: ${createTripResponse.status}`);
    }

    const tripData = await createTripResponse.json();
    testTripId = tripData.id;

    // Create cost tracking data
    const createCostResponse = await apiCall('/api/cost-tracking', {
      method: 'POST',
      body: JSON.stringify({
        ...TEST_COST_DATA,
        tripId: testTripId
      })
    });

    if (!createCostResponse.ok) {
      throw new Error(`Failed to create cost tracking: ${createCostResponse.status}`);
    }

    const costData = await createCostResponse.json();
    testCostId = costData.id;
  });

  afterAll(async () => {
    // Clean up test data
    if (testTripId) {
      await apiCall(`/api/travel-data/${testTripId}`, {
        method: 'DELETE'
      });
    }
  });

  describe('First import - no filtering', () => {
    it('should import all transactions on first import', async () => {
      const tempFileId = await createTempYnabFile(MOCK_YNAB_TRANSACTIONS);

      // Set up category mappings
      const mappings = [
        {
          ynabCategory: 'Food',
          mappingType: 'country',
          countryName: 'TestCountry'
        }
      ];

      // Get processed transactions
      const processResponse = await apiCall(
        `/api/cost-tracking/${testCostId}/ynab-process?tempFileId=${tempFileId}&mappings=${encodeURIComponent(JSON.stringify(mappings))}`
      );

      expect(processResponse.ok).toBe(true);
      const processData = await processResponse.json();

      // Should return all transactions since this is the first import
      expect(processData.transactions).toHaveLength(3);
      expect(processData.filteredCount).toBe(0);
      expect(processData.lastImportedTransactionFound).toBe(false);
      expect(processData.totalTransactions).toBe(3);

      // Import all transactions
      const selectedTransactions = processData.transactions.map((txn: { hash: string }) => ({
        transactionHash: txn.hash,
        expenseCategory: 'Food'
      }));

      const importResponse = await apiCall(`/api/cost-tracking/${testCostId}/ynab-process`, {
        method: 'POST',
        body: JSON.stringify({
          tempFileId,
          mappings,
          selectedTransactions
        })
      });

      expect(importResponse.ok).toBe(true);
      const importData = await importResponse.json();
      expect(importData.success).toBe(true);
      expect(importData.importedCount).toBe(3);
    });
  });

  describe('Second import - with filtering', () => {
    it('should filter previously imported transactions', async () => {
      // Create a new file with some overlapping transactions
      const newTransactions = [
        ...MOCK_YNAB_TRANSACTIONS.slice(1), // Include last two transactions from first import
        {
          Account: 'Test Account',
          Flag: '',
          Date: '04/01/2024',
          Payee: 'Restaurant D',
          'Category Group/Category': 'Food',
          'Category Group': 'Food',
          Category: 'Food',
          Memo: 'New meal',
          Outflow: '€20,00',
          Inflow: '€0,00',
          Cleared: 'C'
        }
      ];

      const tempFileId = await createTempYnabFile(newTransactions);

      // Set up category mappings
      const mappings = [
        {
          ynabCategory: 'Food',
          mappingType: 'country',
          countryName: 'TestCountry'
        }
      ];

      // Get processed transactions
      const processResponse = await apiCall(
        `/api/cost-tracking/${testCostId}/ynab-process?tempFileId=${tempFileId}&mappings=${encodeURIComponent(JSON.stringify(mappings))}`
      );

      expect(processResponse.ok).toBe(true);
      const processData = await processResponse.json();

      // Should filter out previously imported transactions
      expect(processData.transactions.length).toBeLessThan(newTransactions.length);
      expect(processData.filteredCount).toBeGreaterThan(0);
      expect(processData.lastImportedTransactionFound).toBe(true);
      expect(processData.totalTransactions).toBe(3); // Total processed transactions
    });

    it('should show all transactions when showAll=true', async () => {
      const tempFileId = await createTempYnabFile(MOCK_YNAB_TRANSACTIONS);

      // Set up category mappings
      const mappings = [
        {
          ynabCategory: 'Food',
          mappingType: 'country',
          countryName: 'TestCountry'
        }
      ];

      // Get processed transactions with showAll=true
      const processResponse = await apiCall(
        `/api/cost-tracking/${testCostId}/ynab-process?tempFileId=${tempFileId}&mappings=${encodeURIComponent(JSON.stringify(mappings))}&showAll=true`
      );

      expect(processResponse.ok).toBe(true);
      const processData = await processResponse.json();

      // Should return all transactions regardless of previous imports
      expect(processData.transactions).toHaveLength(3);
      expect(processData.filteredCount).toBe(0);
      expect(processData.lastImportedTransactionFound).toBe(false);
      expect(processData.totalTransactions).toBe(3);
    });
  });

  describe('Error handling', () => {
    it('should handle missing tempFileId parameter', async () => {
      const mappings = [
        {
          ynabCategory: 'Food',
          mappingType: 'country',
          countryName: 'TestCountry'
        }
      ];

      const processResponse = await apiCall(
        `/api/cost-tracking/${testCostId}/ynab-process?mappings=${encodeURIComponent(JSON.stringify(mappings))}`
      );

      expect(processResponse.ok).toBe(false);
      expect(processResponse.status).toBe(400);
    });

    it('should handle missing mappings parameter', async () => {
      const tempFileId = await createTempYnabFile(MOCK_YNAB_TRANSACTIONS);

      const processResponse = await apiCall(
        `/api/cost-tracking/${testCostId}/ynab-process?tempFileId=${tempFileId}`
      );

      expect(processResponse.ok).toBe(false);
      expect(processResponse.status).toBe(400);
    });

    it('should handle invalid tempFileId', async () => {
      const mappings = [
        {
          ynabCategory: 'Food',
          mappingType: 'country',
          countryName: 'TestCountry'
        }
      ];

      const processResponse = await apiCall(
        `/api/cost-tracking/${testCostId}/ynab-process?tempFileId=invalid&mappings=${encodeURIComponent(JSON.stringify(mappings))}`
      );

      expect(processResponse.ok).toBe(false);
      expect(processResponse.status).toBe(500);
    });
  });
});