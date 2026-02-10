import { calculateDurationInDays, calculateNights } from '@/app/lib/durationUtils';

describe('durationUtils', () => {
  describe('calculateDurationInDays', () => {
    it('returns inclusive local-day duration for date-only strings', () => {
      expect(calculateDurationInDays('2026-03-25', '2026-03-30')).toBe(6);
    });

    it('returns 1 for the same day', () => {
      expect(calculateDurationInDays('2026-03-25', '2026-03-25')).toBe(1);
    });

    it('returns 0 when end date is before start date', () => {
      expect(calculateDurationInDays('2026-03-30', '2026-03-25')).toBe(0);
    });

    it('returns 0 for invalid values', () => {
      expect(calculateDurationInDays('invalid-date', '2026-03-25')).toBe(0);
      expect(calculateDurationInDays('2026-03-25', 'invalid-date')).toBe(0);
    });
  });

  describe('calculateNights', () => {
    it('returns local-day night counts', () => {
      expect(calculateNights('2026-03-25', '2026-03-30')).toBe(5);
      expect(calculateNights('2026-03-25', '2026-03-25')).toBe(0);
    });

    it('returns 0 for reversed or invalid values', () => {
      expect(calculateNights('2026-03-30', '2026-03-25')).toBe(0);
      expect(calculateNights('invalid-date', '2026-03-25')).toBe(0);
    });
  });
});
