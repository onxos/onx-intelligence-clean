"use client";

import { CrudDomainScreen } from "@/components/crud-domain-screen";
import { api } from "@/lib/api/client";

export default function SourcesPage() {
  return (
    <CrudDomainScreen
      title="Sources"
      description="Manage provenance/source records for traceable workspace operations."
      queryKey="sources"
      fields={[
        { name: "action", label: "Action", required: true },
        { name: "resource", label: "Resource", required: true },
        { name: "resourceId", label: "Resource ID" },
        { name: "oldValue", label: "Old Value", inputType: "textarea" },
        { name: "newValue", label: "New Value", inputType: "textarea" },
      ]}
      columns={["id", "action", "resource", "resourceId", "createdAt"]}
      filters={[]}
      defaultSortBy="createdAt"
      listFn={(query) => api.workspace.sources(query) as Promise<any[]>}
      createFn={(payload) => api.workspace.createSource(payload)}
      updateFn={(id, payload) => api.workspace.updateSource(id, payload)}
      deleteFn={(id) => api.workspace.deleteSource(id)}
    />
  );
}
