import { NextRequest, NextResponse } from 'next/server';
import { YnabApiClient, ynabUtils } from '@/app/lib/ynabApiClient';
import { YnabApiError, ProcessedYnabTransaction, CategoryMapping } from '@/app/types';
import { PRIVATE_JSON_HEADERS } from '@/app/lib/ynabConfigSecurity';
import { requireAdminYnabConfig } from '@/app/lib/ynabServerConfig';

const MAX_TRANSACTION_CATEGORY_IDS = 25;

const normalizeMappedCategory = (mapping: unknown): CategoryMapping | null => {
  if (!mapping || typeof mapping !== 'object') {
    return null;
  }

  const candidate = mapping as Partial<CategoryMapping>;
  if (typeof candidate.mappingType !== 'string' || candidate.mappingType === 'none') {
    return null;
  }
  if (typeof candidate.ynabCategoryId !== 'string') {
    return null;
  }

  const ynabCategoryId = candidate.ynabCategoryId.trim();
  if (ynabCategoryId.length === 0) {
    return null;
  }

  return {
    ...candidate,
    ynabCategoryId,
    mappingType: candidate.mappingType
  } as CategoryMapping;
};

/**
 * Retrieve YNAB transactions filtered by mapped category IDs and return them in ProcessedYnabTransaction format.
 *
 * The response JSON contains `success`, `transactions` (array of processed transactions), `serverKnowledge`, and `totalCount` on success.
 * On client errors returns 400 when required query parameters are missing; on YNAB API errors returns appropriate status and error code:
 * 401 with code `INVALID_API_KEY`, 404 with code `BUDGET_NOT_FOUND`, 429 with code `RATE_LIMIT`, or 500 with code `YNAB_API_ERROR`.
 *
 * @returns A NextResponse whose JSON body on success includes:
 * - `success`: `true`
 * - `transactions`: `ProcessedYnabTransaction[]` (each transaction includes `originalTransaction`, `amount`, `date`, `description`, `memo`, `mappedCountry`, `isGeneralExpense`, `hash`, `instanceId`, `sourceIndex`, `expenseType`, `ynabTransactionId`, `importId`)
 * - `serverKnowledge`: number
 * - `totalCount`: number
 *
 * On error the JSON body includes `error` (message) and `code` (error identifier).
 */
export async function GET() {
  return NextResponse.json(
    { error: 'Use POST for YNAB transaction sync' },
    { status: 405, headers: PRIVATE_JSON_HEADERS }
  );
}

/**
 * Handle POST requests to fetch YNAB transactions for mapped categories and return them in a processed import-ready format.
 *
 * @param request - Incoming NextRequest whose JSON body must include `costTrackerId` (string) and `categoryMappings` (array). Optional body fields: `sinceDate` and `serverKnowledge`.
 * @returns On success, a JSON object containing:
 * - `success`: `true`
 * - `transactions`: an array of processed transactions where each item includes `originalTransaction`, `amount`, `date`, `description`, `memo`, `mappedCountry`, `isGeneralExpense`, `hash`, `instanceId`, `sourceIndex`, `expenseType`, `ynabTransactionId`, and `importId`.
 * - `serverKnowledge`: the YNAB delta sync cursor (number)
 * - `totalCount`: number of returned transactions
 *
 * On error, a JSON object containing `error` (message) and `code` is returned with an appropriate HTTP status.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      costTrackerId,
      categoryMappings, 
      sinceDate,
      serverKnowledge 
    } = body;

    const configResult = await requireAdminYnabConfig(costTrackerId);
    if (configResult.response) {
      return configResult.response;
    }

    if (!categoryMappings || !Array.isArray(categoryMappings)) {
      return NextResponse.json(
        { error: 'Category mappings are required' },
        { status: 400, headers: PRIVATE_JSON_HEADERS }
      );
    }

    const normalizedCategoryMappings = categoryMappings
      .map(normalizeMappedCategory)
      .filter((mapping): mapping is CategoryMapping => mapping !== null);

    // Extract category IDs from mappings that are not 'none'
    const mappedCategoryIds = Array.from(new Set(
      normalizedCategoryMappings.map(mapping => mapping.ynabCategoryId!)
    ));

    if (mappedCategoryIds.length > MAX_TRANSACTION_CATEGORY_IDS) {
      return NextResponse.json(
        { error: `Cannot sync more than ${MAX_TRANSACTION_CATEGORY_IDS} YNAB categories at once` },
        { status: 400, headers: PRIVATE_JSON_HEADERS }
      );
    }

    if (mappedCategoryIds.length === 0) {
      return NextResponse.json({
        success: true,
        transactions: [],
        serverKnowledge: serverKnowledge || 0,
        message: 'No categories mapped for transaction retrieval. Please use "YNAB Category Mappings" to map categories first, then save the mappings before importing transactions.'
      }, { headers: PRIVATE_JSON_HEADERS });
    }

    // Create YNAB API client
    const client = new YnabApiClient(configResult.config.apiKey!);

    try {
      // Get transactions using efficient category-specific API calls with delta sync
      const result = await client.getTransactionsByCategories(
        configResult.config.selectedBudgetId,
        mappedCategoryIds,
        sinceDate || undefined,
        serverKnowledge || undefined
      );
      const expandedTransactions = ynabUtils.flattenTransactions(result.transactions);

      // Create a lookup map for category mappings
      const categoryMappingLookup = new Map();
      normalizedCategoryMappings.forEach((mapping: CategoryMapping) => {
        categoryMappingLookup.set(mapping.ynabCategoryId, mapping);
      });

      // Convert YNAB transactions to ProcessedYnabTransaction format with country mapping
      const processedTransactions: ProcessedYnabTransaction[] = expandedTransactions.map((txn, index) => {
        const amount = Math.abs(ynabUtils.milliunitsToAmount(txn.amount));
        const isOutflow = txn.amount < 0;
        const hash = ynabUtils.generateTransactionHash(txn);
        
        // Find the mapping for this transaction's category
        const mapping = categoryMappingLookup.get(txn.category_id);
        const isGeneralExpense = mapping?.mappingType === 'general';
        const mappedCountry = mapping?.countryName || '';

        return {
          originalTransaction: {
            Account: txn.account_name || '',
            Flag: txn.flag_name || '',
            Date: txn.date,
            Payee: txn.payee_name || '',
            'Category Group/Category': txn.category_name || '',
            'Category Group': '', // Not directly available in API response
            Category: txn.category_name || '',
            Memo: txn.memo || '',
            Outflow: isOutflow ? amount.toString() : '',
            Inflow: !isOutflow ? amount.toString() : '',
            Cleared: txn.cleared
          },
          amount: isOutflow ? amount : -amount, // Expenses are positive, income is negative
          date: txn.date,
          description: txn.payee_name || 'Unknown Payee',
          memo: txn.memo || '',
          mappedCountry,
          isGeneralExpense,
          hash,
          instanceId: txn.id || `${hash}-${index}`,
          sourceIndex: index,
          expenseType: 'actual',
          ynabTransactionId: txn.id,
          importId: txn.import_id
        };
      });

      return NextResponse.json(
        {
          success: true,
          transactions: processedTransactions,
          serverKnowledge: result.serverKnowledge,
          totalCount: processedTransactions.length
        },
        { headers: PRIVATE_JSON_HEADERS }
      );

    } catch (ynabError) {
      const error = ynabError as YnabApiError;
      
      // Handle specific YNAB API errors
      if (error.id === '401') {
        return NextResponse.json(
          { 
            error: 'Invalid API key. Please check your YNAB Personal Access Token.',
            code: 'INVALID_API_KEY'
          },
          { status: 401, headers: PRIVATE_JSON_HEADERS }
        );
      }

      if (error.id === '404') {
        return NextResponse.json(
          { 
            error: 'Budget not found. Please check the budget ID.',
            code: 'BUDGET_NOT_FOUND'
          },
          { status: 404, headers: PRIVATE_JSON_HEADERS }
        );
      }

      if (error.id === '429') {
        return NextResponse.json(
          { 
            error: 'Rate limit exceeded. Please wait a moment and try again.',
            code: 'RATE_LIMIT'
          },
          { status: 429, headers: PRIVATE_JSON_HEADERS }
        );
      }

      // Generic YNAB API error
      return NextResponse.json(
        { 
          error: `YNAB API Error: ${error.detail}`,
          code: 'YNAB_API_ERROR'
        },
        { status: 500, headers: PRIVATE_JSON_HEADERS }
      );
    }

  } catch (error) {
    console.error('YNAB transactions POST error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process YNAB transaction request',
        code: 'TRANSACTIONS_POST_ERROR'
      },
      { status: 500, headers: PRIVATE_JSON_HEADERS }
    );
  }
}
