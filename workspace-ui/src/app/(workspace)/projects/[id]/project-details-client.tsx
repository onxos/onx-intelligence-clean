"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Project Details: {id}</CardTitle>
      </CardHeader>
      <CardContent>
        <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>
      </CardContent>
    </Card>
  );
}
