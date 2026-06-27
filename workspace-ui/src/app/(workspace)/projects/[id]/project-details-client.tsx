"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PendingState } from "@/components/pending-state";

type PendingResponse = {
  pending?: boolean;
  message?: string;
};

export function ProjectDetailsClient({ id }: { id: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["project-details", id],
    queryFn: () => api.workspace.projectDetails(id),
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-slate-600">Loading project...</CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-red-600">{(error as Error).message}</CardContent>
      </Card>
    );
  }

  const pendingData = data as PendingResponse | undefined;

  if (pendingData?.pending) {
    return <PendingState message={pendingData.message ?? "Project details endpoint is pending."} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Project Details</CardTitle>
      </CardHeader>
      <CardContent>
        <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>
      </CardContent>
    </Card>
  );
}
