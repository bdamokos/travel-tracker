import { combineAccommodationDescriptions } from '@/app/lib/combineAccommodationDescriptions';

describe('combineAccommodationDescriptions', () => {
  it('returns names unchanged when there is no legacy accommodation', () => {
    expect(combineAccommodationDescriptions(['A', 'B'], undefined)).toEqual(['A', 'B']);
  });

  it('adds legacy accommodation when provided', () => {
    expect(combineAccommodationDescriptions(['A'], 'Legacy place')).toEqual(['A', 'Legacy place']);
  });

  it('deduplicates case-insensitively while preserving order', () => {
    expect(combineAccommodationDescriptions(['Hostel', 'Hotel'], 'hostel')).toEqual(['Hostel', 'Hotel']);
  });

  it('trims and ignores empty values', () => {
    expect(combineAccommodationDescriptions(['  A  ', ''], '   ')).toEqual(['A']);
  });
});
