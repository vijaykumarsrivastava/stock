import type { Allocation, Transaction } from '../domain/types';

/** Storage contract shared by the IndexedDB (browser) and SQLite (APK) backends. */
export interface Repository {
  init(): Promise<void>;
  listTransactions(): Promise<Transaction[]>;
  listAllocations(): Promise<Allocation[]>;
  /** Insert a transaction and its allocations atomically. */
  saveTrade(tx: Transaction, allocations: Allocation[]): Promise<void>;
  /** Replace a transaction and all of its allocations atomically (edit). */
  replaceTrade(tx: Transaction, allocations: Allocation[]): Promise<void>;
  /** Delete a transaction and the allocations it owns atomically. */
  deleteTrade(id: string): Promise<void>;
  /** Replace the whole data set atomically (import). */
  replaceAll(txs: Transaction[], allocs: Allocation[]): Promise<void>;
  /** Browser only: ask for persistent storage. Resolves to whether it was granted. */
  requestPersistence(): Promise<boolean | null>;
  readonly backendName: string;
}
