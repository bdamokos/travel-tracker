// Allows ample decimal precision while bounding work on untrusted API input.
export const MAX_COORDINATE_LENGTH = 64;

const COORDINATE_PATTERN = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/;

export function parseCoordinate(value: string | null, min: number, max: number): number | null {
  if (value == null || value.length > MAX_COORDINATE_LENGTH) return null;
  if (value.trim() !== value || !COORDINATE_PATTERN.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}
