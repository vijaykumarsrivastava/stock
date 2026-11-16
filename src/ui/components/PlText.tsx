import { formatInr } from '../../domain/money';

/** Signed, colored profit or loss amount. */
export function PlText({ value, label = true }: { value: number; label?: boolean }) {
  const cls = value > 0 ? 'profit' : value < 0 ? 'loss' : 'muted';
  const word = value >= 0 ? 'Profit' : 'Loss';
  return (
    <span className={cls}>
      {label ? `${word}: ` : value > 0 ? '+' : value < 0 ? '-' : ''}
      {formatInr(Math.abs(value))}
    </span>
  );
}
