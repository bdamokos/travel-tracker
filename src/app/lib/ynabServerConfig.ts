import { NextResponse } from 'next/server';
import { isAdminDomain } from '@/app/lib/server-domains';
import { loadUnifiedTripData } from '@/app/lib/unifiedDataService';
import { PRIVATE_JSON_HEADERS } from '@/app/lib/ynabConfigSecurity';
import type { YnabConfig } from '@/app/types';

type StoredYnabConfigResult =
  | { config: YnabConfig; response?: never }
  | { config?: never; response: NextResponse };

export async function requireAdminYnabConfig(costTrackerId: unknown): Promise<StoredYnabConfigResult> {
  const isAdmin = await isAdminDomain();
  if (!isAdmin) {
    return {
      response: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403, headers: PRIVATE_JSON_HEADERS }
      )
    };
  }

  if (!costTrackerId || typeof costTrackerId !== 'string') {
    return {
      response: NextResponse.json(
        { error: 'Cost tracker ID is required' },
        { status: 400, headers: PRIVATE_JSON_HEADERS }
      )
    };
  }

  const cleanId = costTrackerId.replace(/^(cost-)+/, '');
  const unifiedData = await loadUnifiedTripData(cleanId);
  const config = unifiedData?.costData?.ynabConfig;
  if (!config?.apiKey || !config.selectedBudgetId) {
    return {
      response: NextResponse.json(
        { error: 'YNAB API configuration not found' },
        { status: 404, headers: PRIVATE_JSON_HEADERS }
      )
    };
  }

  return { config };
}
