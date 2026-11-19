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
import type { Allocation, Holding, Lot, PriceQuote, Transaction, User } from '../domain/types';
import { makeUser, normalizeUserName, validateUserName } from '../domain/user';
import { BackupService } from '../services/backupService';
import { TradeService } from '../services/tradeService';
import { createRepository } from '../storage';
import type { Repository } from '../storage/repository';

interface SessionCtx {
  backend: string;
  /** true granted, false denied, null not applicable or unknown */
  persisted: boolean | null;
  users: User[];
  currentUser: User | null;
  selectUser: (id: string) => void;
  /** Creates the user and signs in as them. Rejects with a readable message. */
  addUser: (name: string) => Promise<void>;
  switchUser: () => void;
  backup: BackupService;
  /** Current user's transactions (empty when nobody is selected). */
  transactions: Transaction[];
  allocations: Allocation[];
  lots: Lot[];
  holdings: Holding[];
  /** Distinct stock names the current user has entered, for autocomplete. */
  stockNames: string[];
  trade: TradeService | null;
  /** Latest price per stock (shared by all users), keyed by stockKey. */
  prices: Map<string, PriceQuote>;
  /** Save prices, stamped with the current time. Returns the timestamp. */
  savePrices: (items: { symbol: string; stockKey: string; price: number }[]) => Promise<string>;
  reload: () => Promise<void>;
}

/** Context value once a user is selected. */
export type UserDataCtx = SessionCtx & { currentUser: User; trade: TradeService };

const Ctx = createContext<SessionCtx | null>(null);

/** User list, selection and storage info. Usable before a user is chosen. */
export function useSession(): SessionCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession must be used inside DataProvider');
  return v;
}

/** The selected user's data. Only call from screens shown after a user is chosen. */
export function useData(): UserDataCtx {
  const v = useSession();
  if (!v.currentUser || !v.trade) throw new Error('useData requires a selected user');
  return v as UserDataCtx;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [repo, setRepo] = useState<Repository | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [allAllocations, setAllAllocations] = useState<Allocation[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [priceList, setPriceList] = useState<PriceQuote[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await createRepository();
        const p = await r.requestPersistence();
        const [u, t, a, pr] = await Promise.all([
          r.listUsers(),
          r.listTransactions(),
          r.listAllocations(),
          r.listPrices(),
        ]);
        if (cancelled) return;
        setPersisted(p);
        setPriceList(pr);
        setUsers(u);
        setAllTransactions(t);
        setAllAllocations(a);
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
    const [u, t, a, pr] = await Promise.all([
      repo.listUsers(),
      repo.listTransactions(),
      repo.listAllocations(),
      repo.listPrices(),
    ]);
    setPriceList(pr);
    setUsers(u);
    setAllTransactions(t);
    setAllAllocations(a);
    // After an import the selected user may no longer exist.
    setCurrentUserId((id) => (id && u.some((x) => x.id === id) ? id : null));
  }, [repo]);

  const addUser = useCallback(
    async (name: string) => {
      if (!repo) return;
      const problem = validateUserName(name);
      if (problem) throw new Error(problem);
      const key = normalizeUserName(name);
      if (users.some((u) => u.nameKey === key)) {
        throw new Error('A user with this name already exists. Pick them from the list.');
      }
      const user = makeUser(name);
      await repo.saveUser(user);
      setUsers((prev) => [...prev, user]);
      setCurrentUserId(user.id);
    },
    [repo, users],
  );

  const savePrices = useCallback(
    async (items: { symbol: string; stockKey: string; price: number }[]) => {
      if (!repo) throw new Error('Storage is not ready.');
      const updatedAt = new Date().toISOString();
      const quotes: PriceQuote[] = items.map((i) => ({ ...i, updatedAt }));
      await repo.savePrices(quotes);
      setPriceList((prev) => {
        const map = new Map(prev.map((q) => [q.stockKey, q]));
        for (const q of quotes) map.set(q.stockKey, q);
        return [...map.values()];
      });
      return updatedAt;
    },
    [repo],
  );

  const value = useMemo<SessionCtx | null>(() => {
    if (!repo) return null;
    const currentUser = users.find((u) => u.id === currentUserId) ?? null;
    const transactions = currentUser ? allTransactions.filter((t) => t.userId === currentUser.id) : [];
    const sellIds = new Set(transactions.map((t) => t.id));
    const allocations = allAllocations.filter((a) => sellIds.has(a.sellId));
    const lots = computeLots(transactions, allocations);

    const names = new Map<string, string>();
    for (const t of [...transactions].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      names.set(t.stockKey, t.stockName);
    }

    return {
      backend: repo.backendName,
      persisted,
      users: [...users].sort((a, b) => a.name.localeCompare(b.name)),
      currentUser,
      selectUser: (id: string) => setCurrentUserId(id),
      addUser,
      switchUser: () => setCurrentUserId(null),
      backup: new BackupService(repo),
      transactions,
      allocations,
      lots,
      holdings: computeHoldings(lots),
      stockNames: [...names.values()].sort((a, b) => a.localeCompare(b)),
      trade: currentUser ? new TradeService(repo, currentUser.id) : null,
      prices: new Map(priceList.map((q) => [q.stockKey, q])),
      savePrices,
      reload,
    };
  }, [repo, persisted, users, currentUserId, allTransactions, allAllocations, priceList, addUser, savePrices, reload]);

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
