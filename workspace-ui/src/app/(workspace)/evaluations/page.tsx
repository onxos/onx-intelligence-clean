"use client";

import { DomainScreen } from "@/components/domain-screen";
import { api } from "@/lib/api/client";

export default function EvaluationsPage() {
  return (
    <DomainScreen
      title="Evaluations"
      description="Provider evaluation records from workspace endpoint."
      queryKey={["evaluations"]}
      queryFn={api.workspace.evaluations}
    />
  );
}
