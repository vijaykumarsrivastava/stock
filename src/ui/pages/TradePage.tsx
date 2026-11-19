import { useMemo, useState } from 'react';
import { availableLots, computeHoldings, computeLots, lastOfType } from '../../domain/lots';
import {
  cleanStockName,
  formatInr,
  fromPaise,
  normalizeStockName,
  toPaise,
  todayIso,
} from '../../domain/money';
import type { AllocationInput, Transaction, TxType } from '../../domain/types';
import { hasErrors, validateTrade } from '../../domain/validation';
import { TradeError } from '../../services/tradeService';
import { Dialog } from '../components/Dialog';
import { PlText } from '../components/PlText';
import { LotTable } from '../components/LotTable';
import { useData } from '../DataContext';

interface Props {
  /** Pre-selected stock (from the holdings list). */
  initialStockName?: string;
  /** Transaction being edited. */
  editId?: string;
  onDone: () => void;
}

function LastCard({ title, tx }: { title: string; tx: Transaction | null }) {
  return (
    <div className="card">
      <div className="card-title">{title}</div>
      {tx ? (
        <>
          <div>
            {tx.quantity} @ {formatInr(tx.price)}
          </div>
          <div className="muted">{tx.date}</div>
        </>
      ) : (
        <div className="muted">NA</div>
      )}
    </div>
  );
}

export function TradePage({ initialStockName, editId, onDone }: Props) {
  const { transactions, allocations, stockNames, trade, prices, reload } = useData();

  const editing = useMemo(
    () => (editId ? transactions.find((t) => t.id === editId) : undefined),
    [editId, transactions],
  );

  const [type, setType] = useState<TxType>(editing?.type ?? 'BUY');
  const [stockName, setStockName] = useState(editing?.stockName ?? initialStockName ?? '');
  const [quantity, setQuantity] = useState(editing ? String(editing.quantity) : '');
  const [price, setPrice] = useState(editing ? String(editing.price) : '');
  const [date, setDate] = useState(editing?.date ?? todayIso());
  const [picked, setPicked] = useState<Record<string, string>>(() => {
    if (editing?.type !== 'SELL') return {};
    const out: Record<string, string> = {};
    for (const a of allocations) if (a.sellId === editing.id) out[a.lotId] = String(a.quantity);
    return out;
  });
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ title: string; details: string[] } | null>(null);

  // When editing a sell, its own allocations are released so those lots show their restored quantity.
  const lots = useMemo(
    () => computeLots(transactions, allocations, editing?.type === 'SELL' ? editing.id : undefined),
    [transactions, allocations, editing],
  );
  const sellableStocks = useMemo(() => computeHoldings(lots), [lots]);

  const stockKey = normalizeStockName(stockName);
  const stockLots = useMemo(() => availableLots(lots, stockKey), [lots, stockKey]);
  const lastBuy = useMemo(() => lastOfType(transactions, stockKey, 'BUY'), [transactions, stockKey]);
  const lastSell = useMemo(() => lastOfType(transactions, stockKey, 'SELL'), [transactions, stockKey]);

  const qtyNum = quantity.trim() === '' ? NaN : Number(quantity);
  const priceNum = price.trim() === '' ? NaN : Number(price);
  const errors = validateTrade({ type, stockName, quantity: qtyNum, price: priceNum, date });

  const allocationInputs: AllocationInput[] = Object.entries(picked)
    .filter(([, v]) => v.trim() !== '' && Number(v) !== 0)
    .map(([lotId, v]) => ({ lotId, quantity: Number(v) }));
  const allocated = allocationInputs.reduce((s, a) => s + (Number.isFinite(a.quantity) ? a.quantity : 0), 0);
  const sellQty = Number.isInteger(qtyNum) ? qtyNum : 0;
  const toAllocate = sellQty - allocated;
  const lotById = new Map(lots.map((l) => [l.id, l]));
  const allocationValid =
    allocationInputs.length > 0 &&
    toAllocate === 0 &&
    allocationInputs.every((a) => {
      const l = lotById.get(a.lotId);
      return !!l && Number.isInteger(a.quantity) && a.quantity > 0 && a.quantity <= l.remaining;
    });

  // Live estimate of realized profit or loss for the lots picked so far.
  const estimatedPl = (() => {
    if (!Number.isFinite(priceNum) || priceNum <= 0) return null;
    let paise = 0;
    let any = false;
    for (const a of allocationInputs) {
      const l = lotById.get(a.lotId);
      if (!l || !Number.isInteger(a.quantity) || a.quantity <= 0 || a.quantity > l.remaining) continue;
      paise += (toPaise(priceNum) - toPaise(l.price)) * a.quantity;
      any = true;
    }
    return any ? fromPaise(paise) : null;
  })();

  const sellStockUnknown = type === 'SELL' && stockName !== '' && !sellableStocks.some((h) => h.stockKey === stockKey);

  const changeType = (next: TxType) => {
    if (editing) return;
    setType(next);
    setPicked({});
    setNotice(null);
    if (next === 'SELL' && !sellableStocks.some((h) => h.stockKey === stockKey)) setStockName('');
  };

  const changeStock = (name: string) => {
    setStockName(name);
    setPicked({});
    setNotice(null);
  };

  const save = async () => {
    setSubmitted(true);
    setNotice(null);
    if (hasErrors(errors)) return;
    if (type === 'SELL' && !allocationValid) return;
    setBusy(true);
    try {
      const input = { type, stockName: cleanStockName(stockName), quantity: qtyNum, price: priceNum, date };
      const allocs = type === 'SELL' ? allocationInputs : [];
      const result = editing
        ? await trade.editTrade(editing.id, input, allocs)
        : await trade.addTrade(input, allocs);
      await reload();
      if (editing) {
        onDone();
        return;
      }
      const pl = result.realizedPL;
      setNotice(
        pl === undefined
          ? 'Buy saved.'
          : `Sell saved. Realized ${pl >= 0 ? 'profit' : 'loss'}: ${formatInr(Math.abs(pl))}`,
      );
      setQuantity('');
      setPrice('');
      setPicked({});
      setSubmitted(false);
    } catch (e) {
      if (e instanceof TradeError) setProblem({ title: e.message, details: e.details });
      else setProblem({ title: 'Could not save, nothing was changed.', details: [] });
    } finally {
      setBusy(false);
    }
  };

  const show = (msg?: string) => (submitted && msg ? <div className="field-error">{msg}</div> : null);

  return (
    <div className="page">
      <h2>{editing ? `Edit ${type === 'BUY' ? 'buy' : 'sell'}` : 'Buy / Sell'}</h2>

      <div className="segmented" role="tablist">
        <button
          className={type === 'BUY' ? 'active buy' : ''}
          onClick={() => changeType('BUY')}
          disabled={!!editing && type !== 'BUY'}
        >
          Buy
        </button>
        <button
          className={type === 'SELL' ? 'active sell' : ''}
          onClick={() => changeType('SELL')}
          disabled={!!editing && type !== 'SELL'}
        >
          Sell
        </button>
      </div>

      <label className="field">
        <span>Stock</span>
        {type === 'BUY' ? (
          <>
            <input
              list="stock-names"
              value={stockName}
              placeholder="e.g. Reliance"
              autoComplete="off"
              onChange={(e) => changeStock(e.target.value)}
            />
            <datalist id="stock-names">
              {stockNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </>
        ) : (
          <select value={stockKey} onChange={(e) => {
            const h = sellableStocks.find((s) => s.stockKey === e.target.value);
            changeStock(h ? h.stockName : '');
          }}>
            <option value="">Select a stock you own</option>
            {sellableStocks.map((h) => (
              <option key={h.stockKey} value={h.stockKey}>
                {h.stockName} ({h.totalQuantity} available)
              </option>
            ))}
          </select>
        )}
        {show(errors.stockName)}
        {sellStockUnknown && <div className="field-error">You have no shares of this stock to sell.</div>}
      </label>

      <div className="row">
        <label className="field">
          <span>Quantity</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          {show(errors.quantity)}
        </label>
        <label className="field">
          <span>Price (₹)</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          {show(errors.price)}
        </label>
      </div>

      <label className="field">
        <span>Date</span>
        <input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
        {show(errors.date)}
      </label>

      {stockKey && (
        <div className="row cards">
          <LastCard title="Last buy" tx={lastBuy} />
          <LastCard title="Last sell" tx={lastSell} />
        </div>
      )}

      {type === 'SELL' && stockKey && (
        <div className={`alloc-summary ${toAllocate === 0 && allocationInputs.length ? 'ok' : ''}`}>
          Allocated {allocated} / Sell {sellQty || 0}
          {toAllocate > 0 && `, ${toAllocate} left to allocate`}
          {toAllocate < 0 && `, ${-toAllocate} too many`}
          {estimatedPl !== null && (
            <div>
              Estimated <PlText value={estimatedPl} />
            </div>
          )}
        </div>
      )}
      {submitted && type === 'SELL' && !allocationValid && (
        <div className="field-error">
          Pick lots below so the allocated total equals the sell quantity and no lot exceeds its remaining shares.
        </div>
      )}

      <button className="btn primary wide" onClick={save} disabled={busy}>
        {editing ? 'Save changes' : type === 'BUY' ? 'Save buy' : 'Save sell'}
      </button>
      {editing && (
        <button className="btn wide" onClick={onDone}>
          Cancel
        </button>
      )}
      {notice && <div className="notice">{notice}</div>}

      {stockKey && (
        <>
          <h3>{type === 'SELL' ? 'Choose lots to sell from' : 'Available shares'}</h3>
          <LotTable
            lots={stockLots}
            picker={
              type === 'SELL'
                ? {
                    sellQuantity: sellQty,
                    sellPrice: priceNum,
                    currentPrice: prices.get(stockKey),
                    values: picked,
                    onChange: (lotId, value) => setPicked((p) => ({ ...p, [lotId]: value })),
                  }
                : undefined
            }
          />
        </>
      )}

      {problem && (
        <Dialog title={problem.title} details={problem.details} onClose={() => setProblem(null)} />
      )}
    </div>
  );
}
