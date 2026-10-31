/**
 * Product Service Layer
 * 
 * Provides a clean abstraction for Product and Variant management.
 * In this phase, it provides a persistent browser-backed client store
 * with zero dummy/mock data (starts empty).
 * 
 * To connect to the real backend API later:
 * Simply replace the internal storage calls with your backend endpoints:
 *   e.g. return apiClient.get('/api/products')
 */

const STORAGE_KEY = 'brightloop_products';

// Helper to safely access browser storage
function getStoredProducts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setStoredProducts(products) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
  } catch (err) {
    console.error('Failed to persist products to storage', err);
  }
}

export const productService = {
  /**
   * Fetch all products.
   * @returns {Promise<Array>} List of products
   */
  async getProducts() {
    // Simulating async network roundtrip
    await new Promise((resolve) => setTimeout(resolve, 80));
    return getStoredProducts();
  },

  /**
   * Fetch a single product by ID.
   * @param {string} id 
   * @returns {Promise<Object|null>}
   */
  async getProductById(id) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const products = getStoredProducts();
    const product = products.find((p) => p.id === id);
    return product || null;
  },

  /**
   * Create a new product with optional variants.
   * @param {Object} productData 
   * @returns {Promise<Object>} Created product with generated ID and timestamps
   */
  async createProduct(productData) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const products = getStoredProducts();

    const newProduct = {
      id: `prod_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: productData.name.trim(),
      type: productData.type || 'software',
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
  },

  /**
   * Update an existing product.
   * @param {string} id 
   * @param {Object} productData 
   * @returns {Promise<Object>} Updated product
   */
  async updateProduct(id, productData) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const products = getStoredProducts();
    const index = products.findIndex((p) => p.id === id);

    if (index === -1) {
      throw new Error(`Product with ID "${id}" not found.`);
    }

    const updated = {
      ...products[index],
      name: productData.name !== undefined ? productData.name.trim() : products[index].name,
      type: productData.type !== undefined ? productData.type : products[index].type,
      salesPrice: productData.salesPrice !== undefined ? Number(productData.salesPrice) : products[index].salesPrice,
      costPrice: productData.costPrice !== undefined ? Number(productData.costPrice) : products[index].costPrice,
      notes: productData.notes !== undefined ? productData.notes.trim() : products[index].notes,
      isActive: productData.isActive !== undefined ? Boolean(productData.isActive) : products[index].isActive,
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
  },

  /**
   * Delete a product by ID.
   * @param {string} id 
   * @returns {Promise<boolean>}
   */
  async deleteProduct(id) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const products = getStoredProducts();
    const filtered = products.filter((p) => p.id !== id);

    if (filtered.length === products.length) {
      throw new Error(`Product with ID "${id}" not found.`);
    }

    setStoredProducts(filtered);
    return true;
  },
};

