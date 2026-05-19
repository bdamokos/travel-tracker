export const normalizeRouteDurationDisplay = (duration: unknown): string => {
  if (duration === undefined || duration === null) {
    return '';
  }

  if (typeof duration === 'string') {
    return duration.trim();
  }

  if (typeof duration === 'number' || typeof duration === 'boolean') {
    return String(duration).trim();
  }

  return '';
};

export const summarizeSegmentDurations = (
  segments: Array<{ duration?: unknown }> | undefined
): string => {
  const durationParts = segments
    ?.map(segment => normalizeRouteDurationDisplay(segment.duration))
    .filter(Boolean);

  return durationParts?.join(' + ') || 'Set duration on each segment';
};
