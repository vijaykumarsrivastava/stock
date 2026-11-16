import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from '@capacitor-community/sqlite';
import type { Allocation, Transaction } from '../domain/types';
import type { Repository } from './repository';

const DB_NAME = 'stocktracker';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('BUY','SELL')),
  stock_key TEXT NOT NULL,
  stock_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price REAL NOT NULL CHECK (price > 0),
  date TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tx_stock ON transactions(stock_key, type, date);
CREATE TABLE IF NOT EXISTS allocations (
  id TEXT PRIMARY KEY,
  sell_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  lot_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0)
);
CREATE INDEX IF NOT EXISTS idx_alloc_lot ON allocations(lot_id);
CREATE INDEX IF NOT EXISTS idx_alloc_sell ON allocations(sell_id);
`;

type Stmt = { statement: string; values?: (string | number)[] };

const insertTx = (t: Transaction): Stmt => ({
  statement:
    'INSERT INTO transactions (id, type, stock_key, stock_name, quantity, price, date, created_at) VALUES (?,?,?,?,?,?,?,?)',
  values: [t.id, t.type, t.stockKey, t.stockName, t.quantity, t.price, t.date, t.createdAt],
});

const insertAlloc = (a: Allocation): Stmt => ({
  statement: 'INSERT INTO allocations (id, sell_id, lot_id, quantity) VALUES (?,?,?,?)',
  values: [a.id, a.sellId, a.lotId, a.quantity],
});

interface TxRow {
  id: string;
  type: 'BUY' | 'SELL';
  stock_key: string;
  stock_name: string;
  quantity: number;
  price: number;
  date: string;
  created_at: string;
}

interface AllocRow {
  id: string;
  sell_id: string;
  lot_id: string;
  quantity: number;
}

export class SqliteRepository implements Repository {
  readonly backendName = 'SQLite';
  private sqlite = new SQLiteConnection(CapacitorSQLite);
  private db!: SQLiteDBConnection;

  async init(): Promise<void> {
    const consistent = (await this.sqlite.checkConnectionsConsistency()).result;
    const exists = (await this.sqlite.isConnection(DB_NAME, false)).result;
    if (consistent && exists) {
      this.db = await this.sqlite.retrieveConnection(DB_NAME, false);
    } else {
      this.db = await this.sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
    }
    await this.db.open();
    await this.db.execute('PRAGMA foreign_keys = ON;', false);
    await this.db.execute(SCHEMA, true);
  }

  async listTransactions(): Promise<Transaction[]> {
    const res = await this.db.query('SELECT * FROM transactions');
    return ((res.values ?? []) as TxRow[]).map((r) => ({
      id: r.id,
      type: r.type,
      stockKey: r.stock_key,
      stockName: r.stock_name,
      quantity: r.quantity,
      price: r.price,
      date: r.date,
      createdAt: r.created_at,
    }));
  }

  async listAllocations(): Promise<Allocation[]> {
    const res = await this.db.query('SELECT * FROM allocations');
    return ((res.values ?? []) as AllocRow[]).map((r) => ({
      id: r.id,
      sellId: r.sell_id,
      lotId: r.lot_id,
      quantity: r.quantity,
    }));
  }

  /** executeSet with transaction=true runs all statements in one transaction and rolls back on error. */
  private async runAtomic(set: Stmt[]): Promise<void> {
    await this.db.executeSet(set, true);
  }

  saveTrade(tx: Transaction, allocations: Allocation[]): Promise<void> {
    return this.runAtomic([insertTx(tx), ...allocations.map(insertAlloc)]);
  }

  replaceTrade(tx: Transaction, allocations: Allocation[]): Promise<void> {
    return this.runAtomic([
      { statement: 'DELETE FROM allocations WHERE sell_id = ?', values: [tx.id] },
      {
        statement:
          'UPDATE transactions SET type=?, stock_key=?, stock_name=?, quantity=?, price=?, date=?, created_at=? WHERE id=?',
        values: [tx.type, tx.stockKey, tx.stockName, tx.quantity, tx.price, tx.date, tx.createdAt, tx.id],
      },
      ...allocations.map(insertAlloc),
    ]);
  }

  deleteTrade(id: string): Promise<void> {
    return this.runAtomic([
      { statement: 'DELETE FROM allocations WHERE sell_id = ?', values: [id] },
      { statement: 'DELETE FROM transactions WHERE id = ?', values: [id] },
    ]);
  }

  replaceAll(txs: Transaction[], allocs: Allocation[]): Promise<void> {
    return this.runAtomic([
      { statement: 'DELETE FROM allocations' },
      { statement: 'DELETE FROM transactions' },
      ...txs.map(insertTx),
      ...allocs.map(insertAlloc),
    ]);
  }

  async requestPersistence(): Promise<boolean | null> {
    return null;
  }
}
