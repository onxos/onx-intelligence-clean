"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CapitalRecord = Record<string, unknown>;

const categoryOptions = ["CLINICAL", "OPERATIONS", "COMMERCIAL", "STRATEGY", "GOVERNANCE", "KNOWLEDGE"];
const allocationStatusOptions = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "ALLOCATED", "CANCELLED", "ARCHIVED"];
const policyStatusOptions = ["ACTIVE", "INACTIVE", "ARCHIVED"];

function renderValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function CapitalPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [selectedAllocationId, setSelectedAllocationId] = useState<string | null>(null);
  const [allocationForm, setAllocationForm] = useState<Record<string, string>>({
    category: "OPERATIONS",
    amount: "",
    currency: "USD",
    source: "",
    target: "",
    priority: "3",
    rationale: "",
    status: "DRAFT",
    policyId: "",
  });
  const [policyForm, setPolicyForm] = useState<Record<string, string>>({
    name: "",
    description: "",
    category: "GOVERNANCE",
    currency: "USD",
    source: "",
    target: "",
    priority: "3",
    rationale: "",
    status: "ACTIVE",
  });
  const [allocationAction, setAllocationAction] = useState<Record<string, string>>({
    rationale: "",
    decisionReason: "",
  });
  const [editingAllocationId, setEditingAllocationId] = useState<string | null>(null);
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const allocations = useQuery({ queryKey: ["capital-allocations"], queryFn: () => api.capital.allocations() as Promise<CapitalRecord[]> });
  const policies = useQuery({ queryKey: ["capital-policies"], queryFn: () => api.capital.policies() as Promise<CapitalRecord[]> });
  const reports = useQuery({ queryKey: ["capital-reports"], queryFn: () => api.capital.reports() as Promise<CapitalRecord> });
  const history = useQuery({ queryKey: ["capital-history"], queryFn: () => api.capital.history({ page: 1, pageSize: 20 }) as Promise<CapitalRecord[]> });
  const selectedAllocation = useQuery({
    queryKey: ["capital-allocation", selectedAllocationId],
    queryFn: () => api.capital.allocationDetails(selectedAllocationId || "") as Promise<CapitalRecord>,
    enabled: Boolean(selectedAllocationId),
  });

  const allocationMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editingAllocationId
        ? api.capital.updateAllocation(editingAllocationId, payload)
        : api.capital.createAllocation(payload),
    onSuccess: async () => {
      setAllocationForm({ category: "OPERATIONS", amount: "", currency: "USD", source: "", target: "", priority: "3", rationale: "", status: "DRAFT", policyId: "" });
      setEditingAllocationId(null);
      setErrorMessage(null);
      await queryClient.invalidateQueries({ queryKey: ["capital-allocations"] });
      await queryClient.invalidateQueries({ queryKey: ["capital-reports"] });
      await queryClient.invalidateQueries({ queryKey: ["capital-history"] });
    },
    onError: (error) => setErrorMessage((error as Error).message),
  });

  const policyMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editingPolicyId ? api.capital.updatePolicy(editingPolicyId, payload) : api.capital.createPolicy(payload),
    onSuccess: async () => {
      setPolicyForm({ name: "", description: "", category: "GOVERNANCE", currency: "USD", source: "", target: "", priority: "3", rationale: "", status: "ACTIVE" });
      setEditingPolicyId(null);
      setErrorMessage(null);
      await queryClient.invalidateQueries({ queryKey: ["capital-policies"] });
      await queryClient.invalidateQueries({ queryKey: ["capital-reports"] });
      await queryClient.invalidateQueries({ queryKey: ["capital-history"] });
    },
    onError: (error) => setErrorMessage((error as Error).message),
  });

  const actionMutation = useMutation({
    mutationFn: async ({ kind, id }: { kind: "approve" | "reject" | "delete" | "restore"; id: string }) => {
      if (kind === "approve") return api.capital.approveAllocation(id, allocationAction);
      if (kind === "reject") return api.capital.rejectAllocation(id, allocationAction);
      if (kind === "restore") return api.capital.restoreAllocation(id);
      return api.capital.deleteAllocation(id);
    },
    onSuccess: async (_, variables) => {
      setErrorMessage(null);
      if (variables.kind === "approve" || variables.kind === "reject") {
        setAllocationAction({ rationale: "", decisionReason: "" });
      }
      await queryClient.invalidateQueries({ queryKey: ["capital-allocations"] });
      await queryClient.invalidateQueries({ queryKey: ["capital-allocation", variables.id] });
      await queryClient.invalidateQueries({ queryKey: ["capital-reports"] });
      await queryClient.invalidateQueries({ queryKey: ["capital-history"] });
    },
    onError: (error) => setErrorMessage((error as Error).message),
  });

  const policyActionMutation = useMutation({
    mutationFn: ({ kind, id }: { kind: "delete" | "restore"; id: string }) =>
      kind === "restore" ? api.capital.restorePolicy(id) : api.capital.deletePolicy(id),
    onSuccess: async () => {
      setErrorMessage(null);
      await queryClient.invalidateQueries({ queryKey: ["capital-policies"] });
      await queryClient.invalidateQueries({ queryKey: ["capital-reports"] });
      await queryClient.invalidateQueries({ queryKey: ["capital-history"] });
    },
    onError: (error) => setErrorMessage((error as Error).message),
  });

  const allocationItems = useMemo(() => (Array.isArray(allocations.data) ? allocations.data : []), [allocations.data]);
  const policyItems = useMemo(() => (Array.isArray(policies.data) ? policies.data : []), [policies.data]);
  const historyItems = useMemo(() => (Array.isArray(history.data) ? history.data : []), [history.data]);

  const isLoading = allocations.isLoading || policies.isLoading || reports.isLoading || history.isLoading;
  const queryError = allocations.error || policies.error || reports.error || history.error || selectedAllocation.error;

  function saveAllocation() {
    if (!allocationForm.amount.trim()) {
      setErrorMessage(t("common.required", undefined, { field: t("fields.amount") }));
      return;
    }
    allocationMutation.mutate({
      category: allocationForm.category,
      amount: Number(allocationForm.amount),
      currency: allocationForm.currency,
      source: allocationForm.source || undefined,
      target: allocationForm.target || undefined,
      priority: Number(allocationForm.priority || "3"),
      rationale: allocationForm.rationale || undefined,
      status: allocationForm.status,
      policyId: allocationForm.policyId || undefined,
    });
  }

  function savePolicy() {
    if (!policyForm.name.trim()) {
      setErrorMessage(t("common.required", undefined, { field: t("fields.name") }));
      return;
    }
    policyMutation.mutate({
      name: policyForm.name,
      description: policyForm.description || undefined,
      category: policyForm.category,
      currency: policyForm.currency,
      source: policyForm.source || undefined,
      target: policyForm.target || undefined,
      priority: Number(policyForm.priority || "3"),
      rationale: policyForm.rationale || undefined,
      status: policyForm.status,
    });
  }

  function beginAllocationEdit(item: CapitalRecord) {
    setEditingAllocationId(String(item.id || ""));
    setSelectedAllocationId(String(item.id || ""));
    setAllocationForm({
      category: String(item.category || "OPERATIONS"),
      amount: String(item.amount || ""),
      currency: String(item.currency || "USD"),
      source: String(item.source || ""),
      target: String(item.target || ""),
      priority: String(item.priority || "3"),
      rationale: String(item.rationale || ""),
      status: String(item.status || "DRAFT"),
      policyId: String(item.policyId || ""),
    });
  }

  function beginPolicyEdit(item: CapitalRecord) {
    setEditingPolicyId(String(item.id || ""));
    setPolicyForm({
      name: String(item.name || ""),
      description: String(item.description || ""),
      category: String(item.category || "GOVERNANCE"),
      currency: String(item.currency || "USD"),
      source: String(item.source || ""),
      target: String(item.target || ""),
      priority: String(item.priority || "3"),
      rationale: String(item.rationale || ""),
      status: String(item.status || "ACTIVE"),
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("domains.capital.title")}</CardTitle>
          <p className="text-sm text-slate-600">{t("domains.capital.description")}</p>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">{t("domains.capital.draftHint")}</p>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card><CardContent className="py-8 text-sm text-slate-600">{t("common.loading")}</CardContent></Card>
      ) : null}

      {queryError || errorMessage ? (
        <Card><CardContent className="py-4 text-sm text-red-600">{String((queryError as Error)?.message || errorMessage)}</CardContent></Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t("domains.capital.allocations")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <select className="h-9 rounded-md border border-slate-300 px-3 text-sm" value={allocationForm.category} onChange={(e) => setAllocationForm((prev) => ({ ...prev, category: e.target.value }))}>
                {categoryOptions.map((option) => <option key={option} value={option}>{t(`enum.${option}`, option)}</option>)}
              </select>
              <Input value={allocationForm.amount} onChange={(e) => setAllocationForm((prev) => ({ ...prev, amount: e.target.value }))} placeholder={t("fields.amount")} type="number" />
              <Input value={allocationForm.currency} onChange={(e) => setAllocationForm((prev) => ({ ...prev, currency: e.target.value }))} placeholder={t("fields.currency")} />
              <Input value={allocationForm.source} onChange={(e) => setAllocationForm((prev) => ({ ...prev, source: e.target.value }))} placeholder={t("fields.source")} />
              <Input value={allocationForm.target} onChange={(e) => setAllocationForm((prev) => ({ ...prev, target: e.target.value }))} placeholder={t("fields.target")} />
              <Input value={allocationForm.priority} onChange={(e) => setAllocationForm((prev) => ({ ...prev, priority: e.target.value }))} placeholder={t("fields.priority")} type="number" />
              <select className="h-9 rounded-md border border-slate-300 px-3 text-sm" value={allocationForm.status} onChange={(e) => setAllocationForm((prev) => ({ ...prev, status: e.target.value }))}>
                {allocationStatusOptions.map((option) => <option key={option} value={option}>{t(`enum.${option}`, option)}</option>)}
              </select>
              <select className="h-9 rounded-md border border-slate-300 px-3 text-sm" value={allocationForm.policyId} onChange={(e) => setAllocationForm((prev) => ({ ...prev, policyId: e.target.value }))}>
                <option value="">{t("common.selectLabel", undefined, { label: t("domains.capital.policies") })}</option>
                {policyItems.filter((item) => !item.deletedAt).map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.name || item.id)}</option>)}
              </select>
              <textarea className="min-h-[92px] rounded-md border border-slate-300 px-3 py-2 text-sm md:col-span-2 xl:col-span-3" value={allocationForm.rationale} onChange={(e) => setAllocationForm((prev) => ({ ...prev, rationale: e.target.value }))} placeholder={t("fields.rationale")} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={saveAllocation} disabled={allocationMutation.isPending}>{editingAllocationId ? t("common.update") : t("common.create")}</Button>
              <Button size="sm" variant="outline" onClick={() => { setEditingAllocationId(null); setAllocationForm({ category: "OPERATIONS", amount: "", currency: "USD", source: "", target: "", priority: "3", rationale: "", status: "DRAFT", policyId: "" }); }}>{t("common.clear")}</Button>
            </div>
            <div className="space-y-2">
              {allocationItems.length === 0 ? <p className="text-sm text-slate-600">{t("common.noRecords")}</p> : allocationItems.map((item) => (
                <div key={String(item.id)} className="rounded-md border border-slate-200 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">{renderValue(item.target) || renderValue(item.id)}</p>
                      <p className="text-sm text-slate-600">{renderValue(item.category)} · {renderValue(item.status)} · {renderValue(item.amount)} {renderValue(item.currency)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => { setSelectedAllocationId(String(item.id)); }}>{t("domains.capital.details")}</Button>
                      <Button size="sm" variant="outline" onClick={() => beginAllocationEdit(item)}>{t("common.edit")}</Button>
                      {!item.deletedAt ? <Button size="sm" variant="outline" onClick={() => actionMutation.mutate({ kind: "delete", id: String(item.id) })}>{t("common.delete")}</Button> : <Button size="sm" variant="outline" onClick={() => actionMutation.mutate({ kind: "restore", id: String(item.id) })}>{t("domains.capital.restore")}</Button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("domains.capital.details")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedAllocation.data ? (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  {Object.entries(selectedAllocation.data).map(([key, value]) => (
                    <div key={key}>
                      <p className="text-xs uppercase tracking-wide text-slate-500">{t(`fields.${key}`, key)}</p>
                      <p className="break-all text-sm text-slate-900">{renderValue(value)}</p>
                    </div>
                  ))}
                </div>
                <div className="space-y-2 rounded-md border border-slate-200 p-3">
                  <p className="text-sm font-medium text-slate-900">{t("domains.capital.actions")}</p>
                  <Input value={allocationAction.rationale} onChange={(e) => setAllocationAction((prev) => ({ ...prev, rationale: e.target.value }))} placeholder={t("fields.rationale")} />
                  <Input value={allocationAction.decisionReason} onChange={(e) => setAllocationAction((prev) => ({ ...prev, decisionReason: e.target.value }))} placeholder={t("fields.decisionReason")} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => actionMutation.mutate({ kind: "approve", id: String(selectedAllocation.data?.id) })} disabled={actionMutation.isPending}>{t("domains.capital.approve")}</Button>
                    <Button size="sm" variant="outline" onClick={() => actionMutation.mutate({ kind: "reject", id: String(selectedAllocation.data?.id) })} disabled={actionMutation.isPending}>{t("domains.capital.reject")}</Button>
                  </div>
                </div>
              </>
            ) : <p className="text-sm text-slate-600">{t("common.noRecords")}</p>}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t("domains.capital.policies")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <Input value={policyForm.name} onChange={(e) => setPolicyForm((prev) => ({ ...prev, name: e.target.value }))} placeholder={t("fields.name")} />
              <select className="h-9 rounded-md border border-slate-300 px-3 text-sm" value={policyForm.category} onChange={(e) => setPolicyForm((prev) => ({ ...prev, category: e.target.value }))}>
                {categoryOptions.map((option) => <option key={option} value={option}>{t(`enum.${option}`, option)}</option>)}
              </select>
              <Input value={policyForm.currency} onChange={(e) => setPolicyForm((prev) => ({ ...prev, currency: e.target.value }))} placeholder={t("fields.currency")} />
              <Input value={policyForm.source} onChange={(e) => setPolicyForm((prev) => ({ ...prev, source: e.target.value }))} placeholder={t("fields.source")} />
              <Input value={policyForm.target} onChange={(e) => setPolicyForm((prev) => ({ ...prev, target: e.target.value }))} placeholder={t("fields.target")} />
              <Input value={policyForm.priority} onChange={(e) => setPolicyForm((prev) => ({ ...prev, priority: e.target.value }))} placeholder={t("fields.priority")} type="number" />
              <select className="h-9 rounded-md border border-slate-300 px-3 text-sm" value={policyForm.status} onChange={(e) => setPolicyForm((prev) => ({ ...prev, status: e.target.value }))}>
                {policyStatusOptions.map((option) => <option key={option} value={option}>{t(`enum.${option}`, option)}</option>)}
              </select>
              <textarea className="min-h-[92px] rounded-md border border-slate-300 px-3 py-2 text-sm md:col-span-2 xl:col-span-3" value={policyForm.description} onChange={(e) => setPolicyForm((prev) => ({ ...prev, description: e.target.value }))} placeholder={t("fields.description")} />
              <textarea className="min-h-[92px] rounded-md border border-slate-300 px-3 py-2 text-sm md:col-span-2 xl:col-span-3" value={policyForm.rationale} onChange={(e) => setPolicyForm((prev) => ({ ...prev, rationale: e.target.value }))} placeholder={t("fields.rationale")} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={savePolicy} disabled={policyMutation.isPending}>{editingPolicyId ? t("common.update") : t("common.create")}</Button>
              <Button size="sm" variant="outline" onClick={() => { setEditingPolicyId(null); setPolicyForm({ name: "", description: "", category: "GOVERNANCE", currency: "USD", source: "", target: "", priority: "3", rationale: "", status: "ACTIVE" }); }}>{t("common.clear")}</Button>
            </div>
            <div className="space-y-2">
              {policyItems.length === 0 ? <p className="text-sm text-slate-600">{t("common.noRecords")}</p> : policyItems.map((item) => (
                <div key={String(item.id)} className="rounded-md border border-slate-200 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">{renderValue(item.name)}</p>
                      <p className="text-sm text-slate-600">{renderValue(item.category)} · {renderValue(item.status)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => beginPolicyEdit(item)}>{t("common.edit")}</Button>
                      {!item.deletedAt ? <Button size="sm" variant="outline" onClick={() => policyActionMutation.mutate({ kind: "delete", id: String(item.id) })}>{t("common.delete")}</Button> : <Button size="sm" variant="outline" onClick={() => policyActionMutation.mutate({ kind: "restore", id: String(item.id) })}>{t("domains.capital.restore")}</Button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("domains.capital.reports")}</CardTitle>
            </CardHeader>
            <CardContent>
              {reports.data ? <pre className="whitespace-pre-wrap break-all text-xs">{JSON.stringify(reports.data, null, 2)}</pre> : <p className="text-sm text-slate-600">{t("domains.capital.emptyReports")}</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("domains.capital.history")}</CardTitle>
            </CardHeader>
            <CardContent>
              {historyItems.length === 0 ? <p className="text-sm text-slate-600">{t("domains.capital.emptyHistory")}</p> : (
                <div className="space-y-2">
                  {historyItems.map((item) => (
                    <div key={String(item.id)} className="rounded-md border border-slate-200 p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-500">{renderValue(item.action)}</p>
                      <p className="text-sm text-slate-800">{renderValue(item.status)}</p>
                      <p className="text-xs text-slate-500">{t("fields.actor")}: {renderValue(item.actorId)}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}