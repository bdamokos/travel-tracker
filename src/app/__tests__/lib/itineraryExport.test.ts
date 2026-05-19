import { describe, expect, it } from '@jest/globals';
import { formatLocationTimingForExport } from '@/app/lib/itineraryExport';

describe('formatLocationTimingForExport', () => {
  it('keeps non-redundant date-only arrival and departure values', () => {
    expect(formatLocationTimingForExport({
      arrivalTime: '2026-04-03',
      departureTime: '2026-04-06',
      startDay: '2026-04-02',
      endDay: '2026-04-05'
    })).toBe('arrive 2026-04-03 / depart 2026-04-06');
  });

  it('omits date-only values that only repeat the location range', () => {
    expect(formatLocationTimingForExport({
      arrivalTime: '2026-04-02',
      departureTime: '2026-04-05',
      startDay: '2026-04-02',
      endDay: '2026-04-05'
    })).toBe('');
  });

  it('keeps clock and timestamp values even when they fall on the location range dates', () => {
    expect(formatLocationTimingForExport({
      arrivalTime: '09:30',
      departureTime: '2026-04-05T18:45:00.000Z',
      startDay: '2026-04-02',
      endDay: '2026-04-05'
    })).toBe('arrive 09:30 / depart 2026-04-05T18:45:00.000Z');
  });
});
