"use client";

import { CrudDomainScreen } from "@/components/crud-domain-screen";
import { api } from "@/lib/api/client";

export default function MemoryPage() {
  return (
    <CrudDomainScreen
      title="Memory"
      description="Persist operational memory entries with category and tags."
      queryKey="memory"
      fields={[
        { name: "title", label: "Title", required: true },
        { name: "content", label: "Content", required: true, inputType: "textarea" },
        { name: "category", label: "Category" },
        { name: "tags", label: "Tags (comma separated)" },
      ]}
      columns={["id", "title", "category", "tags", "createdAt"]}
      filters={[
        { name: "category", label: "Category", options: ["GENERAL", "INSIGHT", "RISK", "ACTION"] },
      ]}
      defaultSortBy="createdAt"
      listFn={(query) => api.workspace.memory(query) as Promise<any[]>}
      createFn={(payload) => api.workspace.createMemory(payload)}
      updateFn={(id, payload) => api.workspace.updateMemory(id, payload)}
      deleteFn={(id) => api.workspace.deleteMemory(id)}
    />
  );
}
