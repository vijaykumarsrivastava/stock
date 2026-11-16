import { fromPaise, toPaise } from './money';
import type {
  Allocation,
  Holding,
  Lot,
  LotSortColumn,
  SortDirection,
  Transaction,
} from './types';

/**
 * Build lots (BUY transactions) with remaining quantity derived from allocations.
 * Allocations of `excludeSellId` are ignored, which is used when editing that sell.
 */
export function computeLots(
  txs: Transaction[],
  allocs: Allocation[],
  excludeSellId?: string,
): Lot[] {
  const sold = new Map<string, number>();
  for (const a of allocs) {
    if (excludeSellId && a.sellId === excludeSellId) continue;
    sold.set(a.lotId, (sold.get(a.lotId) ?? 0) + a.quantity);
  }
  return txs
    .filter((t) => t.type === 'BUY')
    .map((t) => ({
      id: t.id,
      stockKey: t.stockKey,
      stockName: t.stockName,
      date: t.date,
      price: t.price,
      quantity: t.quantity,
      remaining: t.quantity - (sold.get(t.id) ?? 0),
      createdAt: t.createdAt,
    }));
}

export function availableLots(lots: Lot[], stockKey?: string): Lot[] {
  return lots.filter((l) => l.remaining > 0 && (!stockKey || l.stockKey === stockKey));
}

/** Weighted average buy price over remaining quantity, per stock. */
export function computeHoldings(lots: Lot[]): Holding[] {
  const byStock = new Map<string, { name: string; qty: number; paise: number; latest: string }>();
  for (const l of lots) {
    if (l.remaining <= 0) continue;
    const entry = byStock.get(l.stockKey) ?? { name: l.stockName, qty: 0, paise: 0, latest: '' };
    entry.qty += l.remaining;
    entry.paise += l.remaining * toPaise(l.price);
    if (l.createdAt >= entry.latest) {
      entry.latest = l.createdAt;
      entry.name = l.stockName;
    }
    byStock.set(l.stockKey, entry);
  }
  return [...byStock.entries()]
    .map(([stockKey, e]) => ({
      stockKey,
      stockName: e.name,
      totalQuantity: e.qty,
      averagePrice: fromPaise(Math.round(e.paise / e.qty)),
    }))
    .sort((a, b) => a.stockName.localeCompare(b.stockName));
}

function latest(txs: Transaction[]): Transaction | null {
  let best: Transaction | null = null;
  for (const t of txs) {
    if (
      !best ||
      t.date > best.date ||
      (t.date === best.date && t.createdAt > best.createdAt)
    ) {
      best = t;
    }
  }
  return best;
}

export function lastOfType(
  txs: Transaction[],
  stockKey: string,
  type: 'BUY' | 'SELL',
): Transaction | null {
  return latest(txs.filter((t) => t.stockKey === stockKey && t.type === type));
}

export function sortLots(
  lots: Lot[],
  column: LotSortColumn = 'price',
  direction: SortDirection = 'desc',
): Lot[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...lots].sort((a, b) => {
    let cmp: number;
    if (column === 'date') {
      cmp = a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);
    } else {
      cmp = a[column] - b[column];
    }
    return cmp * sign;
  });
}

/** Total quantity already sold from a lot. */
export function soldFromLot(lot: Lot): number {
  return lot.quantity - lot.remaining;
}
