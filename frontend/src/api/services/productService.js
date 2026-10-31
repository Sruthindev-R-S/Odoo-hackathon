/**
 * Product & Variant Service Layer
 *
 * Integrates live backend endpoints at http://192.168.0.155:3000:
 *  8.  POST   /products
 *  9.  GET    /products
 *  10. GET    /products/{productId}
 *  11. PATCH  /products/{productId}
 *  12. DELETE /products/{productId}
 *  13. POST   /products/{productId}/variants
 *  14. GET    /products/{productId}/variants
 *  15. GET    /products/{productId}/variants/{variantId}
 *  16. PATCH  /products/{productId}/variants/{variantId}
 *  17. DELETE /products/{productId}/variants/{variantId}
 */

import { apiClient, isNetworkOfflineError, isUuid } from '../client.js';

const STORAGE_KEY = 'brightloop_products';

const SEED_PRODUCTS = [
  {
    id: 'prod_core_01',
    name: 'Brightloop Core Recurring Engine',
    type: 'software',
    salesPrice: 1000,
    costPrice: 400,
    notes:
      'Primary subscription billing and invoicing engine with automated dunning',
    isActive: true,
    variants: [
      {
        id: 'var_odoo_01',
        attribute: 'Brand',
        value: 'Odoo Edition',
        extraPrice: 560,
      },
      {
        id: 'var_std_01',
        attribute: 'Brand',
        value: 'Standard Cloud',
        extraPrice: 0,
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'prod_analytics_02',
    name: 'Advanced Revenue Analytics & Reporting',
    type: 'service',
    salesPrice: 350,
    costPrice: 120,
    notes: 'MRR/ARR cohorts, churn forecasting, and cash flow reconciliation',
    isActive: true,
    variants: [
      {
        id: 'var_tier_pro',
        attribute: 'Tier',
        value: 'Pro Suite',
        extraPrice: 150,
      },
      {
        id: 'var_tier_std',
        attribute: 'Tier',
        value: 'Basic Metrics',
        extraPrice: 0,
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'prod_storage_03',
    name: 'Encrypted Document & Invoice Storage',
    type: 'addon',
    salesPrice: 199,
    costPrice: 50,
    notes:
      'Compliant tamper-proof storage for audit invoices and customer receipts',
    isActive: true,
    variants: [
      {
        id: 'var_storage_100',
        attribute: 'Capacity',
        value: '100 GB',
        extraPrice: 100,
      },
      {
        id: 'var_storage_25',
        attribute: 'Capacity',
        value: '25 GB',
        extraPrice: 0,
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

function getStoredProducts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_PRODUCTS));
      return SEED_PRODUCTS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : SEED_PRODUCTS;
  } catch {
    return SEED_PRODUCTS;
  }
}

function setStoredProducts(products) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
  } catch (err) {
    console.error('Failed to persist products to storage', err);
  }
}

function normalizeVariantFromApi(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    productId: raw.product_id ?? raw.productId,
    attribute: raw.variant_type ?? raw.variantType ?? raw.attribute ?? '',
    value: raw.variant_name ?? raw.variantName ?? raw.value ?? '',
    extraPrice: Number(
      raw.additional_price ?? raw.additionalPrice ?? raw.extraPrice ?? 0
    ),
    isActive: raw.active !== false,
  };
}

function normalizeProductFromApi(raw, variants = []) {
  if (!raw) return null;
  return {
    id: raw.id,
    name: raw.name || '',
    type: raw.type || 'standard',
    salesPrice: Number(raw.sales_price ?? raw.salesPrice ?? 0),
    costPrice: Number(raw.cost_price ?? raw.costPrice ?? 0),
    notes: raw.notes || '',
    isActive: raw.active !== false && raw.isActive !== false,
    variants: Array.isArray(variants)
      ? variants.map(normalizeVariantFromApi).filter(Boolean)
      : [],
    createdAt: raw.created_at || raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updated_at || raw.updatedAt || new Date().toISOString(),
  };
}

export const productService = {
  /**
   * 9. GET /products (+ 14. GET /products/{productId}/variants)
   */
  async getProducts() {
    try {
      const data = await apiClient.get('/products', {
        includeCompanyHeader: false,
      });
      const rows = Array.isArray(data) ? data : data?.products || [];
      const hydrated = await Promise.all(
        rows.map(async (prod) => {
          try {
            const vRes = await apiClient.get(`/products/${prod.id}/variants`, {
              includeCompanyHeader: false,
            });
            const vRows = Array.isArray(vRes) ? vRes : vRes?.variants || [];
            return normalizeProductFromApi(prod, vRows);
          } catch {
            return normalizeProductFromApi(prod, []);
          }
        })
      );
      setStoredProducts(hydrated);
      return hydrated;
    } catch (err) {
      if (!isNetworkOfflineError(err)) {
        throw err;
      }
      return getStoredProducts();
    }
  },

  /**
   * 10. GET /products/{productId} (+ 14. GET /products/{productId}/variants)
   */
  async getProductById(id) {
    try {
      const prodRes = await apiClient.get(`/products/${id}`, {
        includeCompanyHeader: false,
      });
      const prodRow = prodRes?.product || prodRes;
      if (!prodRow) return null;
      const vRes = await apiClient.get(`/products/${id}/variants`, {
        includeCompanyHeader: false,
      });
      const vRows = Array.isArray(vRes) ? vRes : vRes?.variants || [];
      return normalizeProductFromApi(prodRow, vRows);
    } catch (err) {
      if (!isNetworkOfflineError(err)) {
        if (err.status === 404) return null;
        throw err;
      }
      const products = getStoredProducts();
      return products.find((p) => p.id === id) || null;
    }
  },

  /**
   * 14. GET /products/{productId}/variants
   */
  async getVariants(productId) {
    const vRes = await apiClient.get(`/products/${productId}/variants`, {
      includeCompanyHeader: false,
    });
    const rows = Array.isArray(vRes) ? vRes : vRes?.variants || [];
    return rows.map(normalizeVariantFromApi).filter(Boolean);
  },

  /**
   * 15. GET /products/{productId}/variants/{variantId}
   */
  async getVariantById(productId, variantId) {
    const res = await apiClient.get(
      `/products/${productId}/variants/${variantId}`,
      { includeCompanyHeader: false }
    );
    return normalizeVariantFromApi(res?.variant || res);
  },

  /**
   * 13. POST /products/{productId}/variants
   */
  async createVariant(productId, variant) {
    const res = await apiClient.post(
      `/products/${productId}/variants`,
      {
        variantType: String(
          variant.variantType ?? variant.attribute ?? ''
        ).trim(),
        variantName: String(variant.variantName ?? variant.value ?? '').trim(),
        additionalPrice: Number(
          variant.additionalPrice ?? variant.extraPrice ?? 0
        ),
      },
      { includeCompanyHeader: false }
    );
    return normalizeVariantFromApi(res?.variant || res);
  },

  /**
   * 16. PATCH /products/{productId}/variants/{variantId}
   */
  async updateVariant(productId, variantId, variant) {
    const res = await apiClient.patch(
      `/products/${productId}/variants/${variantId}`,
      {
        variantType:
          variant.variantType !== undefined || variant.attribute !== undefined
            ? String(variant.variantType ?? variant.attribute).trim()
            : undefined,
        variantName:
          variant.variantName !== undefined || variant.value !== undefined
            ? String(variant.variantName ?? variant.value).trim()
            : undefined,
        additionalPrice:
          variant.additionalPrice !== undefined ||
          variant.extraPrice !== undefined
            ? Number(variant.additionalPrice ?? variant.extraPrice ?? 0)
            : undefined,
      },
      { includeCompanyHeader: false }
    );
    return normalizeVariantFromApi(res?.variant || res);
  },

  /**
   * 17. DELETE /products/{productId}/variants/{variantId}
   */
  async deactivateVariant(productId, variantId) {
    await apiClient.delete(`/products/${productId}/variants/${variantId}`, {
      includeCompanyHeader: false,
    });
    return true;
  },

  /**
   * 8. POST /products (+ 13. POST /products/{productId}/variants for each variant)
   */
  async createProduct(productData) {
    try {
      const res = await apiClient.post(
        '/products',
        {
          name: productData.name.trim(),
          type: (productData.type || 'standard').trim(),
          salesPrice: Number(productData.salesPrice) || 0,
          costPrice: Number(productData.costPrice) || 0,
          notes: productData.notes ? productData.notes.trim() : '',
        },
        { includeCompanyHeader: false }
      );
      const createdProd = res?.product || res;
      const createdVariants = [];

      if (Array.isArray(productData.variants) && createdProd?.id) {
        for (const v of productData.variants) {
          if (v.attribute?.trim() && v.value?.trim()) {
            const cv = await this.createVariant(createdProd.id, v);
            createdVariants.push(cv);
          }
        }
      }

      const normalized = normalizeProductFromApi(createdProd, createdVariants);
      const cached = getStoredProducts().filter((p) => isUuid(p.id));
      setStoredProducts([normalized, ...cached]);
      return normalized;
    } catch (err) {
      if (!isNetworkOfflineError(err)) {
        throw err;
      }

      const products = getStoredProducts();
      const newProduct = {
        id: `prod_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: productData.name.trim(),
        type: productData.type || 'standard',
        salesPrice: Number(productData.salesPrice) || 0,
        costPrice: Number(productData.costPrice) || 0,
        notes: productData.notes ? productData.notes.trim() : '',
        isActive: productData.isActive !== false,
        variants: Array.isArray(productData.variants)
          ? productData.variants.map((v, idx) => ({
              id: v.id || `var_${Date.now()}_${idx}`,
              attribute: v.attribute.trim(),
              value: v.value.trim(),
              extraPrice: Number(v.extraPrice) || 0,
            }))
          : [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      products.unshift(newProduct);
      setStoredProducts(products);
      return newProduct;
    }
  },

  /**
   * 11. PATCH /products/{productId} (+ 13/16/17 variant reconciliation)
   */
  async updateProduct(id, productData) {
    try {
      const res = await apiClient.patch(
        `/products/${id}`,
        {
          name:
            productData.name !== undefined
              ? productData.name.trim()
              : undefined,
          type:
            productData.type !== undefined
              ? productData.type.trim()
              : undefined,
          salesPrice:
            productData.salesPrice !== undefined
              ? Number(productData.salesPrice)
              : undefined,
          costPrice:
            productData.costPrice !== undefined
              ? Number(productData.costPrice)
              : undefined,
          notes:
            productData.notes !== undefined
              ? productData.notes.trim()
              : undefined,
        },
        { includeCompanyHeader: false }
      );
      const updatedProd = res?.product || res;

      let finalVariants = [];
      if (Array.isArray(productData.variants)) {
        const existingVariants = await this.getVariants(id);
        const existingById = new Map(existingVariants.map((v) => [v.id, v]));
        const incomingExistingIds = new Set();

        for (const v of productData.variants) {
          if (!v.attribute?.trim() || !v.value?.trim()) continue;
          if (v.id && existingById.has(v.id)) {
            incomingExistingIds.add(v.id);
            const prev = existingById.get(v.id);
            if (
              prev.attribute !== v.attribute.trim() ||
              prev.value !== v.value.trim() ||
              Number(prev.extraPrice) !== Number(v.extraPrice || 0)
            ) {
              const uv = await this.updateVariant(id, v.id, v);
              finalVariants.push(uv);
            } else {
              finalVariants.push(prev);
            }
          } else {
            const cv = await this.createVariant(id, v);
            finalVariants.push(cv);
          }
        }

        for (const oldVar of existingVariants) {
          if (!incomingExistingIds.has(oldVar.id)) {
            await this.deactivateVariant(id, oldVar.id);
          }
        }
      } else {
        finalVariants = await this.getVariants(id);
      }

      const normalized = normalizeProductFromApi(updatedProd, finalVariants);
      const cached = getStoredProducts().map((p) =>
        p.id === id ? normalized : p
      );
      setStoredProducts(cached);
      return normalized;
    } catch (err) {
      if (!isNetworkOfflineError(err)) {
        throw err;
      }

      const products = getStoredProducts();
      const index = products.findIndex((p) => p.id === id);
      if (index === -1) {
        throw new Error(`Product with ID "${id}" not found.`);
      }

      const updated = {
        ...products[index],
        name:
          productData.name !== undefined
            ? productData.name.trim()
            : products[index].name,
        type:
          productData.type !== undefined
            ? productData.type
            : products[index].type,
        salesPrice:
          productData.salesPrice !== undefined
            ? Number(productData.salesPrice)
            : products[index].salesPrice,
        costPrice:
          productData.costPrice !== undefined
            ? Number(productData.costPrice)
            : products[index].costPrice,
        notes:
          productData.notes !== undefined
            ? productData.notes.trim()
            : products[index].notes,
        isActive:
          productData.isActive !== undefined
            ? Boolean(productData.isActive)
            : products[index].isActive,
        variants: Array.isArray(productData.variants)
          ? productData.variants.map((v, idx) => ({
              id: v.id || `var_${Date.now()}_${idx}`,
              attribute: v.attribute.trim(),
              value: v.value.trim(),
              extraPrice: Number(v.extraPrice) || 0,
            }))
          : products[index].variants,
        updatedAt: new Date().toISOString(),
      };

      products[index] = updated;
      setStoredProducts(products);
      return updated;
    }
  },

  /**
   * 12. DELETE /products/{productId}
   */
  async deleteProduct(id) {
    try {
      await apiClient.delete(`/products/${id}`, {
        includeCompanyHeader: false,
      });
      setStoredProducts(getStoredProducts().filter((p) => p.id !== id));
      return true;
    } catch (err) {
      if (!isNetworkOfflineError(err)) {
        throw err;
      }
      const products = getStoredProducts();
      const filtered = products.filter((p) => p.id !== id);
      if (filtered.length === products.length) {
        throw new Error(`Product with ID "${id}" not found.`);
      }
      setStoredProducts(filtered);
      return true;
    }
  },
};
