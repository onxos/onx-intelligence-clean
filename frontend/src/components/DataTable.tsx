import { useState } from 'react';

interface Column<T> { key: string; header: string; render?: (row: T) => React.ReactNode; }

interface Props<T> { columns: Column<T>[]; data: T[]; onRowClick?: (row: T) => void; searchable?: boolean; searchFields?: string[]; }

export function DataTable<T extends Record<string, any>>({ columns, data, onRowClick, searchable, searchFields }: Props<T>) {
  const [search, setSearch] = useState('');
  const filtered = searchable && search
    ? data.filter((row) => searchFields?.some((f) => String(row[f] || '').toLowerCase().includes(search.toLowerCase())))
    : data;

  return (
    <div>
      {searchable && (
        <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="mb-4 px-4 py-2 border border-gray-200 rounded-lg text-sm w-72 focus:outline-none focus:ring-2 focus:ring-onx-500" />
      )}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>{columns.map((c) => <th key={c.key} className="px-6 py-3 text-left font-medium text-gray-500">{c.header}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((row, i) => (
              <tr key={i} onClick={() => onRowClick?.(row)} className={onRowClick ? 'hover:bg-gray-50 cursor-pointer' : ''}>
                {columns.map((c) => <td key={c.key} className="px-6 py-4 text-gray-900">{c.render ? c.render(row) : row[c.key]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
