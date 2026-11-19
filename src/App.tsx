import { useState } from 'react';
import { DataProvider, useSession } from './ui/DataContext';
import { DataPage } from './ui/pages/DataPage';
import { HoldingsPage } from './ui/pages/HoldingsPage';
import { TradePage } from './ui/pages/TradePage';
import { TransactionsPage } from './ui/pages/TransactionsPage';
import { UserPage } from './ui/pages/UserPage';

type Tab = 'holdings' | 'trade' | 'transactions' | 'data';

interface View {
  tab: Tab;
  stockName?: string;
  editId?: string;
  /** Changes to force the Trade form to reset. */
  nonce: number;
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'holdings', label: 'Stocks' },
  { key: 'trade', label: 'Trade' },
  { key: 'transactions', label: 'History' },
  { key: 'data', label: 'Data' },
];

function MainApp() {
  const { currentUser, switchUser } = useSession();
  const [view, setView] = useState<View>({ tab: 'holdings', nonce: 0 });

  const go = (tab: Tab, extra: Partial<View> = {}) =>
    setView((v) => ({ tab, nonce: v.nonce + 1, ...extra }));

  return (
    <>
      <header className="topbar">
        <span>
          User: <strong>{currentUser?.name}</strong>
        </span>
        <button className="btn small" onClick={switchUser}>
          Switch user
        </button>
      </header>
      <main>
        {view.tab === 'holdings' && (
          <HoldingsPage
            onOpenStock={(name) => go('trade', { stockName: name })}
            onAdd={() => go('trade')}
          />
        )}
        {view.tab === 'trade' && (
          <TradePage
            key={view.nonce}
            initialStockName={view.stockName}
            editId={view.editId}
            onDone={() => go(view.editId ? 'transactions' : 'holdings')}
          />
        )}
        {view.tab === 'transactions' && <TransactionsPage onEdit={(id) => go('trade', { editId: id })} />}
        {view.tab === 'data' && <DataPage />}
      </main>
      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={view.tab === t.key ? 'active' : ''}
            onClick={() => go(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </>
  );
}

function Gate() {
  const { currentUser } = useSession();
  // Keyed by user so view state (tab, form) resets when the user changes.
  return currentUser ? <MainApp key={currentUser.id} /> : <UserPage />;
}

export default function App() {
  return (
    <DataProvider>
      <Gate />
    </DataProvider>
  );
}
