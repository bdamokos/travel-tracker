export type Coordinates = [number, number];

export interface WeatherData {
  id: string;
  locationId?: string;
  date: string; // ISO date (YYYY-MM-DD)
  coordinates: Coordinates;
  temperature: { min: number | null; max: number | null; average: number | null };
  precipitation: { total: number | null; probability: number | null };
  wind: { speed: number | null; direction: number | null };
  conditions: { description: string; icon: string; code: number | null; cloudCover: number | null; humidity: number | null };
  isHistorical: boolean;
  isForecast: boolean;
  dataSource: 'open-meteo' | 'cache' | 'historical-average';
  fetchedAt: string; // ISO Date
  expiresAt?: string; // ISO Date
}

export interface WeatherSummary {
  locationId?: string;
  startDate: string; // ISO date
  endDate: string;   // ISO date
  dailyWeather: WeatherData[];
  summary: { averageTemp: number | null; totalPrecipitation: number | null; predominantCondition: string };
}

export interface WeatherAPIResponse {
  success: boolean;
  data?: WeatherSummary;
  error?: string;
  cached?: boolean;
}

