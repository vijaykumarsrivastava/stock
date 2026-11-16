import { useState } from 'react';
import { defaultAllocationQuantity } from '../../domain/allocation';
import { sortLots } from '../../domain/lots';
import { formatInr, fromPaise, toPaise } from '../../domain/money';
import type { Lot, LotSortColumn, SortDirection } from '../../domain/types';
import { PlText } from './PlText';

interface Props {
  lots: Lot[];
  /** When set, the table doubles as the lot picker for a sell. */
  picker?: {
    sellQuantity: number;
    /** Sell price typed by the user, NaN when not valid yet. */
    sellPrice: number;
    /** lotId -> quantity text typed by the user */
    values: Record<string, string>;
    onChange: (lotId: string, value: string) => void;
  };
}

const COLUMNS: { key: LotSortColumn; label: string }[] = [
  { key: 'date', label: 'Date' },
  { key: 'price', label: 'Price' },
  { key: 'quantity', label: 'Bought' },
  { key: 'remaining', label: 'Left' },
];

export function LotTable({ lots, picker }: Props) {
  const [column, setColumn] = useState<LotSortColumn>('price');
  const [direction, setDirection] = useState<SortDirection>('desc');

  const rows = sortLots(lots, column, direction);

  const toggle = (c: LotSortColumn) => {
    if (c === column) {
      setDirection(direction === 'asc' ? 'desc' : 'asc');
    } else {
      setColumn(c);
      setDirection('desc');
    }
  };

  const allocatedSoFar = (exceptLotId: string) =>
    Object.entries(picker?.values ?? {}).reduce(
      (s, [id, v]) => (id === exceptLotId ? s : s + (Number(v) || 0)),
      0,
    );

  if (rows.length === 0) {
    return <p className="muted">No shares available for this stock.</p>;
  }

  return (
    <div className="table-wrap">
      <table className="lots">
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th key={c.key}>
                <button
                  className="sort-btn"
                  onClick={() => toggle(c.key)}
                  aria-label={`Sort by ${c.label}`}
                >
                  {c.label}
                  {c.key === column ? (direction === 'asc' ? ' ▲' : ' ▼') : ''}
                </button>
              </th>
            ))}
            {picker && <th>Sell qty</th>}
            {picker && <th>P/L</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => {
            const typed = picker?.values[l.id] ?? '';
            const qty = Number(typed);
            const over = picker && typed !== '' && (!Number.isInteger(qty) || qty < 0 || qty > l.remaining);
            return (
              <tr key={l.id} className={typed !== '' && qty > 0 ? 'selected' : ''}>
                <td>{l.date}</td>
                <td>{formatInr(l.price)}</td>
                <td>{l.quantity}</td>
                <td>{l.remaining}</td>
                {picker && (
                  <td className="pick-cell">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={l.remaining}
                      step={1}
                      value={typed}
                      aria-label={`Quantity to sell from lot of ${l.date} at ${l.price}`}
                      className={over ? 'invalid' : ''}
                      onChange={(e) => picker.onChange(l.id, e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn small"
                      onClick={() => {
                        const q = defaultAllocationQuantity(l, picker.sellQuantity, allocatedSoFar(l.id));
                        picker.onChange(l.id, q > 0 ? String(q) : '');
                      }}
                    >
                      Fill
                    </button>
                  </td>
                )}
                {picker && (
                  <td>
                    {!over && qty > 0 && Number.isFinite(picker.sellPrice) && picker.sellPrice > 0 ? (
                      <PlText
                        value={fromPaise((toPaise(picker.sellPrice) - toPaise(l.price)) * qty)}
                        label={false}
                      />
                    ) : (
                      <span className="muted">-</span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
