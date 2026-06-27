"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function WorkspaceHomePage() {
  const home = useQuery({ queryKey: ["workspace-home"], queryFn: api.workspace.home });

  if (home.isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-slate-600">Loading workspace snapshot...</CardContent>
      </Card>
    );
  }

  if (home.error) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-red-600">{(home.error as Error).message}</CardContent>
      </Card>
    );
  }

  const data = home.data as any;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Workspace Home</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="rounded-md border border-slate-200 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Intelligence</p>
            <p className="text-xl font-semibold">{data?.workspace?.intelligenceCount ?? 0}</p>
          </div>
          <div className="rounded-md border border-slate-200 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Evidence</p>
            <p className="text-xl font-semibold">{data?.workspace?.evidenceCount ?? 0}</p>
          </div>
          <div className="rounded-md border border-slate-200 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Providers</p>
            <p className="text-xl font-semibold">{data?.workspace?.providerCount ?? 0}</p>
          </div>
          <div className="rounded-md border border-slate-200 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Tools</p>
            <p className="text-xl font-semibold">{data?.workspace?.toolCount ?? 0}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Intelligence</CardTitle>
        </CardHeader>
        <CardContent>
          {Array.isArray(data?.recentIntelligence) && data.recentIntelligence.length > 0 ? (
            <pre className="text-xs whitespace-pre-wrap break-all">
              {JSON.stringify(data.recentIntelligence, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-slate-600">No intelligence records yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Evidence</CardTitle>
        </CardHeader>
        <CardContent>
          {Array.isArray(data?.recentEvidence) && data.recentEvidence.length > 0 ? (
            <pre className="text-xs whitespace-pre-wrap break-all">
              {JSON.stringify(data.recentEvidence, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-slate-600">No evidence records yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
