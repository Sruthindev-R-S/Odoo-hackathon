/**
 * Form validation helpers for products, variants, and subscription plans.
 */

export function validateProductForm(productData) {
  const errors = {};

  if (!productData.name || !productData.name.trim()) {
    errors.name = 'Product name is required';
  }

  if (!productData.type) {
    errors.type = 'Product type is required';
  }

  const salesPrice = Number(productData.salesPrice);
  if (
    productData.salesPrice === '' ||
    isNaN(salesPrice) ||
    salesPrice < 0
  ) {
    errors.salesPrice = 'Sales price must be a non-negative number';
  }

  const costPrice = Number(productData.costPrice);
  if (productData.costPrice === '' || isNaN(costPrice) || costPrice < 0) {
    errors.costPrice = 'Cost price must be a non-negative number';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateVariant(variantData) {
  const errors = {};

  if (!variantData.attribute || !variantData.attribute.trim()) {
    errors.attribute = 'Variant type is required (e.g., color, tier, brand)';
  }

  if (!variantData.value || !variantData.value.trim()) {
    errors.value = 'Variant name is required (e.g., Blue, Enterprise)';
  }

  const extraPrice = Number(variantData.extraPrice);
  if (isNaN(extraPrice) || extraPrice < 0) {
    errors.extraPrice = 'Additional price must be a non-negative number';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validatePlanForm(planData) {
  const errors = {};

  if (!planData.name || !planData.name.trim()) {
    errors.name = 'Plan name is required';
  }

  const price = Number(planData.price);
  if (planData.price === '' || isNaN(price) || price < 0) {
    errors.price = 'Price must be a non-negative number';
  }

  if (!planData.billingPeriod) {
    errors.billingPeriod = 'Billing frequency is required';
  }

  const minQuantity = Number(planData.minQuantity);
  if (isNaN(minQuantity) || minQuantity < 1 || !Number.isInteger(minQuantity)) {
    errors.minQuantity = 'Minimum quantity must be a positive integer';
  }

  if (planData.availableFrom && planData.availableTo) {
    const from = new Date(planData.availableFrom);
    const to = new Date(planData.availableTo);
    if (to < from) {
      errors.availableTo =
        'Available To date must be on or after Available From date';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
