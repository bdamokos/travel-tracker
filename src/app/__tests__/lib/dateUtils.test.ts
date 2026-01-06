import { findClosestLocationToCurrentDate, getLocationTemporalStatus, LocationWithDate } from '@/app/lib/dateUtils';

describe('findClosestLocationToCurrentDate', () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.setSystemTime(0);
  });

  it('prefers the most recent active stay for overlapping day trips', () => {
    jest.setSystemTime(new Date('2024-06-05T12:00:00Z'));

    const base: LocationWithDate = {
      id: 'base',
      date: '2024-06-01T00:00:00Z',
      endDate: '2024-06-10T00:00:00Z'
    };

    const dayTrip: LocationWithDate = {
      id: 'day-trip',
      date: '2024-06-05T00:00:00Z',
      endDate: '2024-06-06T00:00:00Z'
    };

    const result = findClosestLocationToCurrentDate([base, dayTrip]);
    expect(result?.id).toBe('day-trip');
  });

  it('falls back to the active base stay once the side trip has ended', () => {
    jest.setSystemTime(new Date('2024-06-07T12:00:00Z'));

    const base: LocationWithDate = {
      id: 'base',
      date: '2024-06-01T00:00:00Z',
      endDate: '2024-06-10T00:00:00Z'
    };

    const dayTrip: LocationWithDate = {
      id: 'day-trip',
      date: '2024-06-05T00:00:00Z',
      endDate: '2024-06-06T00:00:00Z'
    };

    const result = findClosestLocationToCurrentDate([base, dayTrip]);
    expect(result?.id).toBe('base');
  });

  it('selects the earliest upcoming stay when all are in the future', () => {
    jest.setSystemTime(new Date('2024-05-01T12:00:00Z'));

    const futureA: LocationWithDate = {
      id: 'future-a',
      date: '2024-05-10T00:00:00Z',
      endDate: '2024-05-12T00:00:00Z'
    };

    const futureB: LocationWithDate = {
      id: 'future-b',
      date: '2024-05-07T00:00:00Z',
      endDate: '2024-05-09T00:00:00Z'
    };

    const result = findClosestLocationToCurrentDate([futureA, futureB]);
    expect(result?.id).toBe('future-b');
  });

  it('selects the stay that ended most recently when all are in the past', () => {
    jest.setSystemTime(new Date('2024-06-20T12:00:00Z'));

    const pastA: LocationWithDate = {
      id: 'past-a',
      date: '2024-06-10T00:00:00Z',
      endDate: '2024-06-11T00:00:00Z'
    };

    const pastB: LocationWithDate = {
      id: 'past-b',
      date: '2024-06-12T00:00:00Z',
      endDate: '2024-06-15T00:00:00Z'
    };

    const result = findClosestLocationToCurrentDate([pastA, pastB]);
    expect(result?.id).toBe('past-b');
  });
});

describe('getLocationTemporalStatus', () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.setSystemTime(0);
  });

  it('returns present when today falls inside the stay range', () => {
    jest.setSystemTime(new Date('2025-01-15T12:00:00Z'));

    const status = getLocationTemporalStatus({
      id: 'range',
      date: '2025-01-14T00:00:00Z',
      endDate: '2025-01-16T00:00:00Z'
    });

    expect(status).toBe('present');
  });

  it('returns future when the stay has not started yet', () => {
    jest.setSystemTime(new Date('2025-01-10T12:00:00Z'));

    const status = getLocationTemporalStatus({
      id: 'upcoming',
      date: '2025-01-20T00:00:00Z'
    });

    expect(status).toBe('future');
  });

  it('returns past when the stay has already ended', () => {
    jest.setSystemTime(new Date('2025-02-01T12:00:00Z'));

    const status = getLocationTemporalStatus({
      id: 'previous',
      date: '2025-01-10T00:00:00Z',
      endDate: '2025-01-12T00:00:00Z'
    });

    expect(status).toBe('past');
  });
});
