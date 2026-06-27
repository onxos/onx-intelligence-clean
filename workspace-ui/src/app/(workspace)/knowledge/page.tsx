"use client";

import { CrudDomainScreen } from "@/components/crud-domain-screen";
import { api } from "@/lib/api/client";

export default function KnowledgePage() {
  return (
    <CrudDomainScreen
      title="Knowledge Assets"
      description="Curate workspace knowledge assets with real persistence and governance metadata."
      queryKey="knowledge-assets"
      fields={[
        { name: "name", label: "Name", required: true },
        { name: "content", label: "Content", required: true, inputType: "textarea" },
        {
          name: "objectType",
          label: "Type",
          options: ["FACT", "PATTERN", "SIGNAL", "JUDGMENT", "UNDERSTANDING"],
        },
        { name: "semanticSummary", label: "Summary", inputType: "textarea" },
        {
          name: "privacyLevel",
          label: "Privacy",
          options: ["PUBLIC", "INSTITUTIONAL", "PRIVATE"],
        },
      ]}
      columns={["id", "name", "objectType", "privacyLevel", "createdAt"]}
      filters={[
        {
          name: "objectType",
          label: "Type",
          options: ["FACT", "PATTERN", "SIGNAL", "JUDGMENT", "UNDERSTANDING"],
        },
      ]}
      defaultSortBy="createdAt"
      listFn={(query) =>
        api.workspace.knowledgeAssets({ ...query, type: query.objectType }) as Promise<any[]>
      }
      createFn={(payload) => api.workspace.createKnowledgeAsset(payload)}
      updateFn={(id, payload) => api.workspace.updateKnowledgeAsset(id, payload)}
      deleteFn={(id) => api.workspace.deleteKnowledgeAsset(id)}
    />
  );
}
