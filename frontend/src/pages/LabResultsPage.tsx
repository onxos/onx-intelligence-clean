import { useLabResults } from '../api/queries';
import { DataTable } from '../components/DataTable';
export function LabResultsPage() {
  const { data, isLoading } = useLabResults();
  if (isLoading) return <div className="text-gray-500">Loading...</div>;
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Lab Results</h1>
      <DataTable columns={[{ key: 'testName', header: 'Test' }, { key: 'value', header: 'Value' }, { key: 'status', header: 'Status' }]} data={data || []} />
    </div>
  );
}
