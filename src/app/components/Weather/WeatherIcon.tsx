'use client';

interface WeatherIconProps {
  icon: string; // emoji or short icon text
  temperature?: number | null; // average or current
  label?: string;
  size?: 'sm' | 'md';
}

export default function WeatherIcon({ icon, temperature, label, size = 'sm' }: WeatherIconProps) {
  const iconSize = size === 'sm' ? 'text-base' : 'text-xl';
  return (
    <div className="inline-flex items-center gap-1" aria-label={label} title={label}>
      <span className={iconSize}>{icon}</span>
      {typeof temperature === 'number' && (
        <span className="text-xs font-medium">{Math.round(temperature)}°</span>
      )}
    </div>
  );
}
