export const formatMigrationLogSummary = (
  itemLabel: string,
  count: number
): string => `${count} ${itemLabel}${count === 1 ? '' : 's'}`;

export const logMigrationSummary = (
  message: string,
  itemLabel: string,
  count: number
): void => {
  if (count > 0) {
    console.log(`${message}: ${formatMigrationLogSummary(itemLabel, count)}`);
  }
};
