import { useAppointments } from '../api/queries';
import { DataTable } from '../components/DataTable';
export function AppointmentsPage() {
  const { data, isLoading } = useAppointments();
  if (isLoading) return <div className="text-gray-500">Loading...</div>;
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Appointments</h1>
      <DataTable columns={[{ key: 'title', header: 'Title' }, { key: 'date', header: 'Date', render: (r) => new Date(r.date).toLocaleString() }, { key: 'status', header: 'Status' }, { key: 'type', header: 'Type' }]} data={data || []} />
    </div>
  );
}
