"use client";

import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ResponseCard } from "@/components/ai/response-card";
import type { AiQueryResult, Patient } from "@/types/onx";

export function DiagnosisPanel({ patient }: { patient: Patient }) {
  const mutation = useMutation({
    mutationFn: async () =>
      (await api.ai.clinicalDiagnosis({
        symptoms: patient.presenting,
        history: `${patient.name} — ${patient.breed}, ${patient.ageYears}y, ${patient.weightKg}kg`,
      })) as AiQueryResult,
  });

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle className="text-sm">AI Diagnosis Support</CardTitle>
          <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Analyzing…" : "Run AI Diagnosis"}
          </Button>
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Presenting signs</p>
          <div className="flex flex-wrap gap-1.5">
            {patient.presenting.map((s) => (
              <span key={s} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                {s}
              </span>
            ))}
          </div>
          {mutation.isError ? (
            <p className="mt-2 text-sm text-[#ef4444]">
              {(mutation.error as Error)?.message ?? "Request failed."}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {mutation.data ? <ResponseCard result={mutation.data} clinical /> : null}
    </div>
  );
}
