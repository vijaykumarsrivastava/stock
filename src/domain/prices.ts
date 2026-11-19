import { cleanStockName, normalizeStockName } from './money';
import type { PriceQuote } from './types';

export type PriceLineStatus = 'ok' | 'invalid' | 'duplicate';

export interface PriceLine {
  /** 1-based line number in the pasted text. */
  lineNumber: number;
  raw: string;
  status: PriceLineStatus;
  /** Reason for invalid or duplicate lines. */
  message?: string;
  symbol?: string;
  price?: number;
}

export interface ParsedPrices {
  lines: PriceLine[];
  /** Valid lines, one per stock (last one wins). */
  valid: { symbol: string; stockKey: string; price: number }[];
}

const HEADER_NAMES = /^(symbol|stock|name|ticker|equity)$/i;

/** Accepts 12560, 12560.00, 12,560.00, 1,25,600.50 and ₹ prefix. Returns NaN when invalid. */
export function parsePriceValue(text: string): number {
  const cleaned = text.replace(/[₹\s]/g, '').replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return NaN;
  return Number(cleaned);
}

/**
 * Parse text with one "SYMBOL;price" per line. The separator is a semicolon, so a price may
 * contain commas. Blank lines and a header row are ignored. A later line for the same stock wins.
 */
export function parsePrices(text: string): ParsedPrices {
  const lines: PriceLine[] = [];
  const lastIndexByKey = new Map<string, number>();
  let seenFirst = false;

  text.split(/\r?\n/).forEach((rawLine, i) => {
    const raw = rawLine.trim();
    if (!raw) return;
    const lineNumber = i + 1;

    const parts = raw.split(';').map((p) => p.trim());
    while (parts.length > 2 && parts[parts.length - 1] === '') parts.pop();

    const isFirst = !seenFirst;
    seenFirst = true;

    if (parts.length !== 2) {
      lines.push({
        lineNumber,
        raw,
        status: 'invalid',
        message: raw.includes(',') && !raw.includes(';')
          ? 'Use ; between the name and the price, for example ITC;301.00'
          : 'Expected: NAME;PRICE',
      });
      return;
    }

    const [rawSymbol, rawPrice] = parts;
    const symbol = cleanStockName(rawSymbol);
    const price = parsePriceValue(rawPrice);

    if (isFirst && HEADER_NAMES.test(symbol) && Number.isNaN(price)) return; // header row

    if (!symbol) {
      lines.push({ lineNumber, raw, status: 'invalid', message: 'Stock name is missing.' });
      return;
    }
    if (Number.isNaN(price) || price <= 0) {
      lines.push({ lineNumber, raw, status: 'invalid', symbol, message: 'Price must be a number greater than 0.' });
      return;
    }

    const key = normalizeStockName(symbol);
    const previous = lastIndexByKey.get(key);
    if (previous !== undefined) {
      lines[previous] = {
        ...lines[previous],
        status: 'duplicate',
        message: `Repeated on line ${lineNumber}, the later price is used.`,
      };
    }
    lastIndexByKey.set(key, lines.length);
    lines.push({ lineNumber, raw, status: 'ok', symbol, price });
  });

  const valid = lines
    .filter((l) => l.status === 'ok')
    .map((l) => ({ symbol: l.symbol!, stockKey: normalizeStockName(l.symbol!), price: l.price! }));
  return { lines, valid };
}

export function toQuotes(valid: ParsedPrices['valid'], updatedAt: string): PriceQuote[] {
  return valid.map((v) => ({ stockKey: v.stockKey, symbol: v.symbol, price: v.price, updatedAt }));
}

const dateTime = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

/** Local date and time, for example "16 Nov 2026, 03:40 pm". */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateTime.format(d);
}
