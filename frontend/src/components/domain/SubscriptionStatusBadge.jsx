import Badge from '../ui/Badge';

const SUBSCRIPTION_MAP = {
  draft: { label: 'Draft', variant: 'neutral', dot: 'bg-zinc-400' },
  quotation: { label: 'Quotation', variant: 'outline', dot: 'bg-zinc-600' },
  confirmed: { label: 'Confirmed', variant: 'warning', dot: 'bg-amber-600' },
  active: { label: 'Active', variant: 'success', dot: 'bg-emerald-600' },
  closed: { label: 'Closed', variant: 'loop', dot: 'bg-white' },
};

const INVOICE_MAP = {
  draft: { label: 'Draft', variant: 'neutral', dot: 'bg-zinc-400' },
  confirmed: { label: 'Confirmed', variant: 'warning', dot: 'bg-amber-600' },
  paid: { label: 'Paid', variant: 'success', dot: 'bg-emerald-600' },
  cancelled: { label: 'Cancelled', variant: 'neutral', dot: 'bg-zinc-300' },
};

export function SubscriptionStatusBadge({ status, isPaused = false }) {
  const cfg = SUBSCRIPTION_MAP[status] || SUBSCRIPTION_MAP.draft;

  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap">
      <Badge variant={cfg.variant} size="sm">
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
        {cfg.label}
      </Badge>
      {isPaused && status === 'active' && (
        <Badge variant="warning" size="sm">
          Paused
        </Badge>
      )}
    </div>
  );
}

export function InvoiceStatusBadge({ status, dueDate, amountDue = 0 }) {
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue =
    status === 'confirmed' && amountDue > 0 && dueDate && dueDate < today;

  if (isOverdue) {
    const diffMs =
      new Date(`${today}T00:00:00`).getTime() -
      new Date(`${dueDate}T00:00:00`).getTime();
    const days = Math.max(1, Math.round(diffMs / 86400000));
    return (
      <Badge variant="danger" size="sm">
        <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
        Overdue ({days}d)
      </Badge>
    );
  }

  const cfg = INVOICE_MAP[status] || INVOICE_MAP.draft;
  return (
    <Badge variant={cfg.variant} size="sm">
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </Badge>
  );
}
