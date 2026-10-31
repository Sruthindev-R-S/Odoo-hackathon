import { useState, useEffect } from 'react';
import Drawer from '../../components/ui/Drawer';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Switch from '../../components/ui/Switch';
import Button from '../../components/ui/Button';
import { BILLING_PERIODS, INITIAL_PLAN_STATE } from '../../api/types';
import { validatePlanForm } from '../../lib/validation';
import { productService } from '../../api/services/productService';
import { Layers, Calendar } from 'lucide-react';

export default function PlanDrawer({
  isOpen,
  onClose,
  onSave,
  initialData = null,
  isEditing = false,
}) {
  const [formData, setFormData] = useState(INITIAL_PLAN_STATE);
  const [products, setProducts] = useState([]);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load available products for association
  useEffect(() => {
    async function loadProducts() {
      const prods = await productService.getProducts();
      setProducts(prods);
    }
    if (isOpen) {
      loadProducts();
    }
  }, [isOpen]);

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        productId: initialData.productId || '',
        productName: initialData.productName || '',
        price: initialData.price !== undefined ? initialData.price : '',
        billingPeriod: initialData.billingPeriod || 'monthly',
        minQuantity: initialData.minQuantity || 1,
        availableFrom: initialData.availableFrom ? initialData.availableFrom.substring(0, 10) : '',
        availableTo: initialData.availableTo ? initialData.availableTo.substring(0, 10) : '',
        autoCloseOnEnd: initialData.autoCloseOnEnd !== undefined ? initialData.autoCloseOnEnd : true,
        allowEarlyClose: initialData.allowEarlyClose !== undefined ? initialData.allowEarlyClose : true,
        allowPause: initialData.allowPause !== undefined ? initialData.allowPause : true,
        allowRenewal: initialData.allowRenewal !== undefined ? initialData.allowRenewal : true,
      });
    } else {
      setFormData(INITIAL_PLAN_STATE);
    }
    setErrors({});
  }, [initialData, isOpen]);

  // When a product is selected, auto-populate the productName and suggest its sales price
  const handleProductChange = (e) => {
    const pId = e.target.value;
    const matched = products.find((p) => p.id === pId);
    setFormData((prev) => ({
      ...prev,
      productId: pId,
      productName: matched ? matched.name : '',
      // If price is empty, suggest the product's base sales price
      price: prev.price === '' && matched ? matched.salesPrice : prev.price,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { isValid, errors: validationErrors } = validatePlanForm(formData);

    if (!isValid) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);
    try {
      await onSave({
        ...formData,
        price: Number(formData.price),
        minQuantity: Number(formData.minQuantity) || 1,
      });
      onClose();
    } catch (err) {
      setErrors({ form: err.message || 'Failed to save subscription plan' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const productOptions = products.map((p) => ({
    value: p.id,
    label: `${p.name} (Base ₹${p.salesPrice.toLocaleString('en-IN')})`,
  }));

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Subscription Plan' : 'Create Subscription Plan'}
      subtitle="Configure pricing, recurrence intervals, minimum seats, and lifecycle behaviors"
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
            {isEditing ? 'Update Plan' : 'Save Plan'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {errors.form && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg font-medium">
            {errors.form}
          </div>
        )}

        {/* Plan Name */}
        <Input
          label="Plan Name"
          required
          placeholder="e.g. Enterprise Monthly, Pro Annual Seat"
          value={formData.name}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, name: e.target.value }))
          }
          error={errors.name}
        />

        {/* Associated Product */}
        <div>
          <Select
            label="Associated Product"
            required
            placeholder={
              products.length === 0
                ? 'No products available — add a product first'
                : 'Select product from catalog'
            }
            options={productOptions}
            value={formData.productId}
            onChange={handleProductChange}
            error={errors.productId}
            helperText="The catalog product this recurring plan licenses or delivers."
          />
          {products.length === 0 && (
            <p className="text-xs text-[#B7791F] mt-1 font-medium">
              Notice: You must have at least one product created before saving a plan.
            </p>
          )}
        </div>

        {/* Pricing & Frequency Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Plan Price"
            required
            type="number"
            step="any"
            prefix="₹"
            placeholder="1560"
            value={formData.price}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, price: e.target.value }))
            }
            error={errors.price}
            helperText="Recurring fee per billing interval"
          />

          <Select
            label="Billing Frequency"
            required
            options={BILLING_PERIODS}
            value={formData.billingPeriod}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, billingPeriod: e.target.value }))
            }
            error={errors.billingPeriod}
          />
        </div>

        {/* Minimum Quantity */}
        <Input
          label="Minimum Quantity"
          required
          type="number"
          min="1"
          placeholder="1"
          value={formData.minQuantity}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, minQuantity: e.target.value }))
          }
          error={errors.minQuantity}
          helperText="Minimum licenses or units required when subscribing to this plan"
        />

        {/* Availability Dates */}
        <div className="space-y-3 pt-3 border-t border-slate-200">
          <label className="text-xs font-semibold text-[#16233B] tracking-tight flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-[#0E7C86]" />
            Plan Availability Window
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Available From"
              type="date"
              value={formData.availableFrom}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, availableFrom: e.target.value }))
              }
              helperText="Date from which plan can be subscribed"
            />

            <Input
              label="Available To"
              type="date"
              value={formData.availableTo}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, availableTo: e.target.value }))
              }
              error={errors.availableTo}
              helperText="Last date this plan is offered (leave blank for ongoing)"
            />
          </div>
        </div>

        {/* 4 Behavior Switches as specified in Section 7.2 */}
        <div className="space-y-2 pt-4 border-t border-slate-200">
          <div className="mb-2">
            <label className="text-xs font-semibold text-[#16233B] tracking-tight flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#0E7C86]" />
              Plan Lifecycle Behaviors
            </label>
            <p className="text-xs text-slate-500 mt-0.5">
              Specify subscription actions permitted under this plan.
            </p>
          </div>

          <div className="divide-y divide-slate-100 bg-slate-50/70 p-3.5 rounded-xl border border-slate-200">
            {/* 1. Closes automatically when it ends */}
            <Switch
              label="Closes automatically when it ends"
              description="Subscription automatically transitions to Closed upon expiry without recurring extension."
              checked={formData.autoCloseOnEnd}
              onChange={(checked) =>
                setFormData((prev) => ({ ...prev, autoCloseOnEnd: checked }))
              }
            />

            {/* 2. Can be closed early */}
            <Switch
              label="Can be closed early"
              description="Subscribers or internal reps may terminate this subscription prior to its end date."
              checked={formData.allowEarlyClose}
              onChange={(checked) =>
                setFormData((prev) => ({ ...prev, allowEarlyClose: checked }))
              }
            />

            {/* 3. Can be paused */}
            <Switch
              label="Can be paused"
              description="Allows temporary service pausing and billing suspension during the active term."
              checked={formData.allowPause}
              onChange={(checked) =>
                setFormData((prev) => ({ ...prev, allowPause: checked }))
              }
            />

            {/* 4. Can be renewed */}
            <Switch
              label="Can be renewed"
              description="Enables manual or automated term renewal at the end of the subscription period."
              checked={formData.allowRenewal}
              onChange={(checked) =>
                setFormData((prev) => ({ ...prev, allowRenewal: checked }))
              }
            />
          </div>
        </div>
      </form>
    </Drawer>
  );
}

