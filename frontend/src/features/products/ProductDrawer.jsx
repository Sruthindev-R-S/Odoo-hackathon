import { useState, useEffect } from 'react';
import Drawer from '../../components/ui/Drawer';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';
import Switch from '../../components/ui/Switch';
import Button from '../../components/ui/Button';
import VariantEditor from './VariantEditor';
import { PRODUCT_TYPES, INITIAL_PRODUCT_STATE } from '../../api/types';
import { validateProductForm } from '../../lib/validation';
import { calculateMargin, formatMoney, formatPercent } from '../../lib/format';

export default function ProductDrawer({
  isOpen,
  onClose,
  onSave,
  initialData = null,
  isEditing = false,
}) {
  // Temporary form state - kept separate from persistent data
  const [formData, setFormData] = useState(INITIAL_PRODUCT_STATE);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        type: initialData.type || 'software',
        salesPrice: initialData.salesPrice !== undefined ? initialData.salesPrice : '',
        costPrice: initialData.costPrice !== undefined ? initialData.costPrice : '',
        notes: initialData.notes || '',
        isActive: initialData.isActive !== false,
        variants: initialData.variants ? [...initialData.variants] : [],
      });
    } else {
      setFormData(INITIAL_PRODUCT_STATE);
    }
    setErrors({});
  }, [initialData, isOpen]);

  // Compute live profit margin
  const { profit, marginPercent } = calculateMargin(formData.salesPrice, formData.costPrice);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { isValid, errors: validationErrors } = validateProductForm(formData);

    if (!isValid) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);
    try {
      await onSave({
        ...formData,
        salesPrice: Number(formData.salesPrice),
        costPrice: Number(formData.costPrice),
      });
      onClose();
    } catch (err) {
      setErrors({ form: err.message || 'Failed to save product' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Product' : 'Add New Product'}
      subtitle={
        isEditing
          ? 'Update product pricing, attributes and configurable variants'
          : 'Define a product with sales/cost price and optional variants'
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={isSubmitting}
          >
            {isEditing ? 'Update Product' : 'Save Product'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {errors.form && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg font-medium">
            {errors.form}
          </div>
        )}

        {/* Product Name */}
        <Input
          label="Product Name"
          required
          placeholder="e.g. Enterprise Cloud Suite, Accounting Connector"
          value={formData.name}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, name: e.target.value }))
          }
          error={errors.name}
        />

        {/* Product Type */}
        <Select
          label="Product Type"
          required
          options={PRODUCT_TYPES}
          value={formData.type}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, type: e.target.value }))
          }
          error={errors.type}
        />

        {/* Pricing Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Sales Price"
            required
            type="number"
            step="any"
            prefix="₹"
            placeholder="1000"
            value={formData.salesPrice}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, salesPrice: e.target.value }))
            }
            error={errors.salesPrice}
            helperText="Base selling price before variants"
          />

          <Input
            label="Cost Price"
            required
            type="number"
            step="any"
            prefix="₹"
            placeholder="400"
            value={formData.costPrice}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, costPrice: e.target.value }))
            }
            error={errors.costPrice}
            helperText="Internal cost or procurement price"
          />
        </div>

        {/* Live Profit Margin Display */}
        {(formData.salesPrice !== '' || formData.costPrice !== '') && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between text-xs">
            <div>
              <span className="text-slate-500 font-medium">Projected Margin:</span>{' '}
              <span
                className={`font-bold tabular-nums ${
                  profit >= 0 ? 'text-[#2E7D4F]' : 'text-[#C2362F]'
                }`}
              >
                {formatPercent(marginPercent)}
              </span>
            </div>
            <div>
              <span className="text-slate-500 font-medium">Gross Profit / Unit:</span>{' '}
              <span className="font-bold text-[#16233B] tabular-nums">
                {formatMoney(profit)}
              </span>
            </div>
          </div>
        )}

        {/* Notes */}
        <Textarea
          label="Notes / Description"
          rows={3}
          placeholder="Optional technical specifications, SKU notes, or billing notes..."
          value={formData.notes}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, notes: e.target.value }))
          }
        />

        {/* Active Toggle */}
        <div className="pt-2 border-t border-slate-200">
          <Switch
            label="Product Active"
            description="Inactive products cannot be selected in new subscription plans or quotes."
            checked={formData.isActive}
            onChange={(checked) =>
              setFormData((prev) => ({ ...prev, isActive: checked }))
            }
          />
        </div>

        {/* Variants Editor */}
        <VariantEditor
          variants={formData.variants}
          baseSalesPrice={formData.salesPrice}
          onChange={(variants) =>
            setFormData((prev) => ({ ...prev, variants }))
          }
        />
      </form>
    </Drawer>
  );
}

