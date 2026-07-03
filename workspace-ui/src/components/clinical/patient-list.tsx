"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Patient } from "@/types/onx";

const STATUS_DOT: Record<Patient["status"], string> = {
  stable: "bg-[#22c55e]",
  monitoring: "bg-[#f59e0b]",
  critical: "bg-[#ef4444]",
};

export function PatientList({
  patients,
  selectedId,
  onSelect,
  onRefresh,
  loading,
}: {
  patients: Patient[];
  selectedId?: string;
  onSelect: (patient: Patient) => void;
  onRefresh?: () => void;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="text-sm">Patients</CardTitle>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">{patients.length}</span>
          {onRefresh ? (
            <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading}>
              {loading ? "…" : "Refresh"}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {patients.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(p)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
              selectedId === p.id ? "bg-slate-900 text-white" : "hover:bg-slate-100",
            )}
          >
            <span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_DOT[p.status])} />
            <span className="min-w-0 flex-1">
              <span className="font-medium">{p.name}</span>
              <span
                className={cn(
                  "ml-2 text-xs",
                  selectedId === p.id ? "text-slate-300" : "text-slate-500",
                )}
              >
                {p.species} · {p.breed}
              </span>
            </span>
          </button>
        ))}
        {patients.length === 0 ? (
          <p className="text-xs text-slate-500">No patients available in this workspace.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
