import { normalizeStockName } from '../domain/money';
import type { Allocation, Transaction } from '../domain/types';
import type { Repository } from '../storage/repository';

const APP_ID = 'stock-tracker';
const VERSION = 1;

export interface BackupFile {
  app: string;
  version: number;
  exportedAt: string;
  transactions: Transaction[];
  allocations: Allocation[];
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

function checkTransaction(raw: unknown, i: number, problems: string[]): Transaction | null {
  const label = `Transaction #${i + 1}`;
  if (!isObj(raw)) {
    problems.push(`${label} is not an object.`);
    return null;
  }
  const { id, type, stockKey, stockName, quantity, price, date, createdAt } = raw;
  const before = problems.length;
  if (!isStr(id)) problems.push(`${label}: missing id.`);
  if (type !== 'BUY' && type !== 'SELL') problems.push(`${label}: type must be BUY or SELL.`);
  if (!isStr(stockName)) problems.push(`${label}: missing stock name.`);
  else if (stockKey !== normalizeStockName(stockName)) problems.push(`${label}: stock key does not match the name.`);
  if (!isPosInt(quantity)) problems.push(`${label}: quantity must be a positive whole number.`);
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) problems.push(`${label}: price must be greater than 0.`);
  if (!isStr(date) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) problems.push(`${label}: date must be yyyy-mm-dd.`);
  if (!isStr(createdAt)) problems.push(`${label}: missing createdAt.`);
  return problems.length === before ? (raw as unknown as Transaction) : null;
}

/** Validate the structure and lot consistency of parsed backup data. */
export function validateBackup(data: unknown): BackupFile {
  if (!isObj(data)) throw new BackupError('The file is not a valid backup.');
  if (data.app !== APP_ID) throw new BackupError('This file was not exported by Stock Tracker.');
  if (data.version !== VERSION) throw new BackupError(`Unsupported backup version: ${String(data.version)}.`);
  if (!Array.isArray(data.transactions) || !Array.isArray(data.allocations)) {
    throw new BackupError('The backup is missing transactions or allocations.');
  }

  const problems: string[] = [];
  const txs: Transaction[] = [];
  data.transactions.forEach((raw, i) => {
    const t = checkTransaction(raw, i, problems);
    if (t) txs.push(t);
  });

  const byId = new Map<string, Transaction>();
  for (const t of txs) {
    if (byId.has(t.id)) problems.push(`Duplicate transaction id ${t.id}.`);
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

  if (problems.length) {
    const shown = problems.slice(0, 10);
    if (problems.length > shown.length) shown.push(`...and ${problems.length - shown.length} more.`);
    throw new BackupError('The backup file failed validation. Nothing was changed.', shown);
  }
  return data as unknown as BackupFile;
}

export class BackupService {
  constructor(private readonly repo: Repository) {}

  async exportJson(): Promise<string> {
    const [transactions, allocations] = await Promise.all([
      this.repo.listTransactions(),
      this.repo.listAllocations(),
    ]);
    const file: BackupFile = {
      app: APP_ID,
      version: VERSION,
      exportedAt: new Date().toISOString(),
      transactions,
      allocations,
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
    await this.repo.replaceAll(file.transactions, file.allocations);
  }
}
