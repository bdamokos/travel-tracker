/**
 * Integration tests for YNAB import filtering functionality
 * Tests the remember last imported transaction feature
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { NextRequest } from 'next/server';
import { POST as ynabUploadPOST } from '../../api/cost-tracking/[id]/ynab-upload/route';
import { POST as ynabProcessPOST } from '../../api/cost-tracking/[id]/ynab-process/route';
import { updateTravelData, updateCostData, saveUnifiedTripData } from '../../lib/unifiedDataService';
import { getUnifiedTripFilePath, getTempYnabFilePath } from '../../lib/dataFilePaths';
import { CURRENT_SCHEMA_VERSION } from '../../lib/dataMigration';

jest.mock('../../lib/server-domains', () => ({
  isAdminDomain: jest.fn().mockResolvedValue(true)
}));

const DATA_DIR = join(process.cwd(), 'data');
const TEST_TRIP_ID = 'ynabfiltertrip';

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
  const tempFiles: string[] = [];

  const createJsonRequest = (endpoint: string, body: unknown) =>
    new NextRequest(`http://localhost${endpoint}`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json'
      }
    });

  const createTempYnabFile = async (transactions: typeof MOCK_YNAB_TRANSACTIONS) => {
    const tsvContent = [
      'Account\tFlag\tDate\tPayee\tCategory Group/Category\tCategory Group\tCategory\tMemo\tOutflow\tInflow\tCleared',
      ...transactions.map(t => `${t.Account}\t${t.Flag}\t${t.Date}\t${t.Payee}\t${t['Category Group/Category']}\t${t['Category Group']}\t${t.Category}\t${t.Memo}\t${t.Outflow}\t${t.Inflow}\t${t.Cleared}`)
    ].join('\n');

    const formData = new FormData();
    const blob = new Blob([tsvContent], { type: 'text/tab-separated-values' });
    formData.append('file', blob, 'test-transactions.tsv');

    const uploadRequest = new NextRequest(`http://localhost/api/cost-tracking/${TEST_TRIP_ID}/ynab-upload`, {
      method: 'POST',
      body: formData
    });
    const uploadResponse = await ynabUploadPOST(uploadRequest, { params: Promise.resolve({ id: TEST_TRIP_ID }) });

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed: ${uploadResponse.status}`);
    }

    const uploadData = await uploadResponse.json();
    tempFiles.push(uploadData.tempFileId);
    return uploadData.tempFileId;
  };

  beforeAll(async () => {
    await mkdir(DATA_DIR, { recursive: true });
    const now = new Date().toISOString();
    await saveUnifiedTripData({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id: TEST_TRIP_ID,
      title: TEST_TRAVEL_DATA.title,
      description: TEST_TRAVEL_DATA.description,
      startDate: TEST_TRAVEL_DATA.startDate,
      endDate: TEST_TRAVEL_DATA.endDate,
      createdAt: now,
      updatedAt: now
    });
    await updateTravelData(TEST_TRIP_ID, {
      ...TEST_TRAVEL_DATA,
      id: TEST_TRIP_ID
    });
    await updateCostData(TEST_TRIP_ID, {
      ...TEST_COST_DATA,
      tripId: TEST_TRIP_ID,
      id: TEST_TRIP_ID
    });
  });

  afterAll(async () => {
    const tripFile = getUnifiedTripFilePath(TEST_TRIP_ID);
    await rm(tripFile, { force: true });

    for (const tempFileId of tempFiles) {
      const tempPath = getTempYnabFilePath(tempFileId);
      await rm(tempPath, { force: true });
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
      const processRequest = createJsonRequest(`/api/cost-tracking/${TEST_TRIP_ID}/ynab-process`, {
        action: 'process',
        tempFileId: tempFileId,
        mappings: mappings
      });
      const processResponse = await ynabProcessPOST(processRequest, { params: Promise.resolve({ id: TEST_TRIP_ID }) });

      expect(processResponse.ok).toBe(true);
      const processData = await processResponse.json();

      // Should return all transactions since this is the first import
      expect(processData.transactions).toHaveLength(3);
      expect(processData.filteredCount).toBe(0);
      expect(processData.lastImportedTransactionFound).toBe(false);
      expect(processData.totalTransactions).toBe(3);

      // Import all transactions
      const selectedTransactions = processData.transactions.map((txn: { hash: string; instanceId?: string; sourceIndex?: number }) => ({
        transactionHash: txn.hash,
        transactionId: txn.instanceId,
        transactionSourceIndex: txn.sourceIndex,
        expenseCategory: 'Food'
      }));

      const importRequest = createJsonRequest(`/api/cost-tracking/${TEST_TRIP_ID}/ynab-process`, {
        action: 'import',
        tempFileId,
        mappings,
        selectedTransactions
      });
      const importResponse = await ynabProcessPOST(importRequest, { params: Promise.resolve({ id: TEST_TRIP_ID }) });

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
      const processRequest = createJsonRequest(`/api/cost-tracking/${TEST_TRIP_ID}/ynab-process`, {
        action: 'process',
        tempFileId: tempFileId,
        mappings: mappings
      });
      const processResponse = await ynabProcessPOST(processRequest, { params: Promise.resolve({ id: TEST_TRIP_ID }) });

      expect(processResponse.ok).toBe(true);
      const processData = await processResponse.json();

      // Should filter out previously imported transactions and only surface new ones
      expect(processData.transactions).toHaveLength(1);
      expect(processData.alreadyImportedCount).toBe(2);
      expect(processData.filteredCount).toBe(0);
      expect(processData.lastImportedTransactionFound).toBe(false);
      expect(processData.totalTransactions).toBe(1); // Total processed non-duplicate transactions
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
      const processRequest = createJsonRequest(`/api/cost-tracking/${TEST_TRIP_ID}/ynab-process`, {
        action: 'process',
        tempFileId: tempFileId,
        mappings: mappings,
        showAll: true
      });
      const processResponse = await ynabProcessPOST(processRequest, { params: Promise.resolve({ id: TEST_TRIP_ID }) });

      expect(processResponse.ok).toBe(true);
      const processData = await processResponse.json();

      // Should return only non-duplicate transactions even when bypassing last-import filtering
      expect(processData.transactions).toHaveLength(0);
      expect(processData.filteredCount).toBe(0);
      expect(processData.lastImportedTransactionFound).toBe(false);
      expect(processData.totalTransactions).toBe(0);
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

      const processRequest = createJsonRequest(`/api/cost-tracking/${TEST_TRIP_ID}/ynab-process`, {
        action: 'process',
        mappings: mappings
      });
      const processResponse = await ynabProcessPOST(processRequest, { params: Promise.resolve({ id: TEST_TRIP_ID }) });

      expect(processResponse.ok).toBe(false);
      expect(processResponse.status).toBe(400);
    });

    it('should handle missing mappings parameter', async () => {
      const tempFileId = await createTempYnabFile(MOCK_YNAB_TRANSACTIONS);

      const processRequest = createJsonRequest(`/api/cost-tracking/${TEST_TRIP_ID}/ynab-process`, {
        action: 'process',
        tempFileId: tempFileId
      });
      const processResponse = await ynabProcessPOST(processRequest, { params: Promise.resolve({ id: TEST_TRIP_ID }) });

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

      const processRequest = createJsonRequest(`/api/cost-tracking/${TEST_TRIP_ID}/ynab-process`, {
        action: 'process',
        tempFileId: 'invalid',
        mappings: mappings
      });
      const processResponse = await ynabProcessPOST(processRequest, { params: Promise.resolve({ id: TEST_TRIP_ID }) });

      expect(processResponse.ok).toBe(false);
      expect(processResponse.status).toBe(400);
    });
  });
});
