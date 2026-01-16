import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { 
  YnabCategoryMapping, 
  ProcessedYnabTransaction, 
  YnabTransaction,
  Expense,
  BudgetItem,
  ExpenseType,
  YnabTransactionFilterResult
} from '@/app/types';
import { createTransactionHash, filterNewTransactions, getTransactionImportKey, updateLastImportedTransaction } from '@/app/lib/ynabUtils';
import { convertYnabDateToISO } from '@/app/lib/ynabUtils';
import { cleanupTempFile, cleanupOldTempFiles } from '@/app/lib/ynabServerUtils';
import { isAdminDomain } from '@/app/lib/server-domains';
import { createExpenseLinkingService } from '@/app/lib/expenseLinkingService';
import { loadUnifiedTripData, updateCostData } from '@/app/lib/unifiedDataService';
import { validateAllTripBoundaries } from '@/app/lib/tripBoundaryValidation';
import { getTempYnabFilePath } from '@/app/lib/dataFilePaths';
import { buildTravelReference } from '@/app/lib/travelLinkUtils';
import type { TravelLinkInfo } from '@/app/lib/expenseTravelLookup';

// Type guard for customCategories
function hasCustomCategories(obj: unknown): obj is { customCategories: string[] } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'customCategories' in obj &&
    Array.isArray((obj as { customCategories?: unknown }).customCategories) &&
    (obj as { customCategories: unknown[] }).customCategories.every(cat => typeof cat === 'string')
  );
}

function isValidTempFileId(tempFileId: unknown): tempFileId is string {
  return (
    typeof tempFileId === 'string' &&
    tempFileId.length > 0 &&
    /^[A-Za-z0-9_-]+$/.test(tempFileId)
  );
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Check if request is from admin domain
    const isAdmin = await isAdminDomain();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    const { id } = await params;
    const body = await request.json();
    const { action, tempFileId, mappings, selectedTransactions, showAll } = body;

    // Handle different actions
    if (action === 'process') {
      return await handleProcessTransactions(id, tempFileId, mappings, showAll);
    } else if (action === 'import') {
      return await handleImportTransactions(id, tempFileId, mappings, selectedTransactions);
    } else {
      // Legacy support - if no action specified, assume import
      return await handleImportTransactions(id, tempFileId, mappings, selectedTransactions);
    }
  } catch (error) {
    console.error('Error in YNAB process:', error);
    return NextResponse.json({ 
      error: 'Failed to process YNAB request' 
    }, { status: 500 });
  }
}

/**
 * Prepare a preview of YNAB transactions from a temporary upload, applying category mappings and duplicate filtering.
 *
 * Loads the temporary transaction file and the trip's cost-tracking data, maps eligible transactions using `mappings`,
 * computes amounts and instance identifiers, excludes already-imported items, and applies optional filtering based on
 * the last imported transaction unless `showAll` is true.
 *
 * @param id - The cost-tracking identifier or trip id (may include a 'cost-' prefix)
 * @param tempFileId - Identifier of the temporary JSON file containing uploaded YNAB transactions (data/{tempFileId}.json)
 * @param mappings - Category mapping definitions that determine which uploaded categories are eligible and how they map
 * @param showAll - If true, skip filtering by the last imported transaction and return all processed transactions
 * @returns A NextResponse with JSON payload:
 * - On success (200): an object containing `transactions` (array of processed transactions), `totalCount`, 
 *   `alreadyImportedCount` (count of duplicate/already-imported transactions in the upload),
 *   `filteredCount` (count of transactions excluded by chronological filtering), 
 *   `lastImportedTransactionFound` (boolean indicating if the last imported transaction appears in current upload), 
 *   and `totalTransactions` (total uploaded transactions matching category mappings).
 * - If no new transactions are available (200): same shape with `transactions: []` and a `message` explaining why.
 * - If `tempFileId` or `mappings` are missing (400): `{ error: string }`.
 * - If cost-tracking data is not found for `id` (404): `{ error: string }`.
 */
async function handleProcessTransactions(
  id: string, 
  tempFileId: string, 
  mappings: YnabCategoryMapping[], 
  showAll: boolean = false
): Promise<NextResponse> {
  if (!tempFileId || !mappings) {
    return NextResponse.json({ 
      error: 'Missing required data: tempFileId and mappings are required for processing' 
    }, { status: 400 });
  }

  if (!isValidTempFileId(tempFileId)) {
    return NextResponse.json(
      { error: 'Invalid tempFileId format' },
      { status: 400 }
    );
  }

  // Load the temporary file
  let tempFilePath: string;
  try {
    tempFilePath = getTempYnabFilePath(tempFileId);
  } catch {
    return NextResponse.json({ error: 'Invalid tempFileId' }, { status: 400 });
  }

  const tempFileContent = await readFile(tempFilePath, 'utf-8');
  const tempData = JSON.parse(tempFileContent);

  // Load existing cost tracking data to check for duplicates using unifiedDataService
  const unifiedTrip = await loadUnifiedTripData(id.replace(/^cost-/, ''));
  if (!unifiedTrip || !unifiedTrip.costData) {
    return NextResponse.json({ error: 'Cost tracking data not found' }, { status: 404 });
  }
  const costData = unifiedTrip.costData;

  const existingHashes = costData.ynabImportData?.importedTransactionHashes || [];
  const existingBaseHashes = new Set(
    existingHashes
      .map((value: string) => value.match(/^([0-9a-f]{64})(?:-\d+)?$/i)?.[1])
      .filter((value: string | undefined): value is string => Boolean(value))
  );
  const lastImportedHash = costData.ynabImportData?.lastImportedTransactionHash;

  // Process transactions based on mappings
  const processedTransactions: ProcessedYnabTransaction[] = [];
  const uniqueTransactions: ProcessedYnabTransaction[] = [];
  let alreadyImportedCount = 0;
  const mappedCategories = new Set(mappings.map(m => m.ynabCategory));

  for (const [index, transaction] of tempData.transactions.entries()) {
    if (!mappedCategories.has(transaction.Category)) {
      continue; // Skip unmapped categories
    }

    const hash = createTransactionHash(transaction);
    const instanceId = `${hash}-${index}`;
    const isAlreadyImported = existingHashes.includes(instanceId) || existingBaseHashes.has(hash);

    const mapping = mappings.find(m => m.ynabCategory === transaction.Category);
    if (!mapping || mapping.mappingType === 'none') continue; // Skip 'none' mappings

    // Calculate amount - handle both outflows and inflows
    let amount = 0;
    const outflowStr = transaction.Outflow.replace('€', '').replace(',', '.');
    const inflowStr = transaction.Inflow.replace('€', '').replace(',', '.');
    
    if (outflowStr && parseFloat(outflowStr) > 0) {
      // Positive amount for outflows (expenses)
      amount = parseFloat(outflowStr);
    } else if (inflowStr && parseFloat(inflowStr) > 0) {
      // Negative amount for inflows (refunds)
      amount = -parseFloat(inflowStr);
    }

    const processedTxn: ProcessedYnabTransaction = {
      originalTransaction: transaction,
      amount: amount,
      date: convertYnabDateToISO(transaction.Date),
      description: transaction.Payee,
      memo: transaction.Memo,
      mappedCountry: mapping.mappingType === 'general' ? '' : (mapping.countryName || ''),
      isGeneralExpense: mapping.mappingType === 'general',
      hash: hash,
      instanceId,
      sourceIndex: index
    };

    processedTransactions.push(processedTxn);

    // Only include if not already imported
    if (!isAlreadyImported) {
      uniqueTransactions.push(processedTxn);
    } else {
      alreadyImportedCount += 1;
    }
  }

  // Filter transactions if not showing all
  let filteredResult: YnabTransactionFilterResult;
  // `filteredCount` tracks the total transactions not returned (already-imported + chronologically filtered).
  let filteredCount = alreadyImportedCount;
  // Check whether the last imported transaction appears in the current upload (including already-imported ones).
  // We use `processedTransactions` (not `uniqueTransactions`) because duplicates are removed from `uniqueTransactions`.
  const lastImportedTransactionFound = lastImportedHash
    ? processedTransactions.some(txn => txn.hash === lastImportedHash)
    : false;

  if (showAll) {
    // When showing all, do not apply chronological filtering; return everything we processed.
    filteredCount = 0;
    filteredResult = {
      newTransactions: processedTransactions,
      filteredCount: 0,
      lastTransactionFound: false
    };
  } else if (lastImportedHash) {
    // Apply chronological filtering to `uniqueTransactions` (hash-based filtering already removed previously imported items).
    filteredResult = filterNewTransactions(uniqueTransactions, lastImportedHash);
    filteredCount += filteredResult.filteredCount;
  } else {
    filteredResult = {
      newTransactions: uniqueTransactions,
      filteredCount: 0,
      lastTransactionFound: false
    };
  }

  if (filteredResult.newTransactions.length === 0) {
    return NextResponse.json({
      transactions: [],
      totalCount: 0,
      alreadyImportedCount,
      filteredCount,
      lastImportedTransactionFound: showAll ? false : lastImportedTransactionFound || filteredResult.lastTransactionFound,
      totalTransactions: processedTransactions.length,
      message: 'No transactions available for import. This may be because all categories are mapped to "None" or all transactions have already been imported.'
    });
  }

  return NextResponse.json({
    transactions: filteredResult.newTransactions,
    totalCount: filteredResult.newTransactions.length,
    alreadyImportedCount,
    filteredCount,
    lastImportedTransactionFound: showAll ? false : lastImportedTransactionFound || filteredResult.lastTransactionFound,
    totalTransactions: processedTransactions.length
  });
}

/**
 * Import selected YNAB transactions into the trip's cost data, create corresponding expenses, and persist updates.
 *
 * Updates the trip's ynabImportData (mappings, imported transaction keys, payee defaults), appends new Expense entries,
 * optionally auto-creates country budgets, updates import timestamps on the YNAB config, validates trip boundaries,
 * and removes temporary import files.
 *
 * @param id - Trip identifier (may include a `cost-` prefix; the prefix is stripped for persistence)
 * @param tempFileId - Identifier of the temporary JSON file containing parsed YNAB transactions
 * @param mappings - Array of category mappings used to map YNAB categories to trip expense categories
 * @param selectedTransactions - Array of selections specifying which transactions to import. Each entry must include:
 *   - `transactionHash` (string): hash of the source transaction,
 *   - `transactionId?` (string): optional instance identifier to distinguish duplicate hashes,
 *   - `transactionSourceIndex?` (number): optional index into the temp file's transactions to resolve the original record,
 *   - `expenseCategory` (string): target expense category to use for the created Expense
 *
 * @returns JSON with import results: `success` (boolean), `importedCount` (number of expenses added),
 * `skippedCount` (number of selections skipped), and `totalExpenses` (total expense count after import).
 */
async function handleImportTransactions(
  id: string, 
  tempFileId: string, 
  mappings: YnabCategoryMapping[], 
  selectedTransactions: Array<{
    transactionHash: string;
    transactionId?: string;
    transactionSourceIndex?: number;
    expenseCategory: string;
    travelLinkInfo?: TravelLinkInfo;
  }>
): Promise<NextResponse> {
  if (!tempFileId || !mappings || !selectedTransactions) {
    return NextResponse.json({ 
      error: 'Missing required data: tempFileId, mappings, or selectedTransactions' 
    }, { status: 400 });
  }

  // Load the temporary file
  let tempFilePath: string;
  try {
    tempFilePath = getTempYnabFilePath(tempFileId);
  } catch {
    return NextResponse.json({ error: 'Invalid tempFileId' }, { status: 400 });
  }

  const tempFileContent = await readFile(tempFilePath, 'utf-8');
  const tempData = JSON.parse(tempFileContent);

  // Load existing cost tracking data using unifiedDataService
  const unifiedTrip = await loadUnifiedTripData(id.replace(/^cost-/, ''));
  if (!unifiedTrip || !unifiedTrip.costData) {
    return NextResponse.json({ error: 'Cost tracking data not found' }, { status: 404 });
  }
  const costData = unifiedTrip.costData;

  // Initialize YNAB import data if not exists
  if (!costData.ynabImportData) {
    costData.ynabImportData = {
      mappings: [],
      importedTransactionHashes: [],
      payeeCategoryDefaults: {}
    };
  } else if (!costData.ynabImportData.payeeCategoryDefaults) {
    costData.ynabImportData.payeeCategoryDefaults = {};
  }

  // Update category mappings
  costData.ynabImportData.mappings = mappings as YnabCategoryMapping[];

  // Process selected transactions
  const newExpenses: Expense[] = [];
  const importedTransactions: ProcessedYnabTransaction[] = [];
  const usedIndexes = new Set<number>();
  const importedTrackingKeys = costData.ynabImportData.importedTransactionHashes ?? [];
  const importedKeySet = new Set(importedTrackingKeys);
  const importedBaseHashSet = new Set(
    importedTrackingKeys
      .map((value: string) => value.match(/^([0-9a-f]{64})(?:-\d+)?$/i)?.[1])
      .filter((value: string | undefined): value is string => Boolean(value))
  );
  const newKeySet = new Set<string>();
  const newBaseHashSet = new Set<string>();
  const linkOperations: Array<{ expenseId: string; travelLinkInfo: TravelLinkInfo }> = [];

  for (const selectedTxn of selectedTransactions) {
    const { transactionHash, transactionId, transactionSourceIndex, expenseCategory, travelLinkInfo } = selectedTxn;
    const targetIndex = typeof transactionSourceIndex === 'number' ? transactionSourceIndex : undefined;

    if (
      importedBaseHashSet.has(transactionHash) ||
      newBaseHashSet.has(transactionHash) ||
      (transactionId ? importedKeySet.has(transactionId) || newKeySet.has(transactionId) : false)
    ) {
      continue;
    }

    // Find the original transaction
    let originalTxn: YnabTransaction | undefined;
    let sourceIndex: number | undefined = undefined;

    if (targetIndex !== undefined && tempData.transactions[targetIndex]) {
      originalTxn = tempData.transactions[targetIndex];
      sourceIndex = targetIndex;
    } else {
      const foundIndex = tempData.transactions.findIndex((t: YnabTransaction, idx: number) => {
        if (usedIndexes.has(idx)) return false;
        return createTransactionHash(t) === transactionHash;
      });

      if (foundIndex !== -1) {
        originalTxn = tempData.transactions[foundIndex];
        sourceIndex = foundIndex;
      }
    }

    if (originalTxn === undefined) {
      continue;
    }

    const importKey = getTransactionImportKey({
      hash: transactionHash,
      instanceId: transactionId,
      sourceIndex
    });

    if (importedKeySet.has(importKey) || newKeySet.has(importKey)) {
      continue;
    }

    // Find the mapping for this transaction's category
    const mapping = mappings.find((m: YnabCategoryMapping) => 
      m.ynabCategory === originalTxn.Category
    );

    if (!mapping || mapping.mappingType === 'none') {
      continue; // Skip 'none' mappings
    }

    // Calculate amount - handle both outflows and inflows
    let amount = 0;
    const outflowStr = originalTxn.Outflow.replace('€', '').replace(',', '.');
    const inflowStr = originalTxn.Inflow.replace('€', '').replace(',', '.');
    
    if (outflowStr && parseFloat(outflowStr) > 0) {
      // Positive amount for outflows (expenses)
      amount = parseFloat(outflowStr);
    } else if (inflowStr && parseFloat(inflowStr) > 0) {
      // Negative amount for inflows (refunds)
      amount = -parseFloat(inflowStr);
    }

    // Create ProcessedYnabTransaction for tracking
    const processedTxn: ProcessedYnabTransaction = {
      originalTransaction: originalTxn,
      amount: amount,
      date: convertYnabDateToISO(originalTxn.Date),
      description: originalTxn.Payee,
      memo: originalTxn.Memo,
      mappedCountry: mapping.mappingType === 'general' ? '' : (mapping.countryName || ''),
      isGeneralExpense: mapping.mappingType === 'general',
      hash: transactionHash,
      instanceId: transactionId,
      sourceIndex
    };

    // Convert to our expense format
    const travelReference = buildTravelReference(travelLinkInfo);
    const expense: Expense = {
      id: `ynab-${importKey}`,
      date: new Date(convertYnabDateToISO(originalTxn.Date)),
      amount: amount,
      currency: costData.currency,
      category: expenseCategory,
      country: mapping.mappingType === 'general' ? 'General' : (mapping.countryName || 'General'),
      description: originalTxn.Payee,
      notes: originalTxn.Memo,
      isGeneralExpense: mapping.mappingType === 'general',
      expenseType: 'actual' as ExpenseType, // YNAB imports are always actual expenses
      source: 'ynab-file',
      hash: transactionHash,
      ...(travelReference ? { travelReference } : {})
    };

    const normalizedPayee = originalTxn.Payee?.trim();
    if (normalizedPayee) {
      const payeeDefaults = costData.ynabImportData.payeeCategoryDefaults ?? {};
      costData.ynabImportData.payeeCategoryDefaults = payeeDefaults;
      payeeDefaults[normalizedPayee] = expenseCategory;
    }

    // Auto-create country budget if it doesn't exist
    if (mapping.mappingType === 'country' && mapping.countryName) {
      const existingBudget = costData.countryBudgets.find(b => b.country === mapping.countryName);
      if (!existingBudget) {
        const newBudget: BudgetItem = {
          id: `budget-${mapping.countryName}-${Date.now()}`,
          country: mapping.countryName,
          amount: undefined, // Auto-created budgets have undefined amounts
          currency: costData.currency,
          notes: 'Auto-created from YNAB import'
        };
        costData.countryBudgets.push(newBudget);
      }
    }

    newExpenses.push(expense);
    importedTransactions.push(processedTxn);
    newKeySet.add(importKey);
    newBaseHashSet.add(transactionHash);
    if (travelLinkInfo) {
      linkOperations.push({ expenseId: expense.id, travelLinkInfo });
    }
    if (sourceIndex !== undefined) {
      usedIndexes.add(sourceIndex);
    }
  }

  // Remove any pending YNAB shadow transactions before importing new ones
  costData.expenses = costData.expenses.filter(expense => !expense.isPendingYnabImport);

  // Add new expenses to cost data
  costData.expenses.push(...newExpenses);
  
  // Update last imported transaction tracking
  if (importedTransactions.length > 0) {
    costData.ynabImportData = updateLastImportedTransaction(
      importedTransactions,
      costData.ynabImportData
    );
  }
  // updatedAt is handled in the unified trip object, not here

  // Save updated cost tracking data using unifiedDataService
  const updatedUnifiedData = await updateCostData(id.replace(/^cost-/, ''), {
    overallBudget: costData.overallBudget,
    currency: costData.currency,
    countryBudgets: costData.countryBudgets,
    expenses: costData.expenses,
    ynabImportData: costData.ynabImportData,
    ynabConfig: costData.ynabConfig
      ? {
          ...costData.ynabConfig,
          lastTransactionImport: new Date(),
          lastAutomaticTransactionSync: new Date()
        }
      : undefined,
    tripTitle: unifiedTrip.title,
    tripStartDate: unifiedTrip.startDate,
    tripEndDate: unifiedTrip.endDate,
    ...(hasCustomCategories(costData) ? { customCategories: (costData as { customCategories: string[] }).customCategories } : {}),
    createdAt: unifiedTrip.createdAt,
    updatedAt: new Date().toISOString()
  });

  // Validate trip boundaries after YNAB import
  const validation = validateAllTripBoundaries(updatedUnifiedData);
  if (!validation.isValid) {
    console.warn(`Trip boundary violations detected after YNAB import in trip ${id}:`, validation.errors);
    // Log warnings but don't fail the import - this is for monitoring
  }

  if (linkOperations.length > 0) {
    try {
      const linkingService = createExpenseLinkingService(id.replace(/^cost-/, ''));
      await linkingService.applyLinkOperations(
        linkOperations.map(operation => ({
          type: 'add' as const,
          expenseId: operation.expenseId,
          travelLinkInfo: operation.travelLinkInfo
        }))
      );
    } catch (error) {
      console.error('Failed to link imported expenses to travel items:', error);
    }
  }

  // Clean up temporary file
  await cleanupTempFile(tempFileId);
  
  // Clean up old temp files (older than 2 hours)
  await cleanupOldTempFiles(2);

  return NextResponse.json({
    success: true,
    importedCount: newExpenses.length,
    skippedCount: selectedTransactions.length - newExpenses.length,
    totalExpenses: costData.expenses.length
  });
}

// GET endpoint for simple queries (no mappings required)
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Check if request is from admin domain
    const isAdmin = await isAdminDomain();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    const { id } = await params;
    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    if (action === 'status') {
      // Simple status check endpoint
      const unifiedTrip = await loadUnifiedTripData(id.replace(/^cost-/, ''));
      if (!unifiedTrip || !unifiedTrip.costData) {
        return NextResponse.json({ error: 'Cost tracking data not found' }, { status: 404 });
      }

      const lastImportedHash = unifiedTrip.costData.ynabImportData?.lastImportedTransactionHash;
      const lastImportedDate = unifiedTrip.costData.ynabImportData?.lastImportedTransactionDate;
      
      return NextResponse.json({
        hasLastImport: !!lastImportedHash,
        lastImportedTransactionHash: lastImportedHash,
        lastImportedTransactionDate: lastImportedDate
      });
    }

    return NextResponse.json({ 
      error: 'Invalid action parameter. Use action=status for status checks.' 
    }, { status: 400 });

  } catch (error) {
    console.error('Error getting YNAB process status:', error);
    return NextResponse.json({ 
      error: 'Failed to get YNAB process status' 
    }, { status: 500 });
  }
} 
