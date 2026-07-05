import { useMedicalRecords } from '../api/queries';
import { DataTable } from '../components/DataTable';
export function MedicalRecordsPage() {
  const { data, isLoading } = useMedicalRecords();
  if (isLoading) return <div className="text-gray-500">Loading...</div>;
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Medical Records</h1>
      <DataTable columns={[{ key: 'chiefComplaint', header: 'Chief Complaint' }, { key: 'diagnosis', header: 'Diagnosis' }, { key: 'visitType', header: 'Visit Type' }]} data={data || []} />
    </div>
  );
}
