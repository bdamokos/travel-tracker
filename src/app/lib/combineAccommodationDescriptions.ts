/**
 * Combine accommodation names from the new Accommodation entities with optional legacy
 * `Location.accommodationData`.
 *
 * - Preserves order
 * - Trims values
 * - Deduplicates case-insensitively
 */
export function combineAccommodationDescriptions(
  accommodationNames: unknown[],
  legacyAccommodation?: unknown
): string[] {
  const combined = accommodationNames.filter((name): name is string => typeof name === 'string');

  const legacy = typeof legacyAccommodation === 'string' ? legacyAccommodation.trim() : '';
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
