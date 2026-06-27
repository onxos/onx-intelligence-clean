"use client";

import { CrudDomainScreen } from "@/components/crud-domain-screen";
import { api } from "@/lib/api/client";

export default function SourcesPage() {
  return (
    <CrudDomainScreen
      titleKey="domains.sources.title"
      descriptionKey="domains.sources.description"
      queryKey="sources"
      fields={[
        { name: "action", labelKey: "fields.action", required: true },
        { name: "resource", labelKey: "fields.resource", required: true },
        { name: "resourceId", labelKey: "fields.resourceId" },
        { name: "oldValue", labelKey: "fields.oldValue", inputType: "textarea" },
        { name: "newValue", labelKey: "fields.newValue", inputType: "textarea" },
      ]}
      columns={["id", "action", "resource", "resourceId", "createdAt"]}
      filters={[]}
      defaultSortBy="createdAt"
      listFn={(query) => api.workspace.sources(query) as Promise<Record<string, unknown>[]>}
      createFn={(payload) => api.workspace.createSource(payload)}
      updateFn={(id, payload) => api.workspace.updateSource(id, payload)}
      deleteFn={(id) => api.workspace.deleteSource(id)}
    />
  );
}
