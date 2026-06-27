"use client";

import { CrudDomainScreen } from "@/components/crud-domain-screen";
import { api } from "@/lib/api/client";

export default function KnowledgePage() {
  return (
    <CrudDomainScreen
      titleKey="domains.knowledge.title"
      descriptionKey="domains.knowledge.description"
      queryKey="knowledge-assets"
      fields={[
        { name: "name", labelKey: "fields.name", required: true },
        { name: "content", labelKey: "fields.content", required: true, inputType: "textarea" },
        {
          name: "objectType",
          labelKey: "fields.objectType",
          options: ["SIGNAL", "PATTERN", "JUDGMENT", "UNDERSTANDING", "WISDOM", "EXTERNAL_INTELLIGENCE"],
        },
        { name: "semanticSummary", labelKey: "fields.semanticSummary", inputType: "textarea" },
        {
          name: "privacyLevel",
          labelKey: "fields.privacyLevel",
          options: ["PUBLIC", "INSTITUTIONAL", "CONFIDENTIAL", "RESTRICTED"],
        },
      ]}
      columns={["id", "name", "objectType", "privacyLevel", "createdAt"]}
      filters={[
        {
          name: "objectType",
          labelKey: "fields.objectType",
          options: ["SIGNAL", "PATTERN", "JUDGMENT", "UNDERSTANDING", "WISDOM", "EXTERNAL_INTELLIGENCE"],
        },
      ]}
      defaultSortBy="createdAt"
      listFn={(query) =>
        api.workspace.knowledgeAssets({ ...query, type: query.objectType }) as Promise<Record<string, unknown>[]>
      }
      createFn={(payload) => api.workspace.createKnowledgeAsset(payload)}
      updateFn={(id, payload) => api.workspace.updateKnowledgeAsset(id, payload)}
      deleteFn={(id) => api.workspace.deleteKnowledgeAsset(id)}
    />
  );
}
