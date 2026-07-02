import { QueryPanel } from "@/components/ai/query-panel";
import { ProviderStatus } from "@/components/ai/provider-status";

export default function AiPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">AI Intelligence Center</h1>
        <p className="text-sm text-slate-500">
          Every query is SECH-gated (pre-execution) and evidence-tiered. Rejected requests return a
          constitutional counter-proposal — never raw model output.
        </p>
      </div>

      <QueryPanel />
      <ProviderStatus />
    </div>
  );
}
