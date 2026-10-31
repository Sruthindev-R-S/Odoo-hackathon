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
        isNegative ? 'text-[#C2362F]' : 'text-[#16233B]'
      } ${className}`}
    >
      {isNegative ? `-${formatted}` : formatted}
    </span>
  );
}

