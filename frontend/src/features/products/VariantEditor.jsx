import { useState } from 'react';
import { Plus, Trash2, Tag } from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { validateVariant } from '../../lib/validation';
import { formatMoney } from '../../lib/format';
import { INITIAL_VARIANT_STATE } from '../../api/types';

export default function VariantEditor({
  variants = [],
  onChange,
  baseSalesPrice = 0,
}) {
  const [newVariant, setNewVariant] = useState(INITIAL_VARIANT_STATE);
  const [variantError, setVariantError] = useState(null);

  const basePriceNum = Number(baseSalesPrice) || 0;

  const handleAddVariant = (e) => {
    e.preventDefault();
    const { isValid, errors } = validateVariant(newVariant);

    if (!isValid) {
      setVariantError(Object.values(errors)[0]);
      return;
    }

    setVariantError(null);
    const updated = [
      ...variants,
      {
        id: `var_temp_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        attribute: newVariant.attribute.trim(),
        value: newVariant.value.trim(),
        extraPrice: Number(newVariant.extraPrice) || 0,
      },
    ];

    onChange(updated);
    setNewVariant(INITIAL_VARIANT_STATE);
  };

  const handleRemoveVariant = (index) => {
    const updated = variants.filter((_, i) => i !== index);
    onChange(updated);
  };

  return (
    <div className="space-y-4 pt-3 border-t border-slate-200">
      <div>
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-[#16233B] tracking-tight flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-[#0E7C86]" />
            Configurable Variants & Add-ons
          </label>
          <span className="text-[11px] text-slate-500">
            {variants.length} variant{variants.length === 1 ? '' : 's'} configured
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          Define attributes (e.g. Brand, Edition) with extra pricing that adjusts the base price.
        </p>
      </div>

      {/* New Variant Input Form */}
      <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div>
            <Input
              label="Attribute"
              placeholder="e.g. Brand, Tier"
              value={newVariant.attribute}
              onChange={(e) =>
                setNewVariant((prev) => ({ ...prev, attribute: e.target.value }))
              }
            />
          </div>
          <div>
            <Input
              label="Value"
              placeholder="e.g. Odoo, Pro"
              value={newVariant.value}
              onChange={(e) =>
                setNewVariant((prev) => ({ ...prev, value: e.target.value }))
              }
            />
          </div>
          <div>
            <Input
              label="Extra Price (₹)"
              type="number"
              prefix="₹"
              placeholder="560"
              value={newVariant.extraPrice}
              onChange={(e) =>
                setNewVariant((prev) => ({ ...prev, extraPrice: e.target.value }))
              }
            />
          </div>
        </div>

        {/* Live preview of new variant effective price */}
        {newVariant.attribute && newVariant.value && (
          <div className="text-xs text-[#0E7C86] bg-[#E6F5F6] px-3 py-2 rounded-lg flex items-center justify-between font-medium">
            <span>
              Preview: <strong className="text-[#16233B]">{newVariant.attribute}: {newVariant.value}</strong>
            </span>
            <span className="tabular-nums">
              Base {formatMoney(basePriceNum)} + Extra {formatMoney(newVariant.extraPrice || 0)} ={' '}
              <strong className="text-[#16233B]">
                {formatMoney(basePriceNum + (Number(newVariant.extraPrice) || 0))}
              </strong>
            </span>
          </div>
        )}

        {variantError && (
          <p className="text-xs text-[#C2362F] font-medium">{variantError}</p>
        )}

        <div className="flex justify-end">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={Plus}
            onClick={handleAddVariant}
          >
            Add Variant
          </Button>
        </div>
      </div>

      {/* List of Configured Variants */}
      {variants.length > 0 && (
        <div className="space-y-2">
          {variants.map((v, index) => {
            const extra = Number(v.extraPrice) || 0;
            const effective = basePriceNum + extra;

            return (
              <div
                key={v.id || index}
                className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200 shadow-2xs hover:border-slate-300 transition-standard"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {v.attribute}:
                  </span>
                  <span className="text-sm font-bold text-[#16233B]">
                    {v.value}
                  </span>
                  {extra > 0 ? (
                    <span className="text-xs font-medium text-[#0E7C86] bg-[#E6F5F6] px-2 py-0.5 rounded-full tabular-nums">
                      +₹{extra.toLocaleString('en-IN')}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                      Included
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {/* Live Effective Price display required by 7.1 */}
                  <div className="text-right hidden sm:block">
                    <div className="text-[11px] text-slate-500">Effective Price</div>
                    <div className="text-xs font-bold text-[#16233B] tabular-nums">
                      {formatMoney(effective)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveVariant(index)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                    title="Remove variant"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
