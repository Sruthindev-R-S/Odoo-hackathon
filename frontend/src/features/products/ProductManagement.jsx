import { useState, useMemo } from 'react';
import { Plus, Search, Filter, Package } from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import ProductTable from './ProductTable';
import ProductDrawer from './ProductDrawer';
import { useProducts } from './useProducts';
import { useToast } from '../../components/ui/ToastContext';
import { PRODUCT_TYPES } from '../../api/types';

export default function ProductManagement() {
  const { products, loading, addProduct, editProduct, removeProduct } = useProducts();
  const { showToast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('all');

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  // Delete modal state
  const [deletingProduct, setDeletingProduct] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Filter products by search and type
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.notes && p.notes.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (p.variants &&
          p.variants.some(
            (v) =>
              v.attribute.toLowerCase().includes(searchQuery.toLowerCase()) ||
              v.value.toLowerCase().includes(searchQuery.toLowerCase())
          ));

      const matchesType = selectedType === 'all' || p.type === selectedType;

      return matchesSearch && matchesType;
    });
  }, [products, searchQuery, selectedType]);

  const handleOpenAdd = () => {
    setEditingProduct(null);
    setDrawerOpen(true);
  };

  const handleOpenEdit = (product) => {
    setEditingProduct(product);
    setDrawerOpen(true);
  };

  const handleSaveProduct = async (formData) => {
    if (editingProduct) {
      await editProduct(editingProduct.id, formData);
      showToast(`Product "${formData.name}" updated successfully`, 'success');
    } else {
      await addProduct(formData);
      showToast(`Product "${formData.name}" added to catalog`, 'success');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingProduct) return;
    setIsDeleting(true);
    try {
      await removeProduct(deletingProduct.id);
      showToast(`Product "${deletingProduct.name}" removed`, 'success');
      setDeletingProduct(null);
    } catch (err) {
      showToast(err.message || 'Failed to delete product', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-[#16233B] tracking-tight">
            Products & Variants
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage your service and software catalog, base pricing, cost margins, and configurable variant add-ons.
          </p>
        </div>
        <Button
          variant="primary"
          icon={Plus}
          onClick={handleOpenAdd}
        >
          Add Product
        </Button>
      </div>

      {/* Filter and Search Bar (only show when products exist) */}
      {products.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="w-full sm:w-72">
            <Input
              placeholder="Search products or variants..."
              prefix={<Search className="w-4 h-4 text-slate-400" />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1 shrink-0">
              <Filter className="w-3.5 h-3.5" /> Type:
            </span>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 font-medium text-[#16233B] focus:outline-none focus:ring-1 focus:ring-[#0E7C86]"
            >
              <option value="all">All Types ({products.length})</option>
              {PRODUCT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Content Area */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-200 border-t-[#0E7C86] mb-3" />
          <p className="text-sm font-medium">Loading products...</p>
        </div>
      ) : products.length === 0 ? (
        /* Empty State mandated by Requirement 6 */
        <EmptyState
          icon={Package}
          title="No products in catalog yet"
          description="Build your catalog by adding products with base pricing, cost margins, and configurable brand or tier variants."
          actionLabel="Add First Product"
          actionIcon={Plus}
          onAction={handleOpenAdd}
        />
      ) : filteredProducts.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <p className="text-sm font-medium text-slate-600">
            No products match "{searchQuery}"
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 text-[#0E7C86]"
            onClick={() => {
              setSearchQuery('');
              setSelectedType('all');
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <ProductTable
          products={filteredProducts}
          onEdit={handleOpenEdit}
          onDelete={(p) => setDeletingProduct(p)}
        />
      )}

      {/* Add / Edit Drawer */}
      <ProductDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSave={handleSaveProduct}
        initialData={editingProduct}
        isEditing={Boolean(editingProduct)}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={Boolean(deletingProduct)}
        onClose={() => setDeletingProduct(null)}
        title="Delete Product"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setDeletingProduct(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteConfirm}
              loading={isDeleting}
            >
              Confirm Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600 leading-relaxed">
          Are you sure you want to delete the product{' '}
          <strong className="text-[#16233B]">"{deletingProduct?.name}"</strong>?
          This action cannot be undone. Associated subscription plans may need reassignment.
        </p>
      </Modal>
    </div>
  );
}
