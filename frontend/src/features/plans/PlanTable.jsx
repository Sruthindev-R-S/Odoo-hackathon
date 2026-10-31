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
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
      <table className="w-full text-left text-sm text-slate-600">
        <thead className="bg-[#F5F7FA] text-xs uppercase font-semibold text-[#16233B] border-b border-slate-200 tracking-wider">
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
        <tbody className="divide-y divide-slate-100">
          {plans.map((plan) => (
            <tr
              key={plan.id}
              className="hover:bg-slate-50/80 transition-colors group"
            >
              {/* Plan & Product */}
              <td className="px-5 py-4">
                <div className="font-bold text-[#16233B]">
                  {plan.name}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Product:{' '}
                  <span className="font-medium text-slate-700">
                    {plan.productName || 'Unassigned'}
                  </span>
                </div>
              </td>

              {/* Price / Period */}
              <td className="px-4 py-4 text-right whitespace-nowrap">
                <div className="font-bold text-[#16233B]">
                  <MoneyText amount={plan.price} />
                </div>
                <div className="text-xs text-slate-400 capitalize">
                  / {plan.billingPeriod}
                </div>
              </td>

              {/* Min Qty */}
              <td className="px-4 py-4 text-center whitespace-nowrap">
                <span className="inline-block text-xs font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md tabular-nums">
                  {plan.minQuantity || 1} min
                </span>
              </td>

              {/* Availability Window */}
              <td className="px-5 py-4 whitespace-nowrap text-xs text-slate-600">
                {plan.availableFrom || plan.availableTo ? (
                  <div className="space-y-0.5">
                    <div>
                      From: <span className="font-medium text-slate-800">{formatDate(plan.availableFrom)}</span>
                    </div>
                    <div>
                      To: <span className="font-medium text-slate-800">{formatDate(plan.availableTo) || 'Ongoing'}</span>
                    </div>
                  </div>
                ) : (
                  <span className="text-slate-400 italic">Always available</span>
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
                      className="inline-flex items-center gap-1 text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded"
                      title="Closes automatically when it ends"
                    >
                      <Clock className="w-3 h-3 text-slate-500" /> Auto-close
                    </span>
                  )}
                  {plan.allowEarlyClose && (
                    <span
                      className="inline-flex items-center gap-1 text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded"
                      title="Can be closed early"
                    >
                      <ShieldAlert className="w-3 h-3 text-slate-500" /> Early close
                    </span>
                  )}
                  {plan.allowPause && (
                    <span
                      className="inline-flex items-center gap-1 text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded"
                      title="Can be paused"
                    >
                      <PauseCircle className="w-3 h-3 text-emerald-600" /> Pausable
                    </span>
                  )}
                  {plan.allowRenewal && (
                    <span
                      className="inline-flex items-center gap-1 text-[11px] bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded"
                      title="Can be renewed"
                    >
                      <Repeat className="w-3 h-3 text-teal-600" /> Renewable
                    </span>
                  )}
                </div>
              </td>

              {/* Actions */}
              <td className="px-4 py-4 text-right whitespace-nowrap">
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => onEdit(plan)}
                    className="p-1.5 text-slate-500 hover:text-[#0E7C86] hover:bg-slate-100 rounded-md transition-colors"
                    title="Edit plan"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDelete(plan)}
                    className="p-1.5 text-slate-500 hover:text-[#C2362F] hover:bg-red-50 rounded-md transition-colors"
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
