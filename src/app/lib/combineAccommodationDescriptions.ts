export function combineAccommodationDescriptions(
  accommodationNames: string[],
  legacyAccommodation?: string | null
): string[] {
  const combined = [...(accommodationNames || [])];

  const legacy = (legacyAccommodation || '').trim();
  if (legacy) {
    combined.push(legacy);
  }

  // Deduplicate while preserving order (case-insensitive)
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of combined) {
    const normalized = name.trim().toLowerCase();
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(name.trim());
  }

  return result;
}
