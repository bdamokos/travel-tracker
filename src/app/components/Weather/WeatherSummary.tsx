'use client';

import React from 'react';
import WeatherIcon from './WeatherIcon';
import { WeatherSummary as WeatherSummaryType } from '@/app/types/weather';

interface Props {
  summary: WeatherSummaryType;
}

export default function WeatherSummary({ summary }: Props) {
  if (!summary || !summary.dailyWeather || summary.dailyWeather.length === 0) {
    return null;
  }
  const todayISO = new Date().toISOString().slice(0, 10);
  // Limit the timeline strip to the actual stay window only
  const inRangeDays = summary.dailyWeather.filter(d => d.date >= summary.startDate && d.date <= summary.endDate);
  // Always show today's weather in the header corner, even if outside the stay: fall back to nearest day in range
  const headerDay = summary.dailyWeather.find(d => d.date === todayISO)
    || summary.dailyWeather.reduce((closest, d) => {
      const dist = Math.abs(new Date(d.date).getTime() - new Date().setHours(0,0,0,0));
      const best = closest ? Math.abs(new Date(closest.date).getTime() - new Date().setHours(0,0,0,0)) : Infinity;
      return dist < best ? d : closest;
    }, summary.dailyWeather[0]);
  const label = (() => {
    const sourceDays = inRangeDays.length > 0 ? inRangeDays : summary.dailyWeather;
    const hasHistAvg = sourceDays.some(d => d.dataSource === 'historical-average');
    const hasForecast = sourceDays.some(d => d.isForecast);
    const hasRecorded = sourceDays.some(d => d.isHistorical && d.dataSource !== 'historical-average');

    if (hasHistAvg && hasForecast && hasRecorded) return 'Recorded + Forecast + Hist. avg.';
    if (hasHistAvg && hasForecast) return 'Forecast + Hist. avg.';
    if (hasForecast && hasRecorded) return 'Recorded + Forecast';
    if (hasHistAvg && hasRecorded) return 'Recorded + Hist. avg.';
    if (hasHistAvg) return 'Hist. avg.';
    if (hasForecast) return 'Forecast';
    if (hasRecorded) return 'Recorded';
    return '';
  })();
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600 dark:text-gray-300">{`Weather${label ? ` · ${label}` : ''}`}</div>
        {headerDay && (
          <WeatherIcon
            icon={headerDay.conditions.icon}
            temperature={headerDay.temperature.average}
            label={`Today · ${todayISO} · ${headerDay.conditions.description}`}
            size="md"
          />
        )}
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400">
        Avg: {summary.summary.averageTemp ?? '—'}°, Precip: {summary.summary.totalPrecipitation ?? '—'}mm, {summary.summary.predominantCondition}
      </div>
      <div className="flex gap-2 overflow-x-auto py-1">
        {inRangeDays.map(d => (
          <div key={d.id} className="flex flex-col items-center min-w-10">
            <span className="text-[10px] text-gray-500">{d.date.slice(5)}</span>
            <WeatherIcon icon={d.conditions.icon} temperature={d.temperature.average} label={d.conditions.description} />
          </div>
        ))}
      </div>
    </div>
  );
}
