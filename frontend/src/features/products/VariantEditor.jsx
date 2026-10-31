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
    <div className="space-y-4 pt-3 border-t border-zinc-200">
      <div>
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-zinc-900 tracking-tight flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-zinc-900" />
            Configurable Variants & Add-ons
          </label>
          <span className="text-[11px] text-zinc-500">
            {variants.length} variant{variants.length === 1 ? '' : 's'} configured
          </span>
        </div>
        <p className="text-xs text-zinc-500 mt-0.5">
          Define attributes (e.g. Brand, Edition) with extra pricing that adjusts the base price (e.g. Odoo brand adds 560).
        </p>
      </div>

      {/* New Variant Input Form */}
      <div className="bg-zinc-50 rounded-xl p-3.5 border border-zinc-200 space-y-3">
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
          <div className="text-xs text-zinc-900 bg-white border border-zinc-200 px-3 py-2 rounded-lg flex items-center justify-between font-medium">
            <span>
              Preview: <strong className="text-zinc-900">{newVariant.attribute}: {newVariant.value}</strong>
            </span>
            <span className="tabular-nums">
              Base {formatMoney(basePriceNum)} + Extra {formatMoney(newVariant.extraPrice || 0)} ={' '}
              <strong className="text-zinc-900 font-bold">
                {formatMoney(basePriceNum + (Number(newVariant.extraPrice) || 0))}
              </strong>
            </span>
          </div>
        )}

        {variantError && (
          <p className="text-xs text-red-600 font-medium">{variantError}</p>
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
                className="flex items-center justify-between p-3 bg-white rounded-lg border border-zinc-200 shadow-2xs hover:border-zinc-300 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                    {v.attribute}:
                  </span>
                  <span className="text-sm font-semibold text-zinc-900">
                    {v.value}
                  </span>
                  {extra > 0 ? (
                    <span className="text-xs font-semibold text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full tabular-nums">
                      +₹{extra.toLocaleString('en-IN')}
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded-full">
                      Included
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {/* Live Effective Price display required by 7.1 */}
                  <div className="text-right hidden sm:block">
                    <div className="text-[11px] text-zinc-500">Effective Price</div>
                    <div className="text-xs font-bold text-zinc-900 tabular-nums">
                      {formatMoney(effective)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveVariant(index)}
                    className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
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
