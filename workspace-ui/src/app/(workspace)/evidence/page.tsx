"use client";

import { DomainScreen } from "@/components/domain-screen";
import { api } from "@/lib/api/client";

export default function EvidencePage() {
  return (
    <DomainScreen
      title="Evidence"
      description="Evidence records from production evidence endpoint."
      queryKey={["evidence"]}
      queryFn={api.evidence.list}
    />
  );
}
