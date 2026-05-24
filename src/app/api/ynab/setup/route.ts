import { NextRequest, NextResponse } from 'next/server';
import { YnabApiClient } from '@/app/lib/ynabApiClient';
import { YnabBudget, YnabApiError } from '@/app/types';
import { isAdminDomain } from '@/app/lib/server-domains';
import { PRIVATE_JSON_HEADERS } from '@/app/lib/ynabConfigSecurity';

export async function POST(request: NextRequest) {
  try {
    const isAdmin = await isAdminDomain();
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403, headers: PRIVATE_JSON_HEADERS }
      );
    }

    const body = await request.json();
    const { apiKey, costTrackerId } = body;

    if (!apiKey || typeof apiKey !== 'string') {
      return NextResponse.json(
        { error: 'API key is required' },
        { status: 400, headers: PRIVATE_JSON_HEADERS }
      );
    }

    if (!costTrackerId || typeof costTrackerId !== 'string') {
      return NextResponse.json(
        { error: 'Cost tracker ID is required for data isolation' },
        { status: 400, headers: PRIVATE_JSON_HEADERS }
      );
    }

    // Create YNAB API client
    const client = new YnabApiClient(apiKey);

    try {
      // Validate API key and get budgets
      const budgets: YnabBudget[] = await client.getBudgets();

      return NextResponse.json(
        {
          success: true,
          budgets: budgets.map(budget => ({
            id: budget.id,
            name: budget.name,
            last_modified_on: budget.last_modified_on,
            first_month: budget.first_month,
            last_month: budget.last_month,
            currency_format: budget.currency_format
          }))
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

      if (error.id === '429') {
        return NextResponse.json(
          { 
            error: 'Rate limit exceeded. Please wait a moment and try again.',
            code: 'RATE_LIMIT'
          },
          { status: 429, headers: PRIVATE_JSON_HEADERS }
        );
      }

      if (error.id === '403') {
        return NextResponse.json(
          { 
            error: 'Access denied. Please check your YNAB subscription status.',
            code: 'ACCESS_DENIED'
          },
          { status: 403, headers: PRIVATE_JSON_HEADERS }
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
    console.error('YNAB setup error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to setup YNAB connection',
        code: 'SETUP_ERROR'
      },
      { status: 500, headers: PRIVATE_JSON_HEADERS }
    );
  }
}
