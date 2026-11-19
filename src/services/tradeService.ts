import { realizedPL, lotPriceMap, validateAllocations } from '../domain/allocation';
import { computeLots } from '../domain/lots';
import { cleanStockName, newId, normalizeStockName } from '../domain/money';
import type { Allocation, AllocationInput, Transaction, TradeInput } from '../domain/types';
import { hasErrors, validateTrade } from '../domain/validation';
import type { Repository } from '../storage/repository';

/** Error with a message that is safe to show to the user. */
export class TradeError extends Error {
  constructor(message: string, readonly details: string[] = []) {
    super(message);
    this.name = 'TradeError';
  }
}

export interface SaveResult {
  transaction: Transaction;
  /** Only set for SELL. */
  realizedPL?: number;
}

function describe(t: Transaction): string {
  return `${t.type} ${t.quantity} ${t.stockName} @ ${t.price} on ${t.date}`;
}

export class TradeService {
  constructor(
    private readonly repo: Repository,
    private readonly userId: string,
  ) {}

  /** Only this user's transactions and the allocations of their sells. */
  async loadAll(): Promise<{ transactions: Transaction[]; allocations: Allocation[] }> {
    const [all, allAllocs] = await Promise.all([
      this.repo.listTransactions(),
      this.repo.listAllocations(),
    ]);
    const transactions = all.filter((t) => t.userId === this.userId);
    const ids = new Set(transactions.map((t) => t.id));
    return { transactions, allocations: allAllocs.filter((a) => ids.has(a.sellId)) };
  }

  async addTrade(input: TradeInput, allocationInputs: AllocationInput[] = []): Promise<SaveResult> {
    const errors = validateTrade(input);
    if (hasErrors(errors)) throw new TradeError('Please fix the highlighted fields.', Object.values(errors));

    const { transactions, allocations } = await this.loadAll();
    const tx = this.buildTx(newId(), input, new Date().toISOString());

    if (input.type === 'BUY') {
      await this.repo.saveTrade(tx, []);
      return { transaction: tx };
    }

    const lots = computeLots(transactions, allocations);
    const newAllocs = this.checkSell(tx, allocationInputs, lots);
    await this.repo.saveTrade(tx, newAllocs);
    return {
      transaction: tx,
      realizedPL: realizedPL(tx.price, newAllocs, lotPriceMap(transactions)),
    };
  }

  async editTrade(
    id: string,
    input: TradeInput,
    allocationInputs: AllocationInput[] = [],
  ): Promise<SaveResult> {
    const { transactions, allocations } = await this.loadAll();
    const existing = transactions.find((t) => t.id === id);
    if (!existing) throw new TradeError('This transaction no longer exists.');
    if (input.type !== existing.type) {
      throw new TradeError('The type (Buy or Sell) of a transaction cannot be changed. Delete it and add a new one.');
    }
    const errors = validateTrade(input);
    if (hasErrors(errors)) throw new TradeError('Please fix the highlighted fields.', Object.values(errors));

    const updated = this.buildTx(id, input, existing.createdAt);

    if (existing.type === 'BUY') {
      const lot = computeLots(transactions, allocations).find((l) => l.id === id)!;
      const sold = lot.quantity - lot.remaining;
      if (sold > 0) {
        if (updated.stockKey !== existing.stockKey) {
          throw new TradeError(
            `Cannot change the stock of this buy because ${sold} shares from it are already sold.`,
            this.dependentSells(id, transactions, allocations),
          );
        }
        if (updated.quantity < sold) {
          throw new TradeError(
            `Quantity cannot be below ${sold}, the number of shares already sold from this buy.`,
            this.dependentSells(id, transactions, allocations),
          );
        }
      }
      await this.repo.replaceTrade(updated, []);
      return { transaction: updated };
    }

    const lots = computeLots(transactions, allocations, id);
    const newAllocs = this.checkSell(updated, allocationInputs, lots);
    await this.repo.replaceTrade(updated, newAllocs);
    return {
      transaction: updated,
      realizedPL: realizedPL(updated.price, newAllocs, lotPriceMap(transactions)),
    };
  }

  async deleteTrade(id: string): Promise<void> {
    const { transactions, allocations } = await this.loadAll();
    const existing = transactions.find((t) => t.id === id);
    if (!existing) throw new TradeError('This transaction no longer exists.');
    if (existing.type === 'BUY') {
      const dependents = this.dependentSells(id, transactions, allocations);
      if (dependents.length) {
        throw new TradeError(
          'This buy cannot be deleted because shares from it were sold. Delete or edit these sells first:',
          dependents,
        );
      }
    }
    await this.repo.deleteTrade(id);
  }

  /** Realized P/L per sell id. */
  static plBySell(transactions: Transaction[], allocations: Allocation[]): Map<string, number> {
    const prices = lotPriceMap(transactions);
    const out = new Map<string, number>();
    for (const t of transactions) {
      if (t.type !== 'SELL') continue;
      out.set(t.id, realizedPL(t.price, allocations.filter((a) => a.sellId === t.id), prices));
    }
    return out;
  }

  private buildTx(id: string, input: TradeInput, createdAt: string): Transaction {
    const stockName = cleanStockName(input.stockName);
    return {
      id,
      userId: this.userId,
      type: input.type,
      stockKey: normalizeStockName(stockName),
      stockName,
      quantity: input.quantity,
      price: input.price,
      date: input.date,
      createdAt,
    };
  }

  private checkSell(
    tx: Transaction,
    allocationInputs: AllocationInput[],
    lots: ReturnType<typeof computeLots>,
  ): Allocation[] {
    const stockRemaining = lots
      .filter((l) => l.stockKey === tx.stockKey)
      .reduce((s, l) => s + Math.max(0, l.remaining), 0);
    if (tx.quantity > stockRemaining) {
      throw new TradeError(
        `You only have ${stockRemaining} shares of ${tx.stockName} available to sell.`,
      );
    }
    const problems = validateAllocations(tx.quantity, tx.stockKey, allocationInputs, lots);
    if (problems.length) throw new TradeError('The selected lots do not match this sale.', problems);
    return allocationInputs.map((a) => ({
      id: newId(),
      sellId: tx.id,
      lotId: a.lotId,
      quantity: a.quantity,
    }));
  }

  private dependentSells(lotId: string, txs: Transaction[], allocs: Allocation[]): string[] {
    const sellIds = new Set(allocs.filter((a) => a.lotId === lotId).map((a) => a.sellId));
    return txs.filter((t) => sellIds.has(t.id)).map(describe);
  }
}
