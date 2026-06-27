"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import { getDomainState, rememberAsset, rememberDomainState, rememberSearch } from "@/lib/workspace-memory";

type Primitive = string | number | boolean | null | undefined;

type FieldConfig = {
  name: string;
  labelKey: string;
  required?: boolean;
  inputType?: "text" | "number" | "textarea";
  options?: string[];
};

type FilterConfig = {
  name: string;
  labelKey: string;
  options: string[];
};

function formatValue(value: unknown) {
  if (value === null || value === undefined) {
    return "-";
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function parseFormValue(field: FieldConfig, value: string) {
  if (field.inputType === "number") {
    if (value.trim() === "") return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (field.name === "tags" || field.name === "models" || field.name === "capabilities") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return value;
}

export function CrudDomainScreen<T extends Record<string, unknown>>({
  titleKey,
  descriptionKey,
  queryKey,
  domainKey,
  fields,
  columns,
  filters,
  defaultSortBy,
  defaultSortOrder = "desc",
  listFn,
  createFn,
  updateFn,
  deleteFn,
}: {
  titleKey: string;
  descriptionKey: string;
  queryKey: string;
  domainKey?: string;
  fields: FieldConfig[];
  columns: string[];
  filters?: FilterConfig[];
  defaultSortBy?: string;
  defaultSortOrder?: "asc" | "desc";
  listFn: (query: Record<string, Primitive>) => Promise<T[]>;
  createFn: (payload: Record<string, unknown>) => Promise<unknown>;
  updateFn: (id: string, payload: Record<string, unknown>) => Promise<unknown>;
  deleteFn: (id: string) => Promise<unknown>;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const memoryDomainKey = domainKey || queryKey;
  const initialDomainState = getDomainState(memoryDomainKey);

  const [search, setSearch] = useState(initialDomainState?.search || "");
  const [sortBy, setSortBy] = useState(
    initialDomainState?.sortBy || defaultSortBy || columns[0] || "createdAt",
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(
    initialDomainState?.sortOrder || defaultSortOrder,
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialDomainState?.pageSize || 10);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  const [filterValues, setFilterValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    (filters || []).forEach((filter) => {
      initial[filter.name] = initialDomainState?.filters?.[filter.name] || "";
    });
    return initial;
  });

  useEffect(() => {
    rememberDomainState(memoryDomainKey, {
      search,
      sortBy,
      sortOrder,
      pageSize,
      filters: filterValues,
    });
  }, [filterValues, memoryDomainKey, pageSize, search, sortBy, sortOrder]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      if (search.trim()) {
        rememberSearch(search);
      }
    }, 500);
    return () => window.clearTimeout(id);
  }, [search]);

  const queryParams = useMemo(() => {
    return {
      search,
      sortBy,
      sortOrder,
      page,
      pageSize,
      ...filterValues,
    };
  }, [search, sortBy, sortOrder, page, pageSize, filterValues]);

  const { data, isLoading, error } = useQuery({
    queryKey: [queryKey, queryParams],
    queryFn: () => listFn(queryParams),
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (editingId) {
        return updateFn(editingId, payload);
      }
      return createFn(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      setEditingId(null);
      setFormValues({});
      setFormError(null);
    },
    onError: (err) => setFormError((err as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFn(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
    },
  });

  const items = Array.isArray(data) ? data : [];
  const hasNextPage = items.length >= pageSize;

  function startCreate() {
    setEditingId(null);
    setFormValues({});
    setFormError(null);
  }

  function startEdit(item: T) {
    if (item.id) {
      rememberAsset({
        id: String(item.id),
        domain: memoryDomainKey,
        label: String(item.name || item.title || item.id),
      });
    }
    setEditingId(String(item.id || ""));
    const nextValues: Record<string, string> = {};
    fields.forEach((field) => {
      const value = item[field.name];
      if (Array.isArray(value)) {
        nextValues[field.name] = value.join(", ");
      } else if (value === null || value === undefined) {
        nextValues[field.name] = "";
      } else if (typeof value === "object") {
        nextValues[field.name] = JSON.stringify(value);
      } else {
        nextValues[field.name] = String(value);
      }
    });
    setFormValues(nextValues);
    setFormError(null);
  }

  function handleSave() {
    const payload: Record<string, unknown> = {};

    for (const field of fields) {
      const raw = (formValues[field.name] || "").trim();
      if (field.required && raw === "") {
        setFormError(t("common.required", undefined, { field: t(field.labelKey, field.labelKey) }));
        return;
      }
      if (raw !== "") {
        payload[field.name] = parseFormValue(field, raw);
      }
    }

    saveMutation.mutate(payload);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t(titleKey, titleKey)}</CardTitle>
          <p className="text-sm text-slate-600">{t(descriptionKey, descriptionKey)}</p>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Input
            placeholder={t("common.search")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />

          {(filters || []).map((filter) => (
            <select
              key={filter.name}
              value={filterValues[filter.name] || ""}
              onChange={(e) => {
                setFilterValues((prev) => ({ ...prev, [filter.name]: e.target.value }));
                setPage(1);
              }}
              className="h-9 rounded-md border border-slate-300 px-3 text-sm"
            >
              <option value="">{t("common.allLabel", undefined, { label: t(filter.labelKey, filter.labelKey) })}</option>
              {filter.options.map((option) => (
                <option key={option} value={option}>
                  {t(`enum.${option}`, option)}
                </option>
              ))}
            </select>
          ))}

          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setPage(1);
            }}
            className="h-9 rounded-md border border-slate-300 px-3 text-sm"
          >
            {columns.map((column) => (
              <option key={column} value={column}>
                {t("common.sortBy", undefined, { field: t(`fields.${column}`, column) })}
              </option>
            ))}
          </select>

          <select
            value={sortOrder}
            onChange={(e) => {
              setSortOrder(e.target.value as "asc" | "desc");
              setPage(1);
            }}
            className="h-9 rounded-md border border-slate-300 px-3 text-sm"
          >
            <option value="desc">{t("common.desc")}</option>
            <option value="asc">{t("common.asc")}</option>
          </select>

          <div className="flex items-center gap-2">
            <select
              value={String(pageSize)}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="h-9 rounded-md border border-slate-300 px-3 text-sm"
            >
              {[10, 25, 50].map((size) => (
                <option key={size} value={size}>
                  {t("common.perPage", undefined, { size })}
                </option>
              ))}
            </select>
            <Button size="sm" variant="outline" onClick={startCreate}>
              {t("common.new")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{editingId ? t("common.edit") : t("common.create")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            {fields.map((field) => (
              <div key={field.name} className={field.inputType === "textarea" ? "md:col-span-2" : ""}>
                <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">{t(field.labelKey, field.labelKey)}</p>
                {field.options ? (
                  <select
                    value={formValues[field.name] || ""}
                    onChange={(e) =>
                      setFormValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                    }
                    className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm"
                  >
                    <option value="">{t("common.selectLabel", undefined, { label: t(field.labelKey, field.labelKey) })}</option>
                    {field.options.map((option) => (
                      <option key={option} value={option}>
                        {t(`enum.${option}`, option)}
                      </option>
                    ))}
                  </select>
                ) : field.inputType === "textarea" ? (
                  <textarea
                    value={formValues[field.name] || ""}
                    onChange={(e) =>
                      setFormValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                    }
                    className="min-h-[92px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                ) : (
                  <Input
                    type={field.inputType === "number" ? "number" : "text"}
                    value={formValues[field.name] || ""}
                    onChange={(e) =>
                      setFormValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                    }
                  />
                )}
              </div>
            ))}
          </div>

          {formError ? <p className="text-sm text-red-600">{formError}</p> : null}

          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? t("common.saving") : editingId ? t("common.update") : t("common.create")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={startCreate}
            >
              {t("common.clear")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("common.recordsCount", undefined, { count: items.length })}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <p className="text-sm text-slate-600">{t("common.loading")}</p> : null}
          {error ? <p className="text-sm text-red-600">{(error as Error).message}</p> : null}

          {!isLoading && !error && items.length === 0 ? (
            <p className="text-sm text-slate-600">{t("common.noRecordsForFilters")}</p>
          ) : null}

          {!isLoading && !error && items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    {columns.map((column) => (
                      <th key={column} className="px-2 py-2 text-left text-xs uppercase text-slate-500">
                        {t(`fields.${column}`, column)}
                      </th>
                    ))}
                    <th className="px-2 py-2 text-left text-xs uppercase text-slate-500">{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={String(item.id || JSON.stringify(item))} className="border-b border-slate-100 align-top">
                      {columns.map((column) => (
                        <td key={column} className="max-w-[260px] px-2 py-2 text-slate-800">
                          <span className="break-all">{formatValue(item[column])}</span>
                        </td>
                      ))}
                      <td className="px-2 py-2">
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => startEdit(item)}>
                            {t("common.edit")}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              if (!item.id) return;
                              const approved = window.confirm(t("common.deleteConfirm"));
                              if (approved) {
                                deleteMutation.mutate(String(item.id));
                              }
                            }}
                            disabled={deleteMutation.isPending}
                          >
                            {t("common.delete")}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-slate-500">{t("common.page", undefined, { page })}</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              >
                {t("common.previous")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!hasNextPage}
                onClick={() => setPage((prev) => prev + 1)}
              >
                {t("common.next")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
