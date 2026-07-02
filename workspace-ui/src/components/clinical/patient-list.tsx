"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
}: {
  patients: Patient[];
  selectedId?: string;
  onSelect: (patient: Patient) => void;
}) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="text-sm">Patients</CardTitle>
        <span className="text-xs text-slate-500">{patients.length}</span>
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
      </CardContent>
    </Card>
  );
}
