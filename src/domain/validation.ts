import { cleanStockName, todayIso } from './money';
import type { TradeInput } from './types';

export interface FieldErrors {
  stockName?: string;
  quantity?: string;
  price?: string;
  date?: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export function validateTrade(input: TradeInput, today: string = todayIso()): FieldErrors {
  const errors: FieldErrors = {};
  if (!cleanStockName(input.stockName)) {
    errors.stockName = 'Enter a stock name.';
  }
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    errors.quantity = 'Quantity must be a whole number greater than 0.';
  }
  if (!Number.isFinite(input.price) || input.price <= 0) {
    errors.price = 'Price must be greater than 0.';
  }
  if (!input.date) {
    errors.date = 'Select a date.';
  } else if (!isRealDate(input.date)) {
    errors.date = 'Enter a valid date.';
  } else if (input.date > today) {
    errors.date = 'Date cannot be in the future.';
  }
  return errors;
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}
