import { Edit2, Trash2, Tag, CheckCircle2, XCircle } from 'lucide-react';
import Badge from '../../components/ui/Badge';
import MoneyText from '../../components/domain/MoneyText';
import { calculateMargin, formatPercent, formatMoney } from '../../lib/format';

export default function ProductTable({
  products = [],
  onEdit,
  onDelete,
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
      <table className="w-full text-left text-sm text-slate-600">
        <thead className="bg-[#F5F7FA] text-xs uppercase font-semibold text-[#16233B] border-b border-slate-200 tracking-wider">
          <tr>
            <th scope="col" className="px-5 py-3.5">Product</th>
            <th scope="col" className="px-4 py-3.5">Type</th>
            <th scope="col" className="px-4 py-3.5 text-right">Sales Price</th>
            <th scope="col" className="px-4 py-3.5 text-right">Cost Price</th>
            <th scope="col" className="px-4 py-3.5 text-right">Margin</th>
            <th scope="col" className="px-5 py-3.5">Variants & Add-ons</th>
            <th scope="col" className="px-4 py-3.5 text-center">Status</th>
            <th scope="col" className="px-4 py-3.5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {products.map((product) => {
            const { profit, marginPercent } = calculateMargin(
              product.salesPrice,
              product.costPrice
            );

            return (
              <tr
                key={product.id}
                className="hover:bg-slate-50/80 transition-colors group"
              >
                {/* Product Name & Notes */}
                <td className="px-5 py-4">
                  <div className="font-bold text-[#16233B]">
                    {product.name}
                  </div>
                  {product.notes && (
                    <div className="text-xs text-slate-400 mt-0.5 line-clamp-1 max-w-xs">
                      {product.notes}
                    </div>
                  )}
                </td>

                {/* Type */}
                <td className="px-4 py-4 whitespace-nowrap">
                  <Badge variant="neutral" size="sm" className="capitalize">
                    {product.type}
                  </Badge>
                </td>

                {/* Sales Price */}
                <td className="px-4 py-4 text-right font-semibold text-[#16233B] whitespace-nowrap">
                  <MoneyText amount={product.salesPrice} />
                </td>

                {/* Cost Price */}
                <td className="px-4 py-4 text-right text-slate-500 whitespace-nowrap">
                  <MoneyText amount={product.costPrice} />
                </td>

                {/* Margin */}
                <td className="px-4 py-4 text-right whitespace-nowrap">
                  <span
                    className={`font-semibold tabular-nums text-xs px-2 py-0.5 rounded-full ${
                      marginPercent >= 25
                        ? 'bg-[#EAF5EE] text-[#2E7D4F]'
                        : marginPercent > 0
                        ? 'bg-[#FEF7EC] text-[#B7791F]'
                        : 'bg-[#FDEEEE] text-[#C2362F]'
                    }`}
                  >
                    {formatPercent(marginPercent)}
                  </span>
                  <div className="text-[10px] text-slate-400 mt-0.5 tabular-nums">
                    +{formatMoney(profit)}
                  </div>
                </td>

                {/* Configured Variants */}
                <td className="px-5 py-4">
                  {product.variants && product.variants.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 max-w-sm">
                      {product.variants.map((v) => (
                        <span
                          key={v.id}
                          className="inline-flex items-center gap-1 text-[11px] font-medium bg-[#E6F5F6] text-[#0E7C86] border border-[#0E7C86]/20 px-2 py-0.5 rounded-md"
                          title={`Attribute: ${v.attribute}, Value: ${v.value}, Extra: +₹${v.extraPrice} (Effective: ₹${(product.salesPrice + v.extraPrice).toLocaleString('en-IN')})`}
                        >
                          <Tag className="w-2.5 h-2.5" />
                          <span>
                            {v.attribute}: {v.value}
                          </span>
                          {v.extraPrice > 0 && (
                            <span className="font-bold text-[#16233B]">
                              (+₹{v.extraPrice.toLocaleString('en-IN')})
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400 italic">
                      None (standard base)
                    </span>
                  )}
                </td>

                {/* Status */}
                <td className="px-4 py-4 text-center whitespace-nowrap">
                  {product.isActive ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-[#2E7D4F]">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400">
                      <XCircle className="w-3.5 h-3.5" />
                      Inactive
                    </span>
                  )}
                </td>

                {/* Actions */}
                <td className="px-4 py-4 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => onEdit(product)}
                      className="p-1.5 text-slate-500 hover:text-[#0E7C86] hover:bg-slate-100 rounded-md transition-colors"
                      title="Edit product"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onDelete(product)}
                      className="p-1.5 text-slate-500 hover:text-[#C2362F] hover:bg-red-50 rounded-md transition-colors"
                      title="Delete product"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

