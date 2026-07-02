"use client";

import { useState } from "react";
import { PatientList } from "@/components/clinical/patient-list";
import { DiagnosisPanel } from "@/components/clinical/diagnosis-panel";
import { ProtocolView } from "@/components/clinical/protocol-view";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MOCK_PATIENTS } from "@/lib/mock-patients";
import type { Patient } from "@/types/onx";

export default function ClinicalPage() {
  const [selected, setSelected] = useState<Patient>(MOCK_PATIENTS[0]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Clinical Intelligence</h1>
        <p className="text-sm text-slate-500">
          AI-assisted differential support (HC-02: never a final diagnosis).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
        <PatientList patients={MOCK_PATIENTS} selectedId={selected?.id} onSelect={setSelected} />

        <div className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                {selected.name} — {selected.breed}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
              <span>Species: {selected.species}</span>
              <span>Age: {selected.ageYears}y</span>
              <span>Weight: {selected.weightKg}kg</span>
              <span className="capitalize">Status: {selected.status}</span>
            </CardContent>
          </Card>

          <DiagnosisPanel key={selected.id} patient={selected} />
          <ProtocolView />
        </div>
      </div>
    </div>
  );
}
