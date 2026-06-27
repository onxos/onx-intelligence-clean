"use client";

import { DomainScreen } from "@/components/domain-screen";
import { api } from "@/lib/api/client";

export default function KnowledgePage() {
  return (
    <DomainScreen
      title="Knowledge Assets"
      description="Knowledge assets from workspace knowledge endpoint."
      queryKey={["knowledge-assets"]}
      queryFn={api.workspace.knowledgeAssets}
    />
  );
}
