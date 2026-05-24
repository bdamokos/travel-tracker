import { NextRequest, NextResponse } from 'next/server';
import { YnabApiClient } from '@/app/lib/ynabApiClient';
import { YnabApiError } from '@/app/types';
import { PRIVATE_JSON_HEADERS } from '@/app/lib/ynabConfigSecurity';
import { requireAdminYnabConfig } from '@/app/lib/ynabServerConfig';

export async function GET() {
  return NextResponse.json(
    { error: 'Use POST for YNAB category sync' },
    { status: 405, headers: PRIVATE_JSON_HEADERS }
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { costTrackerId, serverKnowledge } = body;
    const configResult = await requireAdminYnabConfig(costTrackerId);
    if (configResult.response) {
      return configResult.response;
    }

    // Create YNAB API client
    const client = new YnabApiClient(configResult.config.apiKey!);

    try {
      // Get categories with optional delta sync
      const result = await client.getCategories(
        configResult.config.selectedBudgetId,
        serverKnowledge ? parseInt(serverKnowledge) : undefined
      );

      return NextResponse.json(
        {
          success: true,
          categories: result.categories.map(category => ({
            id: category.id,
            name: category.name,
            category_group_name: category.category_group_name,
            hidden: category.hidden,
            balance: YnabApiClient.convertMilliUnitsToCurrency(category.balance),
            budgeted: YnabApiClient.convertMilliUnitsToCurrency(category.budgeted),
            activity: YnabApiClient.convertMilliUnitsToCurrency(category.activity)
          })),
          serverKnowledge: result.serverKnowledge
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
    console.error('YNAB categories error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch YNAB categories',
        code: 'CATEGORIES_ERROR'
      },
      { status: 500, headers: PRIVATE_JSON_HEADERS }
    );
  }
}
