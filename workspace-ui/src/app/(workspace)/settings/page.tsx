"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SettingsPage() {
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.workspace.settings });
  const me = useQuery({ queryKey: ["me"], queryFn: api.auth.me });

  if (settings.isLoading || me.isLoading) {
    return <Card><CardContent className="py-8 text-sm text-slate-600">Loading settings...</CardContent></Card>;
  }

  if (settings.error || me.error) {
    return <Card><CardContent className="py-8 text-sm text-red-600">{(settings.error || me.error as Error)?.message}</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs whitespace-pre-wrap break-all">{JSON.stringify(settings.data, null, 2)}</pre>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Authenticated User</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs whitespace-pre-wrap break-all">{JSON.stringify(me.data, null, 2)}</pre>
        </CardContent>
      </Card>
    </div>
  );
}
