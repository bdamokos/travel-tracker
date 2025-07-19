import { NextRequest, NextResponse } from 'next/server';
import { YnabApiClient, ynabUtils } from '../../../lib/ynabApiClient';
import { YnabApiError, ProcessedYnabTransaction, CategoryMapping } from '../../../types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const apiKey = searchParams.get('apiKey');
    const budgetId = searchParams.get('budgetId');
    const mappedCategoryIds = searchParams.get('categoryIds');
    const sinceDate = searchParams.get('sinceDate');
    const serverKnowledge = searchParams.get('serverKnowledge');

    if (!apiKey || typeof apiKey !== 'string') {
      return NextResponse.json(
        { error: 'API key is required' },
        { status: 400 }
      );
    }

    if (!budgetId || typeof budgetId !== 'string') {
      return NextResponse.json(
        { error: 'Budget ID is required' },
        { status: 400 }
      );
    }

    if (!mappedCategoryIds) {
      return NextResponse.json(
        { error: 'Category IDs are required' },
        { status: 400 }
      );
    }

    // Parse category IDs from comma-separated string
    const categoryIds = mappedCategoryIds.split(',').filter(id => id.trim());

    if (categoryIds.length === 0) {
      return NextResponse.json({
        success: true,
        transactions: [],
        serverKnowledge: 0,
        message: 'No categories mapped for transaction retrieval'
      });
    }

    // Create YNAB API client
    const client = new YnabApiClient(apiKey);

    try {
      // Get transactions filtered by mapped category IDs
      const result = await client.getTransactions(
        budgetId,
        categoryIds,
        sinceDate || undefined,
        serverKnowledge ? parseInt(serverKnowledge) : undefined
      );

      // Convert YNAB transactions to ProcessedYnabTransaction format
      const processedTransactions: ProcessedYnabTransaction[] = result.transactions.map(txn => {
        const amount = Math.abs(ynabUtils.milliunitsToAmount(txn.amount));
        const isOutflow = txn.amount < 0;

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
          mappedCountry: '', // Will be determined by category mapping
          isGeneralExpense: false, // Will be determined by category mapping
          hash: ynabUtils.generateTransactionHash(txn),
          expenseType: 'actual'
        };
      });

      return NextResponse.json({
        success: true,
        transactions: processedTransactions,
        serverKnowledge: result.serverKnowledge,
        totalCount: processedTransactions.length
      });

    } catch (ynabError) {
      const error = ynabError as YnabApiError;
      
      // Handle specific YNAB API errors
      if (error.id === '401') {
        return NextResponse.json(
          { 
            error: 'Invalid API key. Please check your YNAB Personal Access Token.',
            code: 'INVALID_API_KEY'
          },
          { status: 401 }
        );
      }

      if (error.id === '404') {
        return NextResponse.json(
          { 
            error: 'Budget not found. Please check the budget ID.',
            code: 'BUDGET_NOT_FOUND'
          },
          { status: 404 }
        );
      }

      if (error.id === '429') {
        return NextResponse.json(
          { 
            error: 'Rate limit exceeded. Please wait a moment and try again.',
            code: 'RATE_LIMIT'
          },
          { status: 429 }
        );
      }

      // Generic YNAB API error
      return NextResponse.json(
        { 
          error: `YNAB API Error: ${error.detail}`,
          code: 'YNAB_API_ERROR'
        },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('YNAB transactions error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch YNAB transactions',
        code: 'TRANSACTIONS_ERROR'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      apiKey, 
      budgetId, 
      categoryMappings, 
      sinceDate,
      serverKnowledge 
    } = body;

    if (!apiKey || typeof apiKey !== 'string') {
      return NextResponse.json(
        { error: 'API key is required' },
        { status: 400 }
      );
    }

    if (!budgetId || typeof budgetId !== 'string') {
      return NextResponse.json(
        { error: 'Budget ID is required' },
        { status: 400 }
      );
    }

    if (!categoryMappings || !Array.isArray(categoryMappings)) {
      return NextResponse.json(
        { error: 'Category mappings are required' },
        { status: 400 }
      );
    }

    // Extract category IDs from mappings that are not 'none'
    const mappedCategoryIds = categoryMappings
      .filter((mapping: CategoryMapping) => 
        mapping.mappingType !== 'none' && mapping.ynabCategoryId
      )
      .map((mapping: CategoryMapping) => mapping.ynabCategoryId!);

    if (mappedCategoryIds.length === 0) {
      return NextResponse.json({
        success: true,
        transactions: [],
        serverKnowledge: serverKnowledge || 0,
        message: 'No categories mapped for transaction retrieval. Please use "YNAB Category Mappings" to map categories first, then save the mappings before importing transactions.'
      });
    }

    // Create YNAB API client
    const client = new YnabApiClient(apiKey);

    try {
      // Get transactions using efficient category-specific API calls with delta sync
      const result = await client.getTransactionsByCategories(
        budgetId,
        mappedCategoryIds,
        sinceDate || undefined,
        serverKnowledge || undefined
      );

      // Create a lookup map for category mappings
      const categoryMappingLookup = new Map();
      categoryMappings.forEach((mapping: CategoryMapping) => {
        if (mapping.ynabCategoryId) {
          categoryMappingLookup.set(mapping.ynabCategoryId, mapping);
        }
      });

      // Convert YNAB transactions to ProcessedYnabTransaction format with country mapping
      const processedTransactions: ProcessedYnabTransaction[] = result.transactions.map(txn => {
        const amount = Math.abs(ynabUtils.milliunitsToAmount(txn.amount));
        const isOutflow = txn.amount < 0;
        
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
          hash: ynabUtils.generateTransactionHash(txn),
          expenseType: 'actual'
        };
      });

      return NextResponse.json({
        success: true,
        transactions: processedTransactions,
        serverKnowledge: result.serverKnowledge,
        totalCount: processedTransactions.length
      });

    } catch (ynabError) {
      const error = ynabError as YnabApiError;
      
      // Handle specific YNAB API errors
      if (error.id === '401') {
        return NextResponse.json(
          { 
            error: 'Invalid API key. Please check your YNAB Personal Access Token.',
            code: 'INVALID_API_KEY'
          },
          { status: 401 }
        );
      }

      if (error.id === '404') {
        return NextResponse.json(
          { 
            error: 'Budget not found. Please check the budget ID.',
            code: 'BUDGET_NOT_FOUND'
          },
          { status: 404 }
        );
      }

      if (error.id === '429') {
        return NextResponse.json(
          { 
            error: 'Rate limit exceeded. Please wait a moment and try again.',
            code: 'RATE_LIMIT'
          },
          { status: 429 }
        );
      }

      // Generic YNAB API error
      return NextResponse.json(
        { 
          error: `YNAB API Error: ${error.detail}`,
          code: 'YNAB_API_ERROR'
        },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('YNAB transactions POST error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process YNAB transaction request',
        code: 'TRANSACTIONS_POST_ERROR'
      },
      { status: 500 }
    );
  }
}