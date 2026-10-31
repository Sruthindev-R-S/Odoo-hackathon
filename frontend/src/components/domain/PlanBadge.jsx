import Badge from '../ui/Badge';
import { getPlanAvailability } from '../../lib/format';

export default function PlanBadge({ availableFrom, availableTo }) {
  const status = getPlanAvailability(availableFrom, availableTo);

  if (status === 'active') {
    return (
      <Badge variant="success" size="sm">
        <span className="w-1.5 h-1.5 rounded-full bg-[#2E7D4F]" />
        Available now
      </Badge>
    );
  }

  if (status === 'upcoming') {
    return (
      <Badge variant="info" size="sm">
        <span className="w-1.5 h-1.5 rounded-full bg-[#3B64C4]" />
        Scheduled
      </Badge>
    );
  }

  return (
    <Badge variant="neutral" size="sm">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
      Expired
    </Badge>
  );
}

