import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { 
  YnabCategoryMapping, 
  ProcessedYnabTransaction, 
  YnabTransaction,
  Expense,
  BudgetItem,
  ExpenseType
} from '@/app/types';
import { createTransactionHash } from '@/app/lib/ynabUtils';
import { cleanupTempFile, cleanupOldTempFiles } from '@/app/lib/ynabServerUtils';
import { isAdminDomain } from '@/app/lib/server-domains';
import { loadUnifiedTripData, updateCostData } from '@/app/lib/unifiedDataService';

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

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Check if request is from admin domain
    const isAdmin = await isAdminDomain();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    const { id } = await params;
    const body = await request.json();
    const { tempFileId, mappings, selectedTransactions } = body;

    if (!tempFileId || !mappings || !selectedTransactions) {
      return NextResponse.json({ 
        error: 'Missing required data: tempFileId, mappings, or selectedTransactions' 
      }, { status: 400 });
    }

    // Load the temporary file
    const tempFilePath = join(process.cwd(), 'data', `${tempFileId}.json`);
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
        importedTransactionHashes: []
      };
    }

    // Update category mappings
    costData.ynabImportData.mappings = mappings as YnabCategoryMapping[];

    // Process selected transactions
    const newExpenses: Expense[] = [];
    const newHashes: string[] = [];

    for (const selectedTxn of selectedTransactions) {
      const { transactionHash, expenseCategory } = selectedTxn;
      
      // Check if already imported
      if (costData.ynabImportData.importedTransactionHashes.includes(transactionHash)) {
        continue;
      }

      // Find the original transaction
      const originalTxn = tempData.transactions.find((t: YnabTransaction) => 
        createTransactionHash(t) === transactionHash
      );

      if (!originalTxn) {
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

      // Convert to our expense format
      const expense: Expense = {
        id: `ynab-${transactionHash}`,
        date: originalTxn.Date,
        amount: amount,
        currency: costData.currency,
        category: expenseCategory,
        country: mapping.mappingType === 'general' ? 'General' : (mapping.countryName || 'General'),
        description: originalTxn.Payee,
        notes: originalTxn.Memo,
        isGeneralExpense: mapping.mappingType === 'general',
        expenseType: 'actual' as ExpenseType // YNAB imports are always actual expenses
      };

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
      newHashes.push(transactionHash);
    }

    // Add new expenses to cost data
    costData.expenses.push(...newExpenses);
    costData.ynabImportData.importedTransactionHashes.push(...newHashes);
    // updatedAt is handled in the unified trip object, not here

    // Save updated cost tracking data using unifiedDataService
    await updateCostData(id.replace(/^cost-/, ''), {
      overallBudget: costData.overallBudget,
      currency: costData.currency,
      countryBudgets: costData.countryBudgets,
      expenses: costData.expenses,
      ynabImportData: costData.ynabImportData,
      tripTitle: unifiedTrip.title,
      tripStartDate: unifiedTrip.startDate,
      tripEndDate: unifiedTrip.endDate,
      ...(hasCustomCategories(costData) ? { customCategories: (costData as { customCategories: string[] }).customCategories } : {}),
      createdAt: unifiedTrip.createdAt,
      updatedAt: new Date().toISOString()
    });

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

  } catch (error) {
    console.error('Error processing YNAB import:', error);
    return NextResponse.json({ 
      error: 'Failed to process YNAB import' 
    }, { status: 500 });
  }
}

// GET endpoint to retrieve processed transactions for review
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Check if request is from admin domain
    const isAdmin = await isAdminDomain();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    const { id } = await params;
    const url = new URL(request.url);
    const tempFileId = url.searchParams.get('tempFileId');
    const mappingsParam = url.searchParams.get('mappings');

    if (!tempFileId) {
      return NextResponse.json({ 
        error: 'Missing tempFileId parameter' 
      }, { status: 400 });
    }

    if (!mappingsParam) {
      return NextResponse.json({ 
        error: 'Category mappings must be configured before processing transactions. Please go back and set up your category mappings first.' 
      }, { status: 400 });
    }

    const mappings: YnabCategoryMapping[] = JSON.parse(decodeURIComponent(mappingsParam));

    // Load the temporary file
    const tempFilePath = join(process.cwd(), 'data', `${tempFileId}.json`);
    const tempFileContent = await readFile(tempFilePath, 'utf-8');
    const tempData = JSON.parse(tempFileContent);

    // Load existing cost tracking data to check for duplicates using unifiedDataService
    const unifiedTrip = await loadUnifiedTripData(id.replace(/^cost-/, ''));
    if (!unifiedTrip || !unifiedTrip.costData) {
      return NextResponse.json({ error: 'Cost tracking data not found' }, { status: 404 });
    }
    const costData = unifiedTrip.costData;

    const existingHashes = costData.ynabImportData?.importedTransactionHashes || [];

    // Process transactions based on mappings
    const processedTransactions: ProcessedYnabTransaction[] = [];
    const mappedCategories = new Set(mappings.map(m => m.ynabCategory));

    for (const transaction of tempData.transactions) {
      if (!mappedCategories.has(transaction.Category)) {
        continue; // Skip unmapped categories
      }

      const hash = createTransactionHash(transaction);
      const isAlreadyImported = existingHashes.includes(hash);

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
        date: transaction.Date,
        description: transaction.Payee,
        memo: transaction.Memo,
        mappedCountry: mapping.mappingType === 'general' ? '' : (mapping.countryName || ''),
        isGeneralExpense: mapping.mappingType === 'general',
        hash: hash
      };

      // Only include if not already imported
      if (!isAlreadyImported) {
        processedTransactions.push(processedTxn);
      }
    }

    if (processedTransactions.length === 0) {
      return NextResponse.json({
        transactions: [],
        totalCount: 0,
        alreadyImportedCount: tempData.transactions.length,
        message: 'No transactions available for import. This may be because all categories are mapped to "None" or all transactions have already been imported.'
      });
    }

    return NextResponse.json({
      transactions: processedTransactions,
      totalCount: processedTransactions.length,
      alreadyImportedCount: tempData.transactions.length - processedTransactions.length
    });

  } catch (error) {
    console.error('Error getting processed transactions:', error);
    return NextResponse.json({ 
      error: 'Failed to get processed transactions' 
    }, { status: 500 });
  }
} 