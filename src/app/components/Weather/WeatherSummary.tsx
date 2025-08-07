'use client';

import React from 'react';
import WeatherIcon from './WeatherIcon';
import { WeatherSummary as WeatherSummaryType } from '@/app/types/weather';

interface Props {
  summary: WeatherSummaryType;
}

export default function WeatherSummary({ summary }: Props) {
  const todayISO = new Date().toISOString().slice(0, 10);
  const today = summary.dailyWeather.find(d => d.date === todayISO) || summary.dailyWeather[0];
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600 dark:text-gray-300">Weather</div>
        {today && (
          <WeatherIcon icon={today.conditions.icon} temperature={today.temperature.average} label={today.conditions.description} size="md" />
        )}
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400">
        Avg: {summary.summary.averageTemp ?? '—'}°, Precip: {summary.summary.totalPrecipitation ?? '—'}mm, {summary.summary.predominantCondition}
      </div>
      <div className="flex gap-2 overflow-x-auto py-1">
        {summary.dailyWeather.slice(0, 7).map(d => (
          <div key={d.id} className="flex flex-col items-center min-w-10">
            <span className="text-[10px] text-gray-500">{d.date.slice(5)}</span>
            <WeatherIcon icon={d.conditions.icon} temperature={d.temperature.average} label={d.conditions.description} />
          </div>
        ))}
      </div>
    </div>
  );
}

