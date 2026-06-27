"use client";

import { DomainScreen } from "@/components/domain-screen";
import { api } from "@/lib/api/client";

export default function SourcesPage() {
  return (
    <DomainScreen
      title="Sources"
      description="Sources and provenance records attached to workspace activity."
      queryKey={["sources"]}
      queryFn={api.workspace.sources}
    />
  );
}
