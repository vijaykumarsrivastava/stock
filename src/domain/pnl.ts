import { fromPaise, toPaise } from './money';
import type { Allocation, Transaction } from './types';

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
