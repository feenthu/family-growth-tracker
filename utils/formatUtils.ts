/**
 * Utility functions for formatting text and numbers in user-friendly ways
 */

/**
 * Converts a number to its ordinal representation (1st, 2nd, 3rd, etc.)
 */
export function formatOrdinal(num: number): string {
  const absNum = Math.abs(num);
  const lastDigit = absNum % 10;
  const lastTwoDigits = absNum % 100;

  // Handle special cases for 11th, 12th, 13th
  if (lastTwoDigits >= 11 && lastTwoDigits <= 13) {
    return `${num}th`;
  }

  // Handle regular patterns
  switch (lastDigit) {
    case 1:
      return `${num}st`;
    case 2:
      return `${num}nd`;
    case 3:
      return `${num}rd`;
    default:
      return `${num}th`;
  }
}

/**
 * Converts frequency values to user-friendly text for recurring items
 */
export function formatFrequency(frequency: string): string {
  switch (frequency) {
    case 'monthly':
      return 'each month';
    case 'bi-monthly':
      return 'every two months';
    case 'quarterly':
      return 'each quarter';
    case 'semi-annually':
      return 'twice a year';
    case 'yearly':
      return 'each year';
    default:
      return frequency;
  }
}

/**
 * Formats recurring bill display text in a user-friendly way
 * Example: "Due on the 19th each month"
 */
export function formatRecurrenceText(dayOfMonth: number, frequency: string): string {
  return `Due on the ${formatOrdinal(dayOfMonth)} ${formatFrequency(frequency)}`;
}