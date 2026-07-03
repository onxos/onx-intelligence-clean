"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { PatientList } from "@/components/clinical/patient-list";
import { DiagnosisPanel } from "@/components/clinical/diagnosis-panel";
import { ProtocolView } from "@/components/clinical/protocol-view";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type {
  ClinicalAppointmentSchedule,
  Patient,
  SoapNoteRecord,
  VitalsTrendResult,
} from "@/types/onx";

type ClinicalTab =
  | "patientLifecycle"
  | "appointmentIntelligence"
  | "soapIntelligence"
  | "diagnosisSupport"
  | "orderIntelligence"
  | "vitalsTrending";

type Row = Record<string, unknown>;

const TABS: Array<{ id: ClinicalTab; label: string }> = [
  { id: "patientLifecycle", label: "Patient Lifecycle" },
  { id: "appointmentIntelligence", label: "Appointment Intelligence" },
  { id: "soapIntelligence", label: "SOAP Intelligence" },
  { id: "diagnosisSupport", label: "Diagnosis Support" },
  { id: "orderIntelligence", label: "Order Intelligence" },
  { id: "vitalsTrending", label: "Vitals Trending" },
];

function toPatient(row: Row): Patient {
  const statusRaw = String(row.status ?? "stable");
  const status: Patient["status"] =
    statusRaw === "critical" || statusRaw === "monitoring" ? statusRaw : "stable";
  const presentingRaw = row.presentingSigns;
  const presenting = Array.isArray(presentingRaw)
    ? presentingRaw.map((item) => String(item))
    : [];

  return {
    id: String(row.patientId ?? row.id ?? "unknown"),
    patientId: String(row.patientId ?? row.id ?? ""),
    name: String(row.name ?? "Unnamed"),
    species: String(row.species ?? "Unknown"),
    breed: String(row.breed ?? "Unknown"),
    ageYears: Number(row.ageYears ?? 0),
    weightKg: Number(row.weightKg ?? 0),
    status,
    presenting,
  };
}

function toAppointments(row: Row): ClinicalAppointmentSchedule {
  const scheduleRaw = Array.isArray(row.schedule) ? row.schedule : [];
  const waitlistRaw = Array.isArray(row.waitlist) ? row.waitlist : [];
  return {
    schedule: scheduleRaw.map((item) => {
      const record = item as Row;
      const status = String(record.status ?? "stable");
      return {
        patientId: String(record.patientId ?? ""),
        name: String(record.name ?? "Unknown"),
        status:
          status === "critical" || status === "monitoring" ? status : "stable",
        recommendedWindow: String(record.recommendedWindow ?? "--:--"),
        priority: Number(record.priority ?? 0),
        reason: String(record.reason ?? ""),
      };
    }),
    waitlist: waitlistRaw.map((item) => {
      const record = item as Row;
      return {
        id: String(record.id ?? ""),
        patientId: String(record.patientId ?? ""),
        priority: Number(record.priority ?? 0),
        reason:
          typeof record.reason === "string" && record.reason.length > 0
            ? record.reason
            : undefined,
      };
    }),
  };
}

function toVitalsHistory(items: Row[]): VitalsTrendResult[] {
  return items.map((item) => {
    const trendsRaw = Array.isArray(item.trends) ? item.trends : [];
    const alertsRaw = Array.isArray(item.alerts) ? item.alerts : [];
    return {
      workspaceId: String(item.workspaceId ?? ""),
      patientId: String(item.patientId ?? ""),
      trends: trendsRaw.map((trend) => {
        const row = trend as Row;
        return {
          kind: String(row.kind ?? "unknown"),
          count: Number(row.count ?? 0),
          average: Number(row.average ?? 0),
          latest: Number(row.latest ?? 0),
          change: Number(row.change ?? 0),
          anomaly: Boolean(row.anomaly),
        };
      }),
      alerts: alertsRaw.map((entry) => String(entry)),
    };
  });
}

function toSoapNotes(items: Row[]): SoapNoteRecord[] {
  return items.map((item) => {
    const noteRaw = (item.note as Row) ?? {};
    const tagsRaw = Array.isArray(item.tags) ? item.tags : [];
    return {
      id: String(item.id ?? ""),
      patientId: item.patientId === null ? null : String(item.patientId ?? ""),
      template: "SOAP",
      createdAt: String(item.createdAt ?? ""),
      note: {
        subjective: String(noteRaw.subjective ?? ""),
        objective: String(noteRaw.objective ?? ""),
        assessment: String(noteRaw.assessment ?? ""),
        plan: String(noteRaw.plan ?? ""),
      },
      tags: tagsRaw.map((tag) => String(tag)),
      transcriptSummary:
        typeof item.transcriptSummary === "string" ? item.transcriptSummary : null,
    };
  });
}

export default function ClinicalPage() {
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<ClinicalTab>("patientLifecycle");

  const patientsQuery = useQuery({
    queryKey: ["clinical", "patients"],
    queryFn: async () => {
      const rows = (await api.clinical.patients()) as Row[];
      return rows.map(toPatient);
    },
  });

  const selected = useMemo(() => {
    const patients = patientsQuery.data ?? [];
    if (patients.length === 0) {
      return null;
    }
    if (!selectedPatientId) {
      return patients[0];
    }
    return patients.find((patient) => patient.id === selectedPatientId) ?? patients[0];
  }, [patientsQuery.data, selectedPatientId]);

  const appointmentsQuery = useQuery({
    queryKey: ["clinical", "appointments"],
    queryFn: async () => toAppointments((await api.clinical.appointments()) as Row),
  });

  const soapQuery = useQuery({
    queryKey: ["clinical", "soap", selected?.id ?? "none"],
    enabled: Boolean(selected?.id),
    queryFn: async () =>
      toSoapNotes((await api.clinical.soapNotes(String(selected?.id))) as Row[]),
  });

  const vitalsQuery = useQuery({
    queryKey: ["clinical", "vitals", selected?.id ?? "none"],
    enabled: Boolean(selected?.id),
    queryFn: async () =>
      toVitalsHistory((await api.clinical.vitalsHistory(String(selected?.id))) as Row[]),
  });

  const patients = patientsQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Clinical Intelligence</h1>
        <p className="text-sm text-slate-500">
          AI-assisted differential support (HC-02: never a final diagnosis).
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center gap-2">
          {TABS.map((tab) => (
            <Button
              key={tab.id}
              size="sm"
              variant={activeTab === tab.id ? "default" : "outline"}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </Button>
          ))}
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
        <PatientList
          patients={patients}
          selectedId={selected?.id}
          onSelect={(patient) => setSelectedPatientId(patient.id)}
          onRefresh={() => void patientsQuery.refetch()}
          loading={patientsQuery.isFetching}
        />

        <div className="space-y-3">
          {selected ? (
            <>
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

              {activeTab === "patientLifecycle" ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Lifecycle Snapshot</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-slate-600">
                    <p>Patient ID: {selected.id}</p>
                    <p>Presenting signs: {selected.presenting.join(", ") || "None"}</p>
                  </CardContent>
                </Card>
              ) : null}

              {activeTab === "appointmentIntelligence" ? (
                <Card>
                  <CardHeader className="flex items-center justify-between">
                    <CardTitle className="text-sm">Appointment Intelligence</CardTitle>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void appointmentsQuery.refetch()}
                    >
                      Refresh
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {(appointmentsQuery.data?.schedule ?? []).map((row) => (
                      <div key={`${row.patientId}-${row.recommendedWindow}`} className="rounded-md border border-slate-200 p-2">
                        <p className="font-medium text-slate-800">
                          {row.name} · {row.recommendedWindow}
                        </p>
                        <p className="text-slate-600">
                          Priority {row.priority} · {row.reason}
                        </p>
                      </div>
                    ))}
                    {appointmentsQuery.data?.schedule.length === 0 ? (
                      <p className="text-slate-500">No schedule recommendations yet.</p>
                    ) : null}
                  </CardContent>
                </Card>
              ) : null}

              {activeTab === "soapIntelligence" ? (
                <Card>
                  <CardHeader className="flex items-center justify-between">
                    <CardTitle className="text-sm">SOAP Intelligence</CardTitle>
                    <Button size="sm" variant="outline" onClick={() => void soapQuery.refetch()}>
                      Refresh
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-slate-700">
                    {(soapQuery.data ?? []).map((row) => (
                      <div key={row.id} className="rounded-md border border-slate-200 p-2">
                        <p className="font-medium">{new Date(row.createdAt).toLocaleString()}</p>
                        <p>S: {row.note.subjective}</p>
                        <p>O: {row.note.objective}</p>
                        <p>A: {row.note.assessment}</p>
                        <p>P: {row.note.plan}</p>
                      </div>
                    ))}
                    {soapQuery.data?.length === 0 ? (
                      <p className="text-slate-500">No SOAP notes yet for this patient.</p>
                    ) : null}
                  </CardContent>
                </Card>
              ) : null}

              {activeTab === "diagnosisSupport" ? (
                <>
                  <DiagnosisPanel key={selected.id} patient={selected} />
                  <ProtocolView />
                </>
              ) : null}

              {activeTab === "orderIntelligence" ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Order Intelligence</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-slate-600">
                    Use the backend endpoint <code>/clinical/orders/recommendations</code> to generate
                    routing for lab, imaging, and medication orders.
                  </CardContent>
                </Card>
              ) : null}

              {activeTab === "vitalsTrending" ? (
                <Card>
                  <CardHeader className="flex items-center justify-between">
                    <CardTitle className="text-sm">Vitals Trending</CardTitle>
                    <Button size="sm" variant="outline" onClick={() => void vitalsQuery.refetch()}>
                      Refresh
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-slate-700">
                    {(vitalsQuery.data ?? []).flatMap((result) => result.trends).map((trend) => (
                      <div key={`${trend.kind}-${trend.latest}`} className="rounded-md border border-slate-200 p-2">
                        <p className="font-medium capitalize">{trend.kind}</p>
                        <p>
                          Latest {trend.latest.toFixed(2)} · Avg {trend.average.toFixed(2)} · Δ {(trend.change * 100).toFixed(1)}%
                        </p>
                        <p className={trend.anomaly ? "text-[#ef4444]" : "text-[#16a34a]"}>
                          {trend.anomaly ? "Anomaly detected" : "Within expected range"}
                        </p>
                      </div>
                    ))}
                    {(vitalsQuery.data ?? []).length === 0 ? (
                      <p className="text-slate-500">No vitals history yet for this patient.</p>
                    ) : null}
                  </CardContent>
                </Card>
              ) : null}
            </>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Clinical Intelligence</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-500">
                {patientsQuery.isLoading
                  ? "Loading patients..."
                  : "No clinical patients found. Create one from the API first."}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
