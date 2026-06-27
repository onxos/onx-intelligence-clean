"use client";

import { CrudDomainScreen } from "@/components/crud-domain-screen";
import { api } from "@/lib/api/client";

export default function MemoryPage() {
  return (
    <CrudDomainScreen
      titleKey="domains.memory.title"
      descriptionKey="domains.memory.description"
      queryKey="memory"
      fields={[
        { name: "title", labelKey: "fields.title", required: true },
        { name: "content", labelKey: "fields.content", required: true, inputType: "textarea" },
        { name: "category", labelKey: "fields.category" },
        { name: "tags", labelKey: "fields.tags" },
      ]}
      columns={["id", "title", "category", "tags", "createdAt"]}
      filters={[
        { name: "category", labelKey: "fields.category", options: ["GENERAL", "INSIGHT", "RISK", "ACTION"] },
      ]}
      defaultSortBy="createdAt"
      listFn={(query) => api.workspace.memory(query) as Promise<Record<string, unknown>[]>}
      createFn={(payload) => api.workspace.createMemory(payload)}
      updateFn={(id, payload) => api.workspace.updateMemory(id, payload)}
      deleteFn={(id) => api.workspace.deleteMemory(id)}
    />
  );
}
