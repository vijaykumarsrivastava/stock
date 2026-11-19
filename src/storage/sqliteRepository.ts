import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from '@capacitor-community/sqlite';
import type { Allocation, PriceQuote, Transaction, User } from '../domain/types';
import { DEFAULT_USER_NAME, makeUser } from '../domain/user';
import type { Repository } from './repository';

const DB_NAME = 'stocktracker';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL CHECK (type IN ('BUY','SELL')),
  stock_key TEXT NOT NULL,
  stock_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price REAL NOT NULL CHECK (price > 0),
  date TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS allocations (
  id TEXT PRIMARY KEY,
  sell_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  lot_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0)
);
CREATE TABLE IF NOT EXISTS prices (
  stock_key TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  price REAL NOT NULL CHECK (price > 0),
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alloc_lot ON allocations(lot_id);
CREATE INDEX IF NOT EXISTS idx_alloc_sell ON allocations(sell_id);
`;

// Created after the migration, because older databases get user_id added by ALTER TABLE.
const INDEXES = `
CREATE INDEX IF NOT EXISTS idx_tx_stock ON transactions(stock_key, type, date);
CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id);
`;

type Stmt = { statement: string; values?: (string | number)[] };

const insertUser = (u: User): Stmt => ({
  statement: 'INSERT INTO users (id, name, name_key, created_at) VALUES (?,?,?,?)',
  values: [u.id, u.name, u.nameKey, u.createdAt],
});

const insertTx = (t: Transaction): Stmt => ({
  statement:
    'INSERT INTO transactions (id, user_id, type, stock_key, stock_name, quantity, price, date, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
  values: [t.id, t.userId, t.type, t.stockKey, t.stockName, t.quantity, t.price, t.date, t.createdAt],
});

const upsertPrice = (q: PriceQuote): Stmt => ({
  statement: 'INSERT OR REPLACE INTO prices (stock_key, symbol, price, updated_at) VALUES (?,?,?,?)',
  values: [q.stockKey, q.symbol, q.price, q.updatedAt],
});

interface PriceRow {
  stock_key: string;
  symbol: string;
  price: number;
  updated_at: string;
}

const insertAlloc = (a: Allocation): Stmt => ({
  statement: 'INSERT INTO allocations (id, sell_id, lot_id, quantity) VALUES (?,?,?,?)',
  values: [a.id, a.sellId, a.lotId, a.quantity],
});

interface UserRow {
  id: string;
  name: string;
  name_key: string;
  created_at: string;
}

interface TxRow {
  id: string;
  user_id: string;
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
    await this.migrateToUsers();
    await this.db.execute(INDEXES, true);
  }

  /** Databases created before users existed lack user_id. Their data goes to a "Default" user. */
  private async migrateToUsers(): Promise<void> {
    const cols = await this.db.query('PRAGMA table_info(transactions)');
    const hasUserId = ((cols.values ?? []) as { name: string }[]).some((c) => c.name === 'user_id');
    if (!hasUserId) {
      await this.db.execute("ALTER TABLE transactions ADD COLUMN user_id TEXT NOT NULL DEFAULT ''", false);
    }
    const orphans = await this.db.query("SELECT COUNT(*) AS c FROM transactions WHERE user_id = ''");
    const count = Number((orphans.values?.[0] as { c: number } | undefined)?.c ?? 0);
    if (count === 0) return;

    const existing = await this.db.query('SELECT * FROM users WHERE name_key = ?', ['default']);
    let user: User;
    if (existing.values && existing.values.length > 0) {
      const r = existing.values[0] as UserRow;
      user = { id: r.id, name: r.name, nameKey: r.name_key, createdAt: r.created_at };
      await this.db.executeSet(
        [{ statement: "UPDATE transactions SET user_id = ? WHERE user_id = ''", values: [user.id] }],
        true,
      );
    } else {
      user = makeUser(DEFAULT_USER_NAME);
      await this.db.executeSet(
        [insertUser(user), { statement: "UPDATE transactions SET user_id = ? WHERE user_id = ''", values: [user.id] }],
        true,
      );
    }
  }

  async listUsers(): Promise<User[]> {
    const res = await this.db.query('SELECT * FROM users');
    return ((res.values ?? []) as UserRow[]).map((r) => ({
      id: r.id,
      name: r.name,
      nameKey: r.name_key,
      createdAt: r.created_at,
    }));
  }

  async saveUser(user: User): Promise<void> {
    await this.runAtomic([insertUser(user)]);
  }

  async listTransactions(): Promise<Transaction[]> {
    const res = await this.db.query('SELECT * FROM transactions');
    return ((res.values ?? []) as TxRow[]).map((r) => ({
      id: r.id,
      userId: r.user_id,
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
          'UPDATE transactions SET user_id=?, type=?, stock_key=?, stock_name=?, quantity=?, price=?, date=?, created_at=? WHERE id=?',
        values: [tx.userId, tx.type, tx.stockKey, tx.stockName, tx.quantity, tx.price, tx.date, tx.createdAt, tx.id],
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

  async listPrices(): Promise<PriceQuote[]> {
    const res = await this.db.query('SELECT * FROM prices');
    return ((res.values ?? []) as PriceRow[]).map((r) => ({
      stockKey: r.stock_key,
      symbol: r.symbol,
      price: r.price,
      updatedAt: r.updated_at,
    }));
  }

  savePrices(quotes: PriceQuote[]): Promise<void> {
    if (quotes.length === 0) return Promise.resolve();
    return this.runAtomic(quotes.map(upsertPrice));
  }

  replaceAll(
    users: User[],
    txs: Transaction[],
    allocs: Allocation[],
    prices: PriceQuote[],
  ): Promise<void> {
    return this.runAtomic([
      { statement: 'DELETE FROM allocations' },
      { statement: 'DELETE FROM transactions' },
      { statement: 'DELETE FROM users' },
      { statement: 'DELETE FROM prices' },
      ...users.map(insertUser),
      ...txs.map(insertTx),
      ...allocs.map(insertAlloc),
      ...prices.map(upsertPrice),
    ]);
  }

  async requestPersistence(): Promise<boolean | null> {
    return null;
  }
}
