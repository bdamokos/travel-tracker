import { dirname, join, resolve, sep } from 'path';
import { mkdirSync } from 'fs';
import { getDataDir } from './dataDirectory';

function ensureDirExists(targetPath: string): void {
  mkdirSync(targetPath, { recursive: true });
}

function resolveWithinDataDir(relativePath: string): string {
  const resolvedDataDir = resolve(getDataDir());
  const resolvedTarget = resolve(resolvedDataDir, relativePath);

  if (resolvedTarget === resolvedDataDir || !resolvedTarget.startsWith(resolvedDataDir + sep)) {
    throw new Error('Invalid path');
  }

  ensureDirExists(dirname(resolvedTarget));
  return resolvedTarget;
}

function assertSafeIdSegment(value: string, name: string, pattern: RegExp): void {
  if (typeof value !== 'string' || value.length === 0 || value.length > 200 || !pattern.test(value)) {
    throw new Error(`Invalid ${name}`);
  }
}

export function getUnifiedTripFilePath(tripId: string): string {
  assertSafeIdSegment(tripId, 'tripId', /^[A-Za-z0-9]+$/);
  return resolveWithinDataDir(`trip-${tripId}.json`);
}

export function getTempYnabFilePath(tempFileId: string): string {
  assertSafeIdSegment(tempFileId, 'tempFileId', /^temp-ynab-[A-Za-z0-9-]+$/);
  return resolveWithinDataDir(`${tempFileId}.json`);
}

export function getBackupFilePath(filename: string): string {
  assertSafeIdSegment(filename, 'backup filename', /^[A-Za-z0-9_.-]+$/);
  return resolveWithinDataDir(join('backups', filename));
}
