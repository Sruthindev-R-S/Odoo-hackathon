import { Edit2, Trash2, Repeat, PauseCircle, Clock, ShieldAlert } from 'lucide-react';
import MoneyText from '../../components/domain/MoneyText';
import PlanBadge from '../../components/domain/PlanBadge';
import { formatDate } from '../../lib/format';

export default function PlanTable({
  plans = [],
  onEdit,
  onDelete,
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-2xs">
      <table className="w-full text-left text-sm text-zinc-600">
        <thead className="bg-zinc-50 text-xs uppercase font-semibold text-zinc-900 border-b border-zinc-200 tracking-wider">
          <tr>
            <th scope="col" className="px-5 py-3.5">Plan & Product</th>
            <th scope="col" className="px-4 py-3.5 text-right">Price / Period</th>
            <th scope="col" className="px-4 py-3.5 text-center">Min Qty</th>
            <th scope="col" className="px-5 py-3.5">Availability Window</th>
            <th scope="col" className="px-4 py-3.5 text-center">Status</th>
            <th scope="col" className="px-5 py-3.5">Allowed Behaviors</th>
            <th scope="col" className="px-4 py-3.5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {plans.map((plan) => (
            <tr
              key={plan.id}
              className="hover:bg-zinc-50/80 transition-colors group"
            >
              {/* Plan & Product */}
              <td className="px-5 py-4">
                <div className="font-semibold text-zinc-900">
                  {plan.name}
                </div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  Product:{' '}
                  <span className="font-medium text-zinc-700">
                    {plan.productName || 'Unassigned'}
                  </span>
                </div>
              </td>

              {/* Price / Period */}
              <td className="px-4 py-4 text-right whitespace-nowrap">
                <div className="font-bold text-zinc-900">
                  <MoneyText amount={plan.price} />
                </div>
                <div className="text-xs text-zinc-400 capitalize">
                  / {plan.billingPeriod}
                </div>
              </td>

              {/* Min Qty */}
              <td className="px-4 py-4 text-center whitespace-nowrap">
                <span className="inline-block text-xs font-semibold bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-md tabular-nums border border-zinc-200">
                  {plan.minQuantity || 1} min
                </span>
              </td>

              {/* Availability Window */}
              <td className="px-5 py-4 whitespace-nowrap text-xs text-zinc-600">
                {plan.availableFrom || plan.availableTo ? (
                  <div className="space-y-0.5">
                    <div>
                      From: <span className="font-medium text-zinc-800">{formatDate(plan.availableFrom)}</span>
                    </div>
                    <div>
                      To: <span className="font-medium text-zinc-800">{formatDate(plan.availableTo) || 'Ongoing'}</span>
                    </div>
                  </div>
                ) : (
                  <span className="text-zinc-400 italic">Always available</span>
                )}
              </td>

              {/* Status Badge */}
              <td className="px-4 py-4 text-center whitespace-nowrap">
                <PlanBadge
                  availableFrom={plan.availableFrom}
                  availableTo={plan.availableTo}
                />
              </td>

              {/* Allowed Behaviors (4 switches) */}
              <td className="px-5 py-4">
                <div className="flex flex-wrap gap-1.5 max-w-xs">
                  {plan.autoCloseOnEnd && (
                    <span
                      className="inline-flex items-center gap-1 text-[11px] bg-zinc-100 text-zinc-800 border border-zinc-200 px-2 py-0.5 rounded"
                      title="Closes automatically when it ends"
                    >
                      <Clock className="w-3 h-3 text-zinc-500" /> Auto-close
                    </span>
                  )}
                  {plan.allowEarlyClose && (
                    <span
                      className="inline-flex items-center gap-1 text-[11px] bg-zinc-100 text-zinc-800 border border-zinc-200 px-2 py-0.5 rounded"
                      title="Can be closed early"
                    >
                      <ShieldAlert className="w-3 h-3 text-zinc-500" /> Early close
                    </span>
                  )}
                  {plan.allowPause && (
                    <span
                      className="inline-flex items-center gap-1 text-[11px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded"
                      title="Can be paused"
                    >
                      <PauseCircle className="w-3 h-3 text-emerald-600" /> Pausable
                    </span>
                  )}
                  {plan.allowRenewal && (
                    <span
                      className="inline-flex items-center gap-1 text-[11px] bg-zinc-100 text-zinc-800 border border-zinc-200 px-2 py-0.5 rounded font-medium"
                      title="Can be renewed"
                    >
                      <Repeat className="w-3 h-3 text-zinc-600" /> Renewable
                    </span>
                  )}
                </div>
              </td>

              {/* Actions */}
              <td className="px-4 py-4 text-right whitespace-nowrap">
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => onEdit(plan)}
                    className="p-1.5 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-md transition-colors"
                    title="Edit plan"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDelete(plan)}
                    className="p-1.5 text-zinc-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                    title="Delete plan"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
