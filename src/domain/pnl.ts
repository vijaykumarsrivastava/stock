import { fromPaise, toPaise } from './money';
import type { Allocation, Lot, PriceQuote, Transaction } from './types';

export interface SellLine {
  lot: Transaction;
  quantity: number;
  /** (sell price - lot price) * quantity, in rupees. */
  pl: number;
}

export interface SellBreakdown {
  sell: Transaction;
  lines: SellLine[];
  totalPl: number;
}

export interface StockPl {
  stockKey: string;
  stockName: string;
  realizedPl: number;
}

/** Each sell with the buy lots it was matched to and the profit or loss per lot. */
export function sellBreakdowns(
  txs: Transaction[],
  allocs: Allocation[],
): Map<string, SellBreakdown> {
  const byId = new Map(txs.map((t) => [t.id, t]));
  const out = new Map<string, SellBreakdown>();
  for (const sell of txs) {
    if (sell.type !== 'SELL') continue;
    const lines: SellLine[] = [];
    let paise = 0;
    for (const a of allocs) {
      if (a.sellId !== sell.id) continue;
      const lot = byId.get(a.lotId);
      if (!lot) continue;
      const linePaise = (toPaise(sell.price) - toPaise(lot.price)) * a.quantity;
      paise += linePaise;
      lines.push({ lot, quantity: a.quantity, pl: fromPaise(linePaise) });
    }
    lines.sort((x, y) => x.lot.date.localeCompare(y.lot.date));
    out.set(sell.id, { sell, lines, totalPl: fromPaise(paise) });
  }
  return out;
}

export interface StockUnrealized {
  stockKey: string;
  price: number;
  updatedAt: string;
  /** Sum over remaining lots of (current price - lot price) * remaining, in rupees. */
  unrealizedPl: number;
}

/**
 * Unrealized P/L for stocks that have a price. Holdings without a price are counted in
 * `missing` and left out of the total.
 */
export function unrealizedByStock(
  lots: Lot[],
  prices: Map<string, PriceQuote>,
): { stocks: Map<string, StockUnrealized>; total: number; missing: number } {
  const paise = new Map<string, number>();
  const held = new Set<string>();
  for (const l of lots) {
    if (l.remaining <= 0) continue;
    held.add(l.stockKey);
    const q = prices.get(l.stockKey);
    if (!q) continue;
    paise.set(l.stockKey, (paise.get(l.stockKey) ?? 0) + (toPaise(q.price) - toPaise(l.price)) * l.remaining);
  }
  const stocks = new Map<string, StockUnrealized>();
  let total = 0;
  for (const [key, p] of paise) {
    const q = prices.get(key)!;
    stocks.set(key, { stockKey: key, price: q.price, updatedAt: q.updatedAt, unrealizedPl: fromPaise(p) });
    total += p;
  }
  const missing = [...held].filter((k) => !prices.has(k)).length;
  return { stocks, total: fromPaise(total), missing };
}

/** Realized P/L per stock (including stocks that are fully sold) and overall. */
export function realizedByStock(
  txs: Transaction[],
  allocs: Allocation[],
): { stocks: Map<string, StockPl>; total: number } {
  const stocks = new Map<string, StockPl>();
  const paise = new Map<string, number>();
  for (const t of [...txs].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    stocks.set(t.stockKey, { stockKey: t.stockKey, stockName: t.stockName, realizedPl: 0 });
  }
  for (const b of sellBreakdowns(txs, allocs).values()) {
    const p = paise.get(b.sell.stockKey) ?? 0;
    paise.set(b.sell.stockKey, p + Math.round(b.totalPl * 100));
  }
  let total = 0;
  for (const [key, p] of paise) {
    stocks.get(key)!.realizedPl = fromPaise(p);
    total += p;
  }
  return { stocks, total: fromPaise(total) };
}
