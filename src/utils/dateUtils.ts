/**
 * Date utility functions for the application
 */

/**
 * Get the maximum allowed date (31/12/2099)
 */
export const getMaxDate = (): string => {
  return '2099-12-31';
};

/**
 * Convert a date string from YYYY-MM-DD to DD/MM/YYYY format
 */
export const formatDateToDDMMYYYY = (dateString: string): string => {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-');
  return `${day}/${month}/${year}`;
};

/**
 * Convert a date string from DD/MM/YYYY to YYYY-MM-DD format
 */
export const formatDateToYYYYMMDD = (dateString: string): string => {
  if (!dateString) return '';
  const [day, month, year] = dateString.split('/');
  return `${year}-${month}-${day}`;
};

/**
 * Validate a date string in DD/MM/YYYY format
 * Returns true if valid, false otherwise
 */
export const isValidDDMMYYYY = (dateString: string): boolean => {
  const regex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  const match = dateString.match(regex);
  
  if (!match) return false;
  
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);
  
  // Check year range
  if (year < 1900 || year > 2099) return false;
  
  // Check month range
  if (month < 1 || month > 12) return false;
  
  // Check day range
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) return false;
  
  return true;
};

/**
 * Format a date for display with day name (e.g., "Mon, 15 Jan 2024")
 */
export const formatDateWithDay = (dateString: string): string => {
  // Parse as local date to avoid timezone issues
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

/**
 * Format a date for display (e.g., "15 Jan 2024")
 */
export const formatDate = (dateString: string): string => {
  // Parse as local date to avoid timezone issues
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

/**
 * Format a date for display with short format (e.g., "Mon, Jan 15")
 */
export const formatDateShort = (dateString: string): string => {
  // Parse as local date to avoid timezone issues
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
};