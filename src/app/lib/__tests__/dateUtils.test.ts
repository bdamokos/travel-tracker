import { coerceValidDate, formatUtcDate, formatDateRange, normalizeUtcDateToLocalDay } from '@/app/lib/dateUtils';

describe('dateUtils UTC helpers', () => {
  describe('formatUtcDate', () => {
    it('keeps the calendar day when formatting UTC midnight dates', () => {
      const iso = '2024-01-02T00:00:00.000Z';
      expect(formatUtcDate(iso, 'en-US')).toBe('1/2/2024');
      expect(formatUtcDate(iso, 'en-GB')).toBe('02/01/2024');
      const defaultLocale = formatUtcDate(iso);
      const expectedDefault = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC' }).format(new Date(iso));
      expect(defaultLocale).toBe(expectedDefault);
    });

    it('returns empty string for invalid dates', () => {
      expect(formatUtcDate('invalid-date')).toBe('');
      expect(formatUtcDate(undefined)).toBe('');
    });
  });

  describe('normalizeUtcDateToLocalDay', () => {
    it('returns local midnight for the same calendar day', () => {
      const normalized = normalizeUtcDateToLocalDay('2024-07-15T00:00:00.000Z');
      expect(normalized).not.toBeNull();
      expect(normalized?.getHours()).toBe(0);
      expect(normalized?.getFullYear()).toBe(2024);
      expect(normalized?.getMonth()).toBe(6);
      expect(normalized?.getDate()).toBe(15);
    });

    it('returns null for invalid dates', () => {
      expect(normalizeUtcDateToLocalDay('not-a-date')).toBeNull();
    });
  });

  describe('coerceValidDate', () => {
    it('returns a cloned Date for valid Date values', () => {
      const source = new Date('2024-07-15T00:00:00.000Z');
      const result = coerceValidDate(source);
      expect(result).not.toBeNull();
      expect(result).not.toBe(source);
      expect(result?.toISOString()).toBe(source.toISOString());
    });

    it('returns a Date for valid string values and null for invalid values', () => {
      expect(coerceValidDate('2024-07-15T00:00:00.000Z')?.toISOString()).toBe('2024-07-15T00:00:00.000Z');
      expect(coerceValidDate('not-a-date')).toBeNull();
      expect(coerceValidDate(undefined)).toBeNull();
    });
  });

  describe('formatDateRange', () => {
    it('formats a single-day range without duplication', () => {
      const iso = '2024-03-10T00:00:00.000Z';
      const single = formatDateRange(iso, iso);
      expect(single).toBe(formatUtcDate(iso));
    });

    it('formats multi-day ranges correctly', () => {
      const start = '2024-03-10T00:00:00.000Z';
      const end = '2024-03-12T00:00:00.000Z';
      const range = formatDateRange(start, end);
      expect(range).toBe(`${formatUtcDate(start)} - ${formatUtcDate(end)}`);
    });
  });
});
