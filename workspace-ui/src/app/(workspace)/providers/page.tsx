"use client";

import { CrudDomainScreen } from "@/components/crud-domain-screen";
import { api } from "@/lib/api/client";

export default function ProvidersPage() {
  return (
    <CrudDomainScreen
      titleKey="domains.providers.title"
      descriptionKey="domains.providers.description"
      queryKey="providers"
      fields={[
        { name: "providerId", labelKey: "fields.providerId", required: true },
        { name: "providerName", labelKey: "fields.providerName", required: true },
        { name: "status", labelKey: "fields.status", options: ["ACTIVE", "INACTIVE", "EXPERIMENTAL", "DEPRECATED"] },
        { name: "priority", labelKey: "fields.priority", inputType: "number" },
        { name: "models", labelKey: "fields.models" },
        { name: "iseScore", labelKey: "fields.iseScore", inputType: "number" },
      ]}
      columns={["id", "providerId", "providerName", "status", "priority", "iseScore"]}
      filters={[
        { name: "status", labelKey: "fields.status", options: ["ACTIVE", "INACTIVE", "EXPERIMENTAL", "DEPRECATED"] },
      ]}
      defaultSortBy="priority"
      defaultSortOrder="asc"
      listFn={(query) => api.providers.list(query) as Promise<Record<string, unknown>[]>}
      createFn={(payload) => api.providers.create(payload)}
      updateFn={(id, payload) => api.providers.update(id, payload)}
      deleteFn={(id) => api.providers.remove(id)}
    />
  );
}
