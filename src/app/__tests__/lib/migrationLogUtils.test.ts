import { formatMigrationLogSummary } from '@/app/lib/migrationLogUtils';

describe('migrationLogUtils', () => {
  it('formats singular migration summaries', () => {
    expect(formatMigrationLogSummary('accommodation', 1)).toBe('1 accommodation');
  });

  it('formats plural migration summaries', () => {
    expect(formatMigrationLogSummary('invalid expense link', 2)).toBe('2 invalid expense links');
  });
});
