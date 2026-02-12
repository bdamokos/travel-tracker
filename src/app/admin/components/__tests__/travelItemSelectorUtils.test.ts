import {
  resolveTravelItemDate,
  resolveTravelItemTransportType
} from '@/app/admin/components/travelItemSelectorUtils';

describe('travelItemSelectorUtils', () => {
  describe('resolveTravelItemDate', () => {
    it('uses route date when present', () => {
      expect(resolveTravelItemDate({ date: '2026-02-08', departureTime: '2026-02-07T22:00:00.000Z' })).toBe(
        '2026-02-08'
      );
    });

    it('falls back to departureTime when date is missing', () => {
      expect(resolveTravelItemDate({ departureTime: '2026-02-07T22:00:00.000Z' })).toBe('2026-02-07');
    });

    it('falls back to departureTime when date is invalid', () => {
      expect(resolveTravelItemDate({ date: 'not-a-date', departureTime: '2026-02-07T22:00:00.000Z' })).toBe(
        '2026-02-07'
      );
    });

    it('returns undefined when no valid date source exists', () => {
      expect(resolveTravelItemDate({ date: 'not-a-date', departureTime: '' })).toBeUndefined();
    });
  });

  describe('resolveTravelItemTransportType', () => {
    it('prefers transportType over legacy type', () => {
      expect(resolveTravelItemTransportType({ transportType: 'plane', type: 'bus' })).toBe('plane');
    });

    it('uses legacy type when transportType is missing', () => {
      expect(resolveTravelItemTransportType({ type: 'train' })).toBe('train');
    });

    it('uses fallback when both type fields are missing', () => {
      expect(resolveTravelItemTransportType({}, 'unknown')).toBe('unknown');
    });
  });
});
