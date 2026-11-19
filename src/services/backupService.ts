import { normalizeStockName } from '../domain/money';
import type { Allocation, PriceQuote, Transaction, User } from '../domain/types';
import { DEFAULT_USER_NAME, makeUser, normalizeUserName } from '../domain/user';
import type { Repository } from '../storage/repository';

const APP_ID = 'stock-tracker';
const VERSION = 2;

export interface BackupFile {
  app: string;
  version: number;
  exportedAt: string;
  users: User[];
  transactions: Transaction[];
  allocations: Allocation[];
  /** Latest prices. Missing in older files. */
  prices: PriceQuote[];
}

export class BackupError extends Error {
  constructor(message: string, readonly details: string[] = []) {
    super(message);
    this.name = 'BackupError';
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isPosInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0;

function checkUser(raw: unknown, i: number, problems: string[]): User | null {
  const label = `User #${i + 1}`;
  if (!isObj(raw)) {
    problems.push(`${label} is not an object.`);
    return null;
  }
  const before = problems.length;
  if (!isStr(raw.id)) problems.push(`${label}: missing id.`);
  if (!isStr(raw.name)) problems.push(`${label}: missing name.`);
  else if (raw.nameKey !== normalizeUserName(raw.name)) problems.push(`${label}: name key does not match the name.`);
  if (!isStr(raw.createdAt)) problems.push(`${label}: missing createdAt.`);
  return problems.length === before ? (raw as unknown as User) : null;
}

function checkTransaction(raw: unknown, i: number, problems: string[]): Transaction | null {
  const label = `Transaction #${i + 1}`;
  if (!isObj(raw)) {
    problems.push(`${label} is not an object.`);
    return null;
  }
  const { id, userId, type, stockKey, stockName, quantity, price, date, createdAt } = raw;
  const before = problems.length;
  if (!isStr(id)) problems.push(`${label}: missing id.`);
  if (!isStr(userId)) problems.push(`${label}: missing user.`);
  if (type !== 'BUY' && type !== 'SELL') problems.push(`${label}: type must be BUY or SELL.`);
  if (!isStr(stockName)) problems.push(`${label}: missing stock name.`);
  else if (stockKey !== normalizeStockName(stockName)) problems.push(`${label}: stock key does not match the name.`);
  if (!isPosInt(quantity)) problems.push(`${label}: quantity must be a positive whole number.`);
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) problems.push(`${label}: price must be greater than 0.`);
  if (!isStr(date) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) problems.push(`${label}: date must be yyyy-mm-dd.`);
  if (!isStr(createdAt)) problems.push(`${label}: missing createdAt.`);
  return problems.length === before ? (raw as unknown as Transaction) : null;
}

/** Version 1 files have no users. Their transactions all go to a "Default" user. */
function upgradeV1(data: Record<string, unknown>): Record<string, unknown> {
  const user = makeUser(DEFAULT_USER_NAME);
  const txs = Array.isArray(data.transactions)
    ? data.transactions.map((t) => (isObj(t) ? { ...t, userId: user.id } : t))
    : data.transactions;
  return { ...data, version: VERSION, users: [user], transactions: txs };
}

/** Validate the structure and lot consistency of parsed backup data. */
export function validateBackup(input: unknown): BackupFile {
  if (!isObj(input)) throw new BackupError('The file is not a valid backup.');
  if (input.app !== APP_ID) throw new BackupError('This file was not exported by Stock Tracker.');
  if (input.version !== 1 && input.version !== VERSION) {
    throw new BackupError(`Unsupported backup version: ${String(input.version)}.`);
  }
  const data = input.version === 1 ? upgradeV1(input) : input;
  if (!Array.isArray(data.users) || !Array.isArray(data.transactions) || !Array.isArray(data.allocations)) {
    throw new BackupError('The backup is missing users, transactions or allocations.');
  }

  const problems: string[] = [];

  const users: User[] = [];
  data.users.forEach((raw, i) => {
    const u = checkUser(raw, i, problems);
    if (u) users.push(u);
  });
  const userIds = new Set<string>();
  const userKeys = new Set<string>();
  for (const u of users) {
    if (userIds.has(u.id)) problems.push(`Duplicate user id ${u.id}.`);
    if (userKeys.has(u.nameKey)) problems.push(`Duplicate user name "${u.name}".`);
    userIds.add(u.id);
    userKeys.add(u.nameKey);
  }

  const txs: Transaction[] = [];
  data.transactions.forEach((raw, i) => {
    const t = checkTransaction(raw, i, problems);
    if (t) txs.push(t);
  });

  const byId = new Map<string, Transaction>();
  for (const t of txs) {
    if (byId.has(t.id)) problems.push(`Duplicate transaction id ${t.id}.`);
    if (!userIds.has(t.userId)) problems.push(`Transaction of ${t.stockName} on ${t.date} belongs to an unknown user.`);
    byId.set(t.id, t);
  }

  const allocs: Allocation[] = [];
  const allocIds = new Set<string>();
  data.allocations.forEach((raw, i) => {
    const label = `Allocation #${i + 1}`;
    if (!isObj(raw) || !isStr(raw.id) || !isStr(raw.sellId) || !isStr(raw.lotId) || !isPosInt(raw.quantity)) {
      problems.push(`${label} is malformed.`);
      return;
    }
    if (allocIds.has(raw.id)) problems.push(`${label}: duplicate id.`);
    allocIds.add(raw.id);
    const sell = byId.get(raw.sellId);
    const lot = byId.get(raw.lotId);
    if (!sell || sell.type !== 'SELL') problems.push(`${label}: sell transaction not found.`);
    else if (!lot || lot.type !== 'BUY') problems.push(`${label}: buy lot not found.`);
    else if (sell.stockKey !== lot.stockKey) problems.push(`${label}: sell and lot are different stocks.`);
    else if (sell.userId !== lot.userId) problems.push(`${label}: sell and lot belong to different users.`);
    allocs.push(raw as unknown as Allocation);
  });

  const perLot = new Map<string, number>();
  const perSell = new Map<string, number>();
  for (const a of allocs) {
    perLot.set(a.lotId, (perLot.get(a.lotId) ?? 0) + a.quantity);
    perSell.set(a.sellId, (perSell.get(a.sellId) ?? 0) + a.quantity);
  }
  for (const t of txs) {
    if (t.type === 'BUY' && (perLot.get(t.id) ?? 0) > t.quantity) {
      problems.push(`Buy of ${t.stockName} on ${t.date} is sold more than its quantity.`);
    }
    if (t.type === 'SELL' && (perSell.get(t.id) ?? 0) !== t.quantity) {
      problems.push(`Sell of ${t.stockName} on ${t.date} has allocations that do not add up to its quantity.`);
    }
  }

  const prices: PriceQuote[] = [];
  if (data.prices !== undefined) {
    if (!Array.isArray(data.prices)) {
      problems.push('Prices must be a list.');
    } else {
      const seen = new Set<string>();
      data.prices.forEach((raw, i) => {
        const label = `Price #${i + 1}`;
        if (
          !isObj(raw) ||
          !isStr(raw.symbol) ||
          raw.stockKey !== normalizeStockName(String(raw.symbol)) ||
          typeof raw.price !== 'number' ||
          !Number.isFinite(raw.price) ||
          raw.price <= 0 ||
          !isStr(raw.updatedAt)
        ) {
          problems.push(`${label} is malformed.`);
          return;
        }
        if (seen.has(raw.stockKey as string)) problems.push(`${label}: duplicate stock.`);
        seen.add(raw.stockKey as string);
        prices.push(raw as unknown as PriceQuote);
      });
    }
  }

  if (problems.length) {
    const shown = problems.slice(0, 10);
    if (problems.length > shown.length) shown.push(`...and ${problems.length - shown.length} more.`);
    throw new BackupError('The backup file failed validation. Nothing was changed.', shown);
  }
  return { ...(data as unknown as BackupFile), prices };
}

/** Backs up the whole device: every user. */
export class BackupService {
  constructor(private readonly repo: Repository) {}

  async exportJson(): Promise<string> {
    const [users, transactions, allocations, prices] = await Promise.all([
      this.repo.listUsers(),
      this.repo.listTransactions(),
      this.repo.listAllocations(),
      this.repo.listPrices(),
    ]);
    const file: BackupFile = {
      app: APP_ID,
      version: VERSION,
      exportedAt: new Date().toISOString(),
      users,
      transactions,
      allocations,
      prices,
    };
    return JSON.stringify(file, null, 2);
  }

  /** Parse and validate without writing anything. */
  parse(text: string): BackupFile {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new BackupError('The file is not valid JSON.');
    }
    return validateBackup(data);
  }

  async importFile(file: BackupFile): Promise<void> {
    await this.repo.replaceAll(file.users, file.transactions, file.allocations, file.prices ?? []);
  }
}
