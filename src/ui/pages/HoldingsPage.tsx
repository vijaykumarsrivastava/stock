import { useMemo } from 'react';
import { formatInr } from '../../domain/money';
import { realizedByStock } from '../../domain/pnl';
import { PlText } from '../components/PlText';
import { useData } from '../DataContext';

interface Props {
  onOpenStock: (stockName: string) => void;
  onAdd: () => void;
}

export function HoldingsPage({ onOpenStock, onAdd }: Props) {
  const { holdings, transactions, allocations } = useData();

  const pl = useMemo(() => realizedByStock(transactions, allocations), [transactions, allocations]);
  const heldKeys = new Set(holdings.map((h) => h.stockKey));
  const soldOut = [...pl.stocks.values()]
    .filter((s) => !heldKeys.has(s.stockKey))
    .sort((a, b) => a.stockName.localeCompare(b.stockName));

  return (
    <div className="page">
      <h2>My stocks</h2>

      {transactions.length > 0 && (
        <div className="card total-card">
          <div className="card-title">Overall realized profit / loss</div>
          <div className="total-value">
            <PlText value={pl.total} label={false} />
          </div>
        </div>
      )}

      {holdings.length === 0 ? (
        <div className="empty">
          <p>{transactions.length === 0 ? 'No stocks yet.' : 'No stocks currently held.'}</p>
          <button className="btn primary" onClick={onAdd}>
            {transactions.length === 0 ? 'Add your first buy' : 'Add a buy'}
          </button>
        </div>
      ) : (
        <ul className="list">
          <li className="list-head">
            <span>Stock</span>
            <span>Avg price</span>
            <span>Qty</span>
          </li>
          {holdings.map((h) => (
            <li key={h.stockKey}>
              <button className="list-row" onClick={() => onOpenStock(h.stockName)}>
                <span className="name">{h.stockName}</span>
                <span>{formatInr(h.averagePrice)}</span>
                <span>{h.totalQuantity}</span>
                <span className="pl-line">
                  Realized P/L: <PlText value={pl.stocks.get(h.stockKey)?.realizedPl ?? 0} label={false} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {soldOut.length > 0 && (
        <>
          <h3>Fully sold</h3>
          <ul className="list">
            {soldOut.map((s) => (
              <li key={s.stockKey}>
                <button className="list-row sold-row" onClick={() => onOpenStock(s.stockName)}>
                  <span className="name">{s.stockName}</span>
                  <span className="pl-right">
                    <PlText value={s.realizedPl} label={false} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <button className="fab" onClick={onAdd} aria-label="Add transaction">
        +
      </button>
    </div>
  );
}
