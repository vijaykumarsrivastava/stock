import Dexie, { type Table } from 'dexie';
import { DEFAULT_USER_NAME, makeUser } from '../domain/user';
import type { Allocation, PriceQuote, Transaction, User } from '../domain/types';
import type { Repository } from './repository';

class StockDb extends Dexie {
  users!: Table<User, string>;
  transactions!: Table<Transaction, string>;
  allocations!: Table<Allocation, string>;
  prices!: Table<PriceQuote, string>;

  constructor() {
    super('stock-tracker');
    this.version(1).stores({
      transactions: 'id, stockKey, [stockKey+type], date',
      allocations: 'id, sellId, lotId',
    });
    // v2: users. Data saved before users existed is assigned to a "Default" user.
    this.version(2)
      .stores({
        users: 'id, nameKey',
        transactions: 'id, userId, stockKey, [stockKey+type], date',
        allocations: 'id, sellId, lotId',
      })
      .upgrade(async (tx) => {
        const txs = tx.table('transactions');
        if ((await txs.count()) === 0) return;
        const user = makeUser(DEFAULT_USER_NAME);
        await tx.table('users').add(user);
        await txs.toCollection().modify({ userId: user.id });
      });
    // v3: latest price per stock.
    this.version(3).stores({ prices: 'stockKey' });
  }
}

export class IndexedDbRepository implements Repository {
  readonly backendName = 'IndexedDB';
  private db = new StockDb();

  async init(): Promise<void> {
    await this.db.open();
  }

  listUsers(): Promise<User[]> {
    return this.db.users.toArray();
  }

  async saveUser(user: User): Promise<void> {
    await this.db.users.add(user);
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

  listPrices(): Promise<PriceQuote[]> {
    return this.db.prices.toArray();
  }

  async savePrices(quotes: PriceQuote[]): Promise<void> {
    await this.db.prices.bulkPut(quotes);
  }

  async replaceAll(
    users: User[],
    txs: Transaction[],
    allocs: Allocation[],
    prices: PriceQuote[],
  ): Promise<void> {
    await this.db.transaction(
      'rw',
      [this.db.users, this.db.transactions, this.db.allocations, this.db.prices],
      async () => {
        await this.db.allocations.clear();
        await this.db.transactions.clear();
        await this.db.users.clear();
        await this.db.prices.clear();
        if (users.length) await this.db.users.bulkAdd(users);
        if (txs.length) await this.db.transactions.bulkAdd(txs);
        if (allocs.length) await this.db.allocations.bulkAdd(allocs);
        if (prices.length) await this.db.prices.bulkAdd(prices);
      },
    );
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
