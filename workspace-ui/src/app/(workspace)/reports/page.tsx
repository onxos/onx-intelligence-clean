"use client";

import { DomainScreen } from "@/components/domain-screen";
import { api } from "@/lib/api/client";

export default function ReportsPage() {
  return (
    <DomainScreen
      title="Reports"
      description="Workspace report snapshot with governance and capital metrics."
      queryKey={["reports"]}
      queryFn={api.workspace.reports}
    />
  );
}
