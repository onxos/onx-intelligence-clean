"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Primitive = string | number | boolean | null | undefined;

type FieldConfig = {
  name: string;
  label: string;
  required?: boolean;
  inputType?: "text" | "number" | "textarea";
  options?: string[];
};

type FilterConfig = {
  name: string;
  label: string;
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
  title,
  description,
  queryKey,
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
  title: string;
  description: string;
  queryKey: string;
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
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState(defaultSortBy || columns[0] || "createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(defaultSortOrder);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  const [filterValues, setFilterValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    (filters || []).forEach((filter) => {
      initial[filter.name] = "";
    });
    return initial;
  });

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
        setFormError(`${field.label} is required.`);
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
          <CardTitle>{title}</CardTitle>
          <p className="text-sm text-slate-600">{description}</p>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Input
            placeholder="Search..."
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
              <option value="">All {filter.label}</option>
              {filter.options.map((option) => (
                <option key={option} value={option}>
                  {option}
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
                Sort by {column}
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
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
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
                  {size} / page
                </option>
              ))}
            </select>
            <Button size="sm" variant="outline" onClick={startCreate}>
              New
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Edit Record" : "Create Record"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            {fields.map((field) => (
              <div key={field.name} className={field.inputType === "textarea" ? "md:col-span-2" : ""}>
                <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">{field.label}</p>
                {field.options ? (
                  <select
                    value={formValues[field.name] || ""}
                    onChange={(e) =>
                      setFormValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                    }
                    className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm"
                  >
                    <option value="">Select {field.label}</option>
                    {field.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
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
              {saveMutation.isPending ? "Saving..." : editingId ? "Update" : "Create"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={startCreate}
            >
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Records ({items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <p className="text-sm text-slate-600">Loading...</p> : null}
          {error ? <p className="text-sm text-red-600">{(error as Error).message}</p> : null}

          {!isLoading && !error && items.length === 0 ? (
            <p className="text-sm text-slate-600">No records found for current filters.</p>
          ) : null}

          {!isLoading && !error && items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    {columns.map((column) => (
                      <th key={column} className="px-2 py-2 text-left text-xs uppercase text-slate-500">
                        {column}
                      </th>
                    ))}
                    <th className="px-2 py-2 text-left text-xs uppercase text-slate-500">actions</th>
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
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              if (!item.id) return;
                              const approved = window.confirm("Delete this record?");
                              if (approved) {
                                deleteMutation.mutate(String(item.id));
                              }
                            }}
                            disabled={deleteMutation.isPending}
                          >
                            Delete
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
            <p className="text-xs text-slate-500">Page {page}</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!hasNextPage}
                onClick={() => setPage((prev) => prev + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
