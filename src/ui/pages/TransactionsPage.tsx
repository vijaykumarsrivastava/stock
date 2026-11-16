import { useMemo, useState } from 'react';
import { formatInr } from '../../domain/money';
import type { Transaction } from '../../domain/types';
import { sellBreakdowns } from '../../domain/pnl';
import { TradeError } from '../../services/tradeService';
import { Dialog } from '../components/Dialog';
import { PlText } from '../components/PlText';
import { useData } from '../DataContext';

interface Props {
  onEdit: (id: string) => void;
}

export function TransactionsPage({ onEdit }: Props) {
  const { transactions, allocations, trade, reload } = useData();
  const [toDelete, setToDelete] = useState<Transaction | null>(null);
  const [problem, setProblem] = useState<{ title: string; details: string[] } | null>(null);

  const breakdowns = useMemo(() => sellBreakdowns(transactions, allocations), [transactions, allocations]);
  const rows = useMemo(
    () =>
      [...transactions].sort(
        (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
      ),
    [transactions],
  );

  const confirmDelete = async () => {
    if (!toDelete) return;
    const target = toDelete;
    setToDelete(null);
    try {
      await trade.deleteTrade(target.id);
      await reload();
    } catch (e) {
      if (e instanceof TradeError) setProblem({ title: e.message, details: e.details });
      else setProblem({ title: 'Could not delete, nothing was changed.', details: [] });
    }
  };

  return (
    <div className="page">
      <h2>Transactions</h2>
      {rows.length === 0 && <p className="muted">No transactions yet.</p>}
      <ul className="tx-list">
        {rows.map((t) => {
          const b = breakdowns.get(t.id);
          return (
            <li key={t.id} className="tx">
              <div className="tx-main">
                <span className={`badge ${t.type === 'BUY' ? 'buy' : 'sell'}`}>{t.type}</span>
                <strong>{t.stockName}</strong>
                <span className="muted">{t.date}</span>
              </div>
              <div>
                {t.quantity} @ {formatInr(t.price)}
              </div>
              {b && (
                <div className="sell-detail">
                  <div className="muted">Sold from these buys:</div>
                  {b.lines.map((l, i) => (
                    <div key={i} className="sell-line">
                      <span>
                        {l.quantity} × bought {l.lot.date} @ {formatInr(l.lot.price)}
                      </span>
                      <PlText value={l.pl} label={false} />
                    </div>
                  ))}
                  <div className="sell-total">
                    <span>Total</span>
                    <PlText value={b.totalPl} />
                  </div>
                </div>
              )}
              <div className="tx-actions">
                <button className="btn small" onClick={() => onEdit(t.id)}>
                  Edit
                </button>
                <button className="btn small danger" onClick={() => setToDelete(t)}>
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {toDelete && (
        <Dialog
          title="Delete this transaction?"
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onClose={() => setToDelete(null)}
        >
          <p>
            {toDelete.type} {toDelete.quantity} {toDelete.stockName} @ {formatInr(toDelete.price)} on{' '}
            {toDelete.date}
          </p>
        </Dialog>
      )}
      {problem && <Dialog title={problem.title} details={problem.details} onClose={() => setProblem(null)} />}
    </div>
  );
}
