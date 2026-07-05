import { useProducts } from '../api/queries';
import { DataTable } from '../components/DataTable';
export function InventoryPage() {
  const { data, isLoading } = useProducts();
  if (isLoading) return <div className="text-gray-500">Loading...</div>;
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Inventory</h1>
      <DataTable columns={[{ key: 'name', header: 'Product' }, { key: 'sku', header: 'SKU' }, { key: 'quantityOnHand', header: 'Stock' }, { key: 'reorderLevel', header: 'Reorder At' }]} data={data || []} />
    </div>
  );
}
