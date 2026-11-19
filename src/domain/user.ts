import { cleanStockName, newId, normalizeStockName } from './money';
import type { User } from './types';

export const MAX_USER_NAME = 50;

/** Name given to the user that owns data saved before users existed. */
export const DEFAULT_USER_NAME = 'Default';

export function normalizeUserName(name: string): string {
  return normalizeStockName(name);
}

export function cleanUserName(name: string): string {
  return cleanStockName(name);
}

/** Returns an error message, or null when the name is acceptable. */
export function validateUserName(name: string): string | null {
  const cleaned = cleanUserName(name);
  if (!cleaned) return 'Enter a user name.';
  if (cleaned.length > MAX_USER_NAME) return `Name can be at most ${MAX_USER_NAME} characters.`;
  return null;
}

export function makeUser(name: string): User {
  const cleaned = cleanUserName(name);
  return {
    id: newId(),
    name: cleaned,
    nameKey: normalizeUserName(cleaned),
    createdAt: new Date().toISOString(),
  };
}
