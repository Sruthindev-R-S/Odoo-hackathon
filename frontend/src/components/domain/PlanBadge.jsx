import Badge from '../ui/Badge';
import { getPlanAvailability } from '../../lib/format';

export default function PlanBadge({ availableFrom, availableTo }) {
  const status = getPlanAvailability(availableFrom, availableTo);

  if (status === 'active') {
    return (
      <Badge variant="success" size="sm">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
        Available now
      </Badge>
    );
  }

  if (status === 'upcoming') {
    return (
      <Badge variant="neutral" size="sm">
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
        Scheduled
      </Badge>
    );
  }

  return (
    <Badge variant="neutral" size="sm">
      <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
      Expired
    </Badge>
  );
}

