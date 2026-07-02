"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TierBadge, StatusBadge } from "@/components/ui/tier-badge";
import type { AiConsensusResponse, AiQueryResult } from "@/types/onx";

export function ResponseCard({
  result,
  clinical,
}: {
  result: (AiQueryResult & Partial<AiConsensusResponse>) | null;
  clinical?: boolean;
}) {
  if (!result) return null;

  const blocked = result.status !== "approved";
  const consensus = result.consensus ?? null;
  const provider = consensus?.agreed
    ? `Consensus (${consensus.agreementCount}/${consensus.totalConsulted})`
    : (result.provider ?? result.model ?? "—");

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-sm">AI Response</CardTitle>
        <div className="flex items-center gap-2">
          {result.evidenceTier ? <TierBadge tier={result.evidenceTier} /> : null}
          {result.ficStatus ? <StatusBadge status={result.ficStatus} /> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span>
            Model: <span className="font-medium text-slate-700">{provider}</span>
          </span>
          {typeof result.latencyMs === "number" ? <span>{result.latencyMs} ms</span> : null}
          {typeof result.tokensUsed === "number" ? <span>{result.tokensUsed} tokens</span> : null}
          {result.mock ? <span className="text-[#f59e0b]">mock</span> : null}
        </div>

        {blocked ? (
          <div className="rounded-md border-l-2 border-[#f59e0b] bg-[#fffbeb] p-3">
            <p className="text-sm font-semibold text-[#92400e]">
              {result.status === "flagged" ? "Flagged for human approval" : "Blocked by SECH gate"}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
              {result.counterProposal ?? "The constitutional gate did not approve this request."}
            </p>
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
            {consensus?.agreed ? consensus.consensusContent : result.response}
          </p>
        )}

        {clinical ? (
          <p className="rounded-md bg-[#f0fdfa] p-2 text-xs text-[#115e59]">
            ⚠️ Differential decision-support only. Final diagnosis rests with a licensed
            veterinarian (HC-02).
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
