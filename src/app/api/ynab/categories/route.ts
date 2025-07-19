import { NextRequest, NextResponse } from 'next/server';
import { YnabApiClient } from '../../../lib/ynabApiClient';
import { YnabApiError } from '../../../types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const apiKey = searchParams.get('apiKey');
    const budgetId = searchParams.get('budgetId');
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

    // Create YNAB API client
    const client = new YnabApiClient(apiKey);

    try {
      // Get categories with optional delta sync
      const result = await client.getCategories(
        budgetId,
        serverKnowledge ? parseInt(serverKnowledge) : undefined
      );

      return NextResponse.json({
        success: true,
        categories: result.categories.map(category => ({
          id: category.id,
          name: category.name,
          categoryGroupName: category.category_group_name,
          hidden: category.hidden,
          balance: YnabApiClient.convertMilliUnitsToCurrency(category.balance),
          budgeted: YnabApiClient.convertMilliUnitsToCurrency(category.budgeted),
          activity: YnabApiClient.convertMilliUnitsToCurrency(category.activity)
        })),
        serverKnowledge: result.serverKnowledge
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
    console.error('YNAB categories error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch YNAB categories',
        code: 'CATEGORIES_ERROR'
      },
      { status: 500 }
    );
  }
}