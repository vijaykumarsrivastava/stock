import { fromPaise, toPaise } from './money';
import type { Allocation, AllocationInput, Lot, Transaction } from './types';

/**
 * Check allocations for a sell. `lots` must already exclude the allocations of the
 * sell being edited (see computeLots `excludeSellId`).
 * Returns a list of readable problems; empty means valid.
 */
export function validateAllocations(
  sellQuantity: number,
  stockKey: string,
  inputs: AllocationInput[],
  lots: Lot[],
): string[] {
  const problems: string[] = [];
  const byId = new Map(lots.map((l) => [l.id, l]));
  const seen = new Set<string>();
  let total = 0;

  for (const a of inputs) {
    const lot = byId.get(a.lotId);
    if (!lot) {
      problems.push('A selected lot no longer exists.');
      continue;
    }
    if (seen.has(a.lotId)) {
      problems.push(`Lot of ${lot.date} at ${lot.price} is selected twice.`);
      continue;
    }
    seen.add(a.lotId);
    if (lot.stockKey !== stockKey) {
      problems.push('A selected lot belongs to a different stock.');
    }
    if (!Number.isInteger(a.quantity) || a.quantity <= 0) {
      problems.push(`Quantity for lot of ${lot.date} must be a whole number greater than 0.`);
    } else if (a.quantity > lot.remaining) {
      problems.push(
        `Lot of ${lot.date} at ${lot.price} has only ${lot.remaining} remaining (you entered ${a.quantity}).`,
      );
    }
    total += Number.isFinite(a.quantity) ? a.quantity : 0;
  }

  if (total !== sellQuantity) {
    problems.push(`Allocated ${total} but sell quantity is ${sellQuantity}.`);
  }
  return problems;
}

/** Realized profit or loss for a sell: sum of (sell price - lot price) * quantity, in rupees. */
export function realizedPL(
  sellPrice: number,
  allocs: Pick<Allocation, 'lotId' | 'quantity'>[],
  lotPrices: Map<string, number>,
): number {
  let paise = 0;
  for (const a of allocs) {
    const lotPrice = lotPrices.get(a.lotId);
    if (lotPrice === undefined) continue;
    paise += (toPaise(sellPrice) - toPaise(lotPrice)) * a.quantity;
  }
  return fromPaise(paise);
}

export function lotPriceMap(txs: Transaction[]): Map<string, number> {
  return new Map(txs.filter((t) => t.type === 'BUY').map((t) => [t.id, t.price]));
}

/** Default quantity when a lot is picked: as much as it can cover. */
export function defaultAllocationQuantity(
  lot: Lot,
  sellQuantity: number,
  alreadyAllocated: number,
): number {
  return Math.max(0, Math.min(lot.remaining, sellQuantity - alreadyAllocated));
}
