"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.workspace.settings });
  const me = useQuery({ queryKey: ["me"], queryFn: api.auth.me });
  const [name, setName] = useState("");
  const [status, setStatus] = useState("ACTIVE");

  useEffect(() => {
    const user = (settings.data as any)?.user;
    if (user) {
      setName(user.name || "");
      setStatus(user.status || "ACTIVE");
    }
  }, [settings.data]);

  const saveMutation = useMutation({
    mutationFn: () => api.workspace.updateSettings({ name, status }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });

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
          <CardTitle>Settings Editor</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">Display Name</p>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">Status</p>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm"
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
              <option value="SUSPENDED">SUSPENDED</option>
            </select>
          </div>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving..." : "Save Settings"}
          </Button>
          {saveMutation.error ? (
            <p className="text-sm text-red-600">{(saveMutation.error as Error).message}</p>
          ) : null}
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
