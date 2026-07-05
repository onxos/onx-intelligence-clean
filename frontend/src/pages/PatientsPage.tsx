import { useNavigate } from 'react-router-dom';
import { DataTable } from '../components/DataTable';
import { usePatients } from '../api/queries';
import { Plus } from 'lucide-react';

export function PatientsPage() {
  const { data: patients, isLoading } = usePatients();
  const navigate = useNavigate();
  if (isLoading) return <div className="text-gray-500">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Patients</h1>
        <button className="flex items-center gap-2 bg-onx-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-onx-700">
          <Plus size={16} /> Add Patient
        </button>
      </div>
      <DataTable
        columns={[
          { key: 'name', header: 'Name' },
          { key: 'species', header: 'Species' },
          { key: 'breed', header: 'Breed' },
          { key: 'ownerName', header: 'Owner' },
          { key: 'status', header: 'Status', render: (r) => <span className={`px-2 py-1 rounded-full text-xs font-medium ${r.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{r.status}</span> },
        ]}
        data={patients || []}
        onRowClick={(row) => navigate(`/patients/${row.id}`)}
        searchable
        searchFields={['name', 'ownerName', 'species']}
      />
    </div>
  );
}
