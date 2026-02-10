import {
  formatLocalDateInput,
  formatLocalDateLabel,
  getLocalDateSortValue,
  getTodayLocalDay,
  parseDateAsLocalDay
} from '@/app/lib/localDateUtils';

describe('localDateUtils', () => {
  describe('parseDateAsLocalDay', () => {
    it('parses valid YYYY-MM-DD strings as local calendar days', () => {
      const parsed = parseDateAsLocalDay('2024-07-15');
      expect(parsed).not.toBeNull();
      expect(parsed?.getFullYear()).toBe(2024);
      expect(parsed?.getMonth()).toBe(6);
      expect(parsed?.getDate()).toBe(15);
      expect(parsed?.getHours()).toBe(0);
      expect(parsed?.getMinutes()).toBe(0);
      expect(parsed?.getSeconds()).toBe(0);
      expect(parsed?.getMilliseconds()).toBe(0);
    });

    it('rejects out-of-range YYYY-MM-DD values instead of rolling over', () => {
      expect(parseDateAsLocalDay('2024-13-01')).toBeNull();
      expect(parseDateAsLocalDay('2024-02-30')).toBeNull();
      expect(parseDateAsLocalDay('2024-00-10')).toBeNull();
      expect(parseDateAsLocalDay('2024-01-00')).toBeNull();
    });

    it('normalizes UTC-midnight dates to the same calendar day locally', () => {
      const fromDate = parseDateAsLocalDay(new Date(Date.UTC(2024, 6, 15)));
      const fromIso = parseDateAsLocalDay('2024-07-15T00:00:00.000Z');

      expect(fromDate).not.toBeNull();
      expect(fromIso).not.toBeNull();
      expect(fromDate?.getFullYear()).toBe(2024);
      expect(fromDate?.getMonth()).toBe(6);
      expect(fromDate?.getDate()).toBe(15);
      expect(fromIso?.getFullYear()).toBe(2024);
      expect(fromIso?.getMonth()).toBe(6);
      expect(fromIso?.getDate()).toBe(15);
    });

    it('preserves local calendar day for non-midnight timezone-aware timestamps', () => {
      const input = '2024-07-15T23:30:00-04:00';
      const expected = new Date(input);
      const parsed = parseDateAsLocalDay(input);

      expect(parsed).not.toBeNull();
      expect(parsed?.getFullYear()).toBe(expected.getFullYear());
      expect(parsed?.getMonth()).toBe(expected.getMonth());
      expect(parsed?.getDate()).toBe(expected.getDate());
      expect(parsed?.getHours()).toBe(0);
    });

    it('returns null for invalid or empty inputs', () => {
      expect(parseDateAsLocalDay(undefined)).toBeNull();
      expect(parseDateAsLocalDay(null)).toBeNull();
      expect(parseDateAsLocalDay('')).toBeNull();
      expect(parseDateAsLocalDay('   ')).toBeNull();
      expect(parseDateAsLocalDay('invalid-date')).toBeNull();
      expect(parseDateAsLocalDay(new Date(NaN))).toBeNull();
    });
  });

  describe('formatLocalDateInput', () => {
    it('formats parseable values as YYYY-MM-DD', () => {
      expect(formatLocalDateInput('2024-07-15T00:00:00.000Z')).toBe('2024-07-15');
      expect(formatLocalDateInput(new Date(2024, 6, 15))).toBe('2024-07-15');
    });

    it('returns an empty string for invalid inputs', () => {
      expect(formatLocalDateInput(undefined)).toBe('');
      expect(formatLocalDateInput('invalid-date')).toBe('');
      expect(formatLocalDateInput(new Date(NaN))).toBe('');
    });
  });

  describe('getLocalDateSortValue', () => {
    it('returns local-day timestamps for valid values', () => {
      const parsed = parseDateAsLocalDay('2024-01-02');
      expect(parsed).not.toBeNull();
      expect(getLocalDateSortValue('2024-01-02')).toBe(parsed?.getTime());
    });

    it('returns Number.MAX_SAFE_INTEGER for invalid values', () => {
      expect(getLocalDateSortValue(undefined)).toBe(Number.MAX_SAFE_INTEGER);
      expect(getLocalDateSortValue('invalid-date')).toBe(Number.MAX_SAFE_INTEGER);
    });
  });

  describe('formatLocalDateLabel', () => {
    it('formats dates using local-day semantics', () => {
      const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit' };
      const parsed = parseDateAsLocalDay('2024-07-15T00:00:00.000Z');
      expect(parsed).not.toBeNull();
      const expected = parsed?.toLocaleDateString('en-US', options);

      expect(formatLocalDateLabel('2024-07-15T00:00:00.000Z', 'en-US', options)).toBe(expected);
    });

    it('returns "Invalid Date" for invalid values', () => {
      expect(formatLocalDateLabel('invalid-date')).toBe('Invalid Date');
      expect(formatLocalDateLabel(undefined)).toBe('Invalid Date');
    });
  });

  describe('getTodayLocalDay', () => {
    beforeAll(() => {
      jest.useFakeTimers();
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    it('returns today with the time zeroed in local time', () => {
      const fixedNow = new Date('2026-02-10T15:42:11.555Z');
      jest.setSystemTime(fixedNow);

      const today = getTodayLocalDay();
      const now = new Date();

      expect(today.getFullYear()).toBe(now.getFullYear());
      expect(today.getMonth()).toBe(now.getMonth());
      expect(today.getDate()).toBe(now.getDate());
      expect(today.getHours()).toBe(0);
      expect(today.getMinutes()).toBe(0);
      expect(today.getSeconds()).toBe(0);
      expect(today.getMilliseconds()).toBe(0);
    });
  });
});
