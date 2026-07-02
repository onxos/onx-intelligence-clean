"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ResponseCard } from "@/components/ai/response-card";
import type { AiQueryResult } from "@/types/onx";

export function ProtocolView({ defaultCondition }: { defaultCondition?: string }) {
  const [condition, setCondition] = useState(defaultCondition ?? "");

  const mutation = useMutation({
    mutationFn: async () =>
      (await api.ai.clinicalProtocol({ condition })) as AiQueryResult,
  });

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Protocol Recommendations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex gap-2">
            <input
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              placeholder="e.g. canine parvovirus enteritis"
              className="h-9 flex-1 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-[#14b8a6]"
            />
            <Button
              size="sm"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !condition.trim()}
            >
              {mutation.isPending ? "…" : "Suggest"}
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            Evidence-based protocol suggestions — the attending clinician retains final authority.
          </p>
        </CardContent>
      </Card>

      {mutation.data ? <ResponseCard result={mutation.data} clinical /> : null}
    </div>
  );
}
