import { usePrescriptions } from '../api/queries';
import { DataTable } from '../components/DataTable';
export function PrescriptionsPage() {
  const { data, isLoading } = usePrescriptions();
  if (isLoading) return <div className="text-gray-500">Loading...</div>;
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Prescriptions</h1>
      <DataTable columns={[{ key: 'medication', header: 'Medication' }, { key: 'dosage', header: 'Dosage' }, { key: 'frequency', header: 'Frequency' }, { key: 'status', header: 'Status' }]} data={data || []} />
    </div>
  );
}
