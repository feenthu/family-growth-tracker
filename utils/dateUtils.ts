// All date math is performed in the user's local timezone.
// For consistent results, this app assumes the user's system is set to 'America/New_York' as per requirements.

/**
 * Clamps the day to the last valid day of the given month and year.
 * e.g., normalizeDueDate(2025, 2, 31) -> Feb 28, 2025
 * e.g., normalizeDueDate(2025, 4, 31) -> Apr 30, 2025
 * @param year Full year
 * @param month1to12 Month (1-12)
 * @param day1to31 Day (1-31)
 * @returns A Date object for the normalized date.
 */
export function normalizeDueDate(year: number, month1to12: number, day1to31: number): Date {
  // Get the last day of the given month by getting day 0 of the next month.
  const lastDayOfMonth = new Date(year, month1to12, 0).getDate();
  const day = Math.min(day1to31, lastDayOfMonth);
  // Month in Date constructor is 0-indexed.
  return new Date(year, month1to12 - 1, day);
}

/**
 * Returns a new Date object set to the beginning of the day (00:00:00.000).
 */
export function startOfDay(date: Date): Date {
  const newDate = new Date(date);
  newDate.setHours(0, 0, 0, 0);
  return newDate;
}

/**
 * Returns a new Date object set to the end of the day (23:59:59.999).
 */
export function endOfDay(date: Date): Date {
  const newDate = new Date(date);
  newDate.setHours(23, 59, 59, 999);
  return newDate;
}

/**
 * Returns a new Date object set to the last moment of the month of the given date.
 */
export function getMonthEnd(date: Date): Date {
    const year = date.getFullYear();
    const month = date.getMonth();
    // Get the last day of the current month by getting day 0 of the next month.
    const lastDay = new Date(year, month + 1, 0);
    return endOfDay(lastDay);
}
