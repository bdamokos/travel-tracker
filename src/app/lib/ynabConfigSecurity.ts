import type { YnabConfig } from '@/app/types';

export const PRIVATE_JSON_HEADERS = {
  'Cache-Control': 'no-store'
};

export function redactYnabConfig(config?: YnabConfig): YnabConfig | undefined {
  if (!config) {
    return undefined;
  }

  const safeConfig = { ...config };
  delete safeConfig.apiKey;
  return {
    ...safeConfig,
    hasApiKey: Boolean(config.apiKey || config.hasApiKey)
  };
}

export function mergeYnabConfigForStorage(
  incoming?: YnabConfig,
  existing?: YnabConfig
): YnabConfig | undefined {
  if (!incoming) {
    return existing;
  }

  const merged: YnabConfig = {
    ...existing,
    ...incoming,
    apiKey: incoming.apiKey || existing?.apiKey
  };

  delete merged.hasApiKey;
  return merged;
}
