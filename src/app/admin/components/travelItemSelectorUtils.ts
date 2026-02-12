import { formatLocalDateInput } from '@/app/lib/localDateUtils';

type RouteDateSource = {
  date?: Date | string | null;
  departureTime?: string | null;
};

type RouteTransportTypeSource = {
  transportType?: string | null;
  type?: string | null;
};

function isNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function resolveTravelItemDate(source: RouteDateSource): string | undefined {
  const dateCandidates: Array<Date | string | null | undefined> = [source.date, source.departureTime];

  for (const candidate of dateCandidates) {
    if (candidate instanceof Date) {
      const formatted = formatLocalDateInput(candidate);
      if (formatted) {
        return formatted;
      }
      continue;
    }

    if (!isNonEmptyString(candidate)) {
      continue;
    }

    const formatted = formatLocalDateInput(candidate);
    if (formatted) {
      return formatted;
    }
  }

  return undefined;
}

export function resolveTravelItemTransportType(
  source: RouteTransportTypeSource,
  fallback = 'other'
): string {
  if (isNonEmptyString(source.transportType)) {
    return source.transportType;
  }

  if (isNonEmptyString(source.type)) {
    return source.type;
  }

  return fallback;
}
