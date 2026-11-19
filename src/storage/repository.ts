import type { Allocation, PriceQuote, Transaction, User } from '../domain/types';

/** Storage contract shared by the IndexedDB (browser) and SQLite (APK) backends. */
export interface Repository {
  init(): Promise<void>;
  listUsers(): Promise<User[]>;
  saveUser(user: User): Promise<void>;
  /** All users' transactions. Callers filter by user. */
  listTransactions(): Promise<Transaction[]>;
  listAllocations(): Promise<Allocation[]>;
  /** Insert a transaction and its allocations atomically. */
  saveTrade(tx: Transaction, allocations: Allocation[]): Promise<void>;
  /** Replace a transaction and all of its allocations atomically (edit). */
  replaceTrade(tx: Transaction, allocations: Allocation[]): Promise<void>;
  /** Delete a transaction and the allocations it owns atomically. */
  deleteTrade(id: string): Promise<void>;
  listPrices(): Promise<PriceQuote[]>;
  /** Insert or overwrite the latest price of each stock, atomically. */
  savePrices(quotes: PriceQuote[]): Promise<void>;
  /** Replace the whole data set atomically (import). */
  replaceAll(
    users: User[],
    txs: Transaction[],
    allocs: Allocation[],
    prices: PriceQuote[],
  ): Promise<void>;
  /** Browser only: ask for persistent storage. Resolves to whether it was granted. */
  requestPersistence(): Promise<boolean | null>;
  readonly backendName: string;
}
