import { mkdirSync } from 'fs';
import { join, resolve } from 'path';

/**
 * Provides a central data directory that can be overridden for tests.
 * Uses TEST_DATA_DIR / TRAVEL_TRACKER_DATA_DIR / DATA_DIR when available to avoid
 * writing to the repository's real data folder during automated runs.
 */
let cachedDataDir: string | null = null;
let cachedEnvValue: string | null = null;

export function getDataDir(): string {
  const envValue =
    process.env.TEST_DATA_DIR ||
    process.env.TRAVEL_TRACKER_DATA_DIR ||
    process.env.DATA_DIR ||
    null;

  if (cachedDataDir && cachedEnvValue === envValue) {
    return cachedDataDir;
  }

  const dataDir = envValue ? resolve(envValue) : join(process.cwd(), 'data');
  mkdirSync(dataDir, { recursive: true });

  cachedDataDir = dataDir;
  cachedEnvValue = envValue;

  return dataDir;
}
