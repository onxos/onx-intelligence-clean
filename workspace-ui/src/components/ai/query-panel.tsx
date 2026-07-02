"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ResponseCard } from "@/components/ai/response-card";
import type { AiConsensusResponse, AiQueryResult } from "@/types/onx";

type Mode = "query" | "consensus" | "chat";

export function QueryPanel() {
  const [text, setText] = useState("");
  const [domain, setDomain] = useState("clinical");

  const mutation = useMutation({
    mutationFn: async (mode: Mode) => {
      if (mode === "consensus") {
        return (await api.ai.consensus({ query: text, domain })) as AiConsensusResponse;
      }
      if (mode === "chat") {
        return (await api.ai.chat({
          messages: [{ role: "user", content: text }],
          domain,
        })) as AiQueryResult;
      }
      return (await api.ai.query({ query: text, domain })) as AiQueryResult;
    },
  });

  const run = (mode: Mode) => {
    if (!text.trim()) return;
    mutation.mutate(mode);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Query Input</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="What are the differential diagnoses for a 4-year-old Golden Retriever with hind-leg lameness?"
            className="w-full resize-y rounded-md border border-slate-300 p-3 text-sm outline-none focus:border-[#14b8a6] focus:ring-1 focus:ring-[#14b8a6]"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="h-9 rounded-md border border-slate-300 px-2 text-sm"
            >
              {["clinical", "commercial", "operational", "strategic", "general"].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <Button onClick={() => run("query")} disabled={mutation.isPending || !text.trim()}>
              Query
            </Button>
            <Button
              variant="secondary"
              onClick={() => run("consensus")}
              disabled={mutation.isPending || !text.trim()}
            >
              Consensus
            </Button>
            <Button
              variant="outline"
              onClick={() => run("chat")}
              disabled={mutation.isPending || !text.trim()}
            >
              Chat
            </Button>
            {mutation.isPending ? <span className="text-sm text-slate-500">Thinking…</span> : null}
          </div>
          {mutation.isError ? (
            <p className="text-sm text-[#ef4444]">
              {(mutation.error as Error)?.message ?? "Request failed."}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {mutation.data ? (
        <ResponseCard
          result={mutation.data as AiQueryResult & Partial<AiConsensusResponse>}
          clinical={domain === "clinical"}
        />
      ) : null}
    </div>
  );
}
