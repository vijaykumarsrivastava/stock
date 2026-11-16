import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { computeHoldings, computeLots } from '../domain/lots';
import type { Allocation, Holding, Lot, Transaction } from '../domain/types';
import { BackupService } from '../services/backupService';
import { TradeService } from '../services/tradeService';
import { createRepository } from '../storage';
import type { Repository } from '../storage/repository';

interface DataCtx {
  backend: string;
  /** true granted, false denied, null not applicable or unknown */
  persisted: boolean | null;
  trade: TradeService;
  backup: BackupService;
  transactions: Transaction[];
  allocations: Allocation[];
  lots: Lot[];
  holdings: Holding[];
  /** Distinct stock names ever entered, for autocomplete. */
  stockNames: string[];
  reload: () => Promise<void>;
}

const Ctx = createContext<DataCtx | null>(null);

export function useData(): DataCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData must be used inside DataProvider');
  return v;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [repo, setRepo] = useState<Repository | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await createRepository();
        const p = await r.requestPersistence();
        const [t, a] = await Promise.all([r.listTransactions(), r.listAllocations()]);
        if (cancelled) return;
        setPersisted(p);
        setTransactions(t);
        setAllocations(a);
        setRepo(r);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const reload = useCallback(async () => {
    if (!repo) return;
    const [t, a] = await Promise.all([repo.listTransactions(), repo.listAllocations()]);
    setTransactions(t);
    setAllocations(a);
  }, [repo]);

  const value = useMemo<DataCtx | null>(() => {
    if (!repo) return null;
    const lots = computeLots(transactions, allocations);
    const names = new Map<string, string>();
    for (const t of [...transactions].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      names.set(t.stockKey, t.stockName);
    }
    return {
      backend: repo.backendName,
      persisted,
      trade: new TradeService(repo),
      backup: new BackupService(repo),
      transactions,
      allocations,
      lots,
      holdings: computeHoldings(lots),
      stockNames: [...names.values()].sort((a, b) => a.localeCompare(b)),
      reload,
    };
  }, [repo, persisted, transactions, allocations, reload]);

  if (error) {
    return (
      <div className="screen-message">
        <h2>Could not open storage</h2>
        <p>{error}</p>
      </div>
    );
  }
  if (!value) return <div className="screen-message">Loading…</div>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
