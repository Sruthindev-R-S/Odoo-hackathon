import { formatMoney } from '../../lib/format';

export default function MoneyText({
  amount,
  currency = 'INR',
  className = '',
  isNegative = false,
}) {
  const formatted = formatMoney(amount, currency);

  return (
    <span
      className={`tabular-nums font-medium ${
        isNegative ? 'text-red-600' : 'text-zinc-900'
      } ${className}`}
    >
      {isNegative ? `-${formatted}` : formatted}
    </span>
  );
}

