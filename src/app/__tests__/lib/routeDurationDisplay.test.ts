import {
  normalizeRouteDurationDisplay,
  summarizeSegmentDurations
} from '@/app/lib/routeDurationDisplay';

describe('routeDurationDisplay', () => {
  it('trims string durations', () => {
    expect(normalizeRouteDurationDisplay(' 2h 30m ')).toBe('2h 30m');
  });

  it('formats scalar malformed durations defensively', () => {
    expect(normalizeRouteDurationDisplay(45)).toBe('45');
    expect(normalizeRouteDurationDisplay(true)).toBe('true');
  });

  it('drops object-like malformed durations without throwing', () => {
    expect(normalizeRouteDurationDisplay({ value: '45m' })).toBe('');
    expect(normalizeRouteDurationDisplay(null)).toBe('');
  });

  it('summarizes segment durations while ignoring unsupported values', () => {
    expect(summarizeSegmentDurations([
      { duration: ' 1h ' },
      { duration: 30 },
      { duration: { value: 'bad' } },
      {}
    ])).toBe('1h + 30');
  });

  it('returns fallback text when no displayable segment durations exist', () => {
    expect(summarizeSegmentDurations([{ duration: ' ' }, { duration: null }])).toBe('Set duration on each segment');
  });
});
