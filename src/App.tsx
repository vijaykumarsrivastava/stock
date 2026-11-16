import { useState } from 'react';
import { DataProvider } from './ui/DataContext';
import { BackupPage } from './ui/pages/BackupPage';
import { HoldingsPage } from './ui/pages/HoldingsPage';
import { TradePage } from './ui/pages/TradePage';
import { TransactionsPage } from './ui/pages/TransactionsPage';

type Tab = 'holdings' | 'trade' | 'transactions' | 'backup';

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
  { key: 'backup', label: 'Backup' },
];

export default function App() {
  const [view, setView] = useState<View>({ tab: 'holdings', nonce: 0 });

  const go = (tab: Tab, extra: Partial<View> = {}) =>
    setView((v) => ({ tab, nonce: v.nonce + 1, ...extra }));

  return (
    <DataProvider>
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
        {view.tab === 'backup' && <BackupPage />}
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
    </DataProvider>
  );
}
