/**
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import WeatherSummary from '@/app/components/Weather/WeatherSummary';
import type { WeatherSummary as WeatherSummaryType } from '@/app/types/weather';

const buildLegacySummary = (dates: string[]): WeatherSummaryType => ({
  locationId: 'location-1',
  startDate: dates[0],
  endDate: dates[dates.length - 1],
  dailyWeather: dates.map(date => ({
    id: `weather-${date}`,
    date,
    coordinates: [47.5, 19] as [number, number],
    temperature: { min: 10, max: 20, average: 15 },
    precipitation: { total: 0, probability: null },
    wind: { speed: null, direction: null },
    conditions: { description: 'Clear', icon: 'sun', code: 0, cloudCover: null, humidity: null },
    fetchedAt: '2026-06-01T00:00:00.000Z',
  })) as WeatherSummaryType['dailyWeather'],
  summary: {
    averageTemp: 15,
    totalPrecipitation: 0,
    predominantCondition: 'Clear',
  },
});

describe('WeatherSummary', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('labels all-future legacy cached weather as historical averages', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-01T12:00:00.000Z'));

    render(<WeatherSummary summary={buildLegacySummary(['2027-06-01', '2027-06-02'])} />);

    expect(screen.getByText('Weather · Hist. avg.')).toBeInTheDocument();
  });

  it('labels past legacy cached weather as recorded instead of rendering a blank source label', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-01T12:00:00.000Z'));

    render(<WeatherSummary summary={buildLegacySummary(['2026-05-31', '2026-06-01'])} />);

    expect(screen.getByText('Weather · Recorded')).toBeInTheDocument();
  });
});
