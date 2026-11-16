import Dexie, { type Table } from 'dexie';
import type { Allocation, Transaction } from '../domain/types';
import type { Repository } from './repository';

class StockDb extends Dexie {
  transactions!: Table<Transaction, string>;
  allocations!: Table<Allocation, string>;

  constructor() {
    super('stock-tracker');
    this.version(1).stores({
      transactions: 'id, stockKey, [stockKey+type], date',
      allocations: 'id, sellId, lotId',
    });
  }
}

export class IndexedDbRepository implements Repository {
  readonly backendName = 'IndexedDB';
  private db = new StockDb();

  async init(): Promise<void> {
    await this.db.open();
  }

  listTransactions(): Promise<Transaction[]> {
    return this.db.transactions.toArray();
  }

  listAllocations(): Promise<Allocation[]> {
    return this.db.allocations.toArray();
  }

  async saveTrade(tx: Transaction, allocations: Allocation[]): Promise<void> {
    await this.db.transaction('rw', this.db.transactions, this.db.allocations, async () => {
      await this.db.transactions.add(tx);
      if (allocations.length) await this.db.allocations.bulkAdd(allocations);
    });
  }

  async replaceTrade(tx: Transaction, allocations: Allocation[]): Promise<void> {
    await this.db.transaction('rw', this.db.transactions, this.db.allocations, async () => {
      await this.db.allocations.where('sellId').equals(tx.id).delete();
      await this.db.transactions.put(tx);
      if (allocations.length) await this.db.allocations.bulkAdd(allocations);
    });
  }

  async deleteTrade(id: string): Promise<void> {
    await this.db.transaction('rw', this.db.transactions, this.db.allocations, async () => {
      await this.db.allocations.where('sellId').equals(id).delete();
      await this.db.transactions.delete(id);
    });
  }

  async replaceAll(txs: Transaction[], allocs: Allocation[]): Promise<void> {
    await this.db.transaction('rw', this.db.transactions, this.db.allocations, async () => {
      await this.db.allocations.clear();
      await this.db.transactions.clear();
      if (txs.length) await this.db.transactions.bulkAdd(txs);
      if (allocs.length) await this.db.allocations.bulkAdd(allocs);
    });
  }

  async requestPersistence(): Promise<boolean | null> {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return null;
    try {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    } catch {
      return null;
    }
  }
}
