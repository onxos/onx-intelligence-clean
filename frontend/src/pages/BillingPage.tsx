import { useInvoices } from '../api/queries';
import { DataTable } from '../components/DataTable';
export function BillingPage() {
  const { data, isLoading } = useInvoices();
  if (isLoading) return <div className="text-gray-500">Loading...</div>;
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Billing</h1>
      <DataTable columns={[{ key: 'invoiceNumber', header: 'Invoice #' }, { key: 'total', header: 'Total', render: (r) => `$${r.total}` }, { key: 'status', header: 'Status' }]} data={data || []} />
    </div>
  );
}
