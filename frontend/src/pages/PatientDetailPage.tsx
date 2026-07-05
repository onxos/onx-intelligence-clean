import { useParams } from 'react-router-dom';
import { usePatient } from '../api/queries';

export function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: p, isLoading } = usePatient(id!);
  if (isLoading) return <div className="text-gray-500">Loading...</div>;
  if (!p) return <div className="text-red-500">Patient not found</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{p.name}</h1>
      <p className="text-gray-500 mb-6">{p.species} — {p.breed || 'Unknown'}</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h2>
          <dl className="space-y-3">
            {[
              ['Age', `${p.age} years`], ['Gender', p.gender], ['Weight', `${p.weight} kg`],
              ['Owner', p.ownerName], ['Phone', p.ownerPhone || '—'], ['Email', p.ownerEmail || '—'],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between"><dt className="text-sm text-gray-500">{label}</dt><dd className="text-sm font-medium">{value}</dd></div>
            ))}
          </dl>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Medical Notes</h2>
          <p className="text-sm text-gray-600">{p.medicalNotes || 'No medical notes.'}</p>
          {p.allergies?.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-red-600 mb-2">Allergies</h3>
              <div className="flex flex-wrap gap-2">
                {p.allergies.map((a: string) => <span key={a} className="px-2 py-1 bg-red-50 text-red-700 rounded-full text-xs">{a}</span>)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
