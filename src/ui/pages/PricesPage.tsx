import { useMemo, useRef, useState } from 'react';
import { formatInr, normalizeStockName } from '../../domain/money';
import { formatDateTime, parsePrices } from '../../domain/prices';
import { useData } from '../DataContext';

const PLACEHOLDER = 'ULTRACEMCO;12,560.00\nITC;301.00';

export function PricesPage() {
  const { prices, holdings, savePrices } = useData();
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => parsePrices(text), [text]);
  const heldKeys = useMemo(() => new Set(holdings.map((h) => h.stockKey)), [holdings]);
  const unpriced = holdings.filter((h) => !prices.has(h.stockKey));
  const stored = useMemo(
    () => [...prices.values()].sort((a, b) => a.symbol.localeCompare(b.symbol)),
    [prices],
  );
  const invalidCount = parsed.lines.filter((l) => l.status === 'invalid').length;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setNotice(null);
    setError(null);
    try {
      setText(await file.text());
    } catch {
      setError('Could not read the file.');
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const save = async () => {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const at = await savePrices(parsed.valid);
      setNotice(`Saved ${parsed.valid.length} prices on ${formatDateTime(at)}.`);
      setText('');
    } catch {
      setError('Could not save the prices. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <h2>Current prices</h2>
      <p className="muted">
        One stock per line as <code>NAME;PRICE</code>. The name must match the stock name used in your trades
        (ignoring capital letters). Commas inside a price are fine.
      </p>

      <textarea
        className="price-input"
        rows={6}
        value={text}
        placeholder={PLACEHOLDER}
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value);
          setNotice(null);
        }}
      />
      <button className="btn wide" onClick={() => fileInput.current?.click()}>
        Load from text file…
      </button>
      <input
        ref={fileInput}
        type="file"
        accept=".txt,.csv,text/plain,text/csv"
        hidden
        onChange={(e) => onFile(e.target.files?.[0])}
      />

      {parsed.lines.length > 0 && (
        <>
          <h3>Preview</h3>
          <ul className="price-lines">
            {parsed.lines.map((l) => (
              <li key={l.lineNumber} className={l.status}>
                <span className="line-no">{l.lineNumber}</span>
                {l.status === 'ok' ? (
                  <span>
                    <strong>{l.symbol}</strong> → {formatInr(l.price!)}
                    {!heldKeys.has(normalizeStockName(l.symbol!)) && (
                      <span className="muted"> (not in your current holdings)</span>
                    )}
                  </span>
                ) : (
                  <span>
                    {l.raw}
                    <div className="field-error">{l.message}</div>
                  </span>
                )}
              </li>
            ))}
          </ul>
          <button className="btn primary wide" disabled={busy || parsed.valid.length === 0} onClick={save}>
            Save {parsed.valid.length} {parsed.valid.length === 1 ? 'price' : 'prices'}
          </button>
          {invalidCount > 0 && (
            <p className="muted">{invalidCount} invalid {invalidCount === 1 ? 'line is' : 'lines are'} skipped.</p>
          )}
        </>
      )}

      {notice && <div className="notice">{notice}</div>}
      {error && <div className="field-error">{error}</div>}

      {unpriced.length > 0 && (
        <p className="field-error">
          No price yet for: {unpriced.map((h) => h.stockName).join(', ')}.
        </p>
      )}

      <h3>Saved prices</h3>
      {stored.length === 0 ? (
        <p className="muted">No prices saved yet.</p>
      ) : (
        <ul className="list">
          <li className="list-head price-row">
            <span>Stock</span>
            <span>Price</span>
            <span>Updated</span>
          </li>
          {stored.map((q) => (
            <li key={q.stockKey} className="price-row">
              <span className="name">{q.symbol}</span>
              <span>{formatInr(q.price)}</span>
              <span className="muted">{formatDateTime(q.updatedAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
