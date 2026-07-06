import { runtimeStubs } from "./lib/runtime-stubs";
import type { ContinuityLayer, CapitalCategory } from "./lib/runtime-stubs";

// Compatibility entrypoint retained for deployment checks expecting this file path.
export const runtimeCompatibility: {
  stubs: typeof runtimeStubs;
  continuity: ContinuityLayer[];
  capital: CapitalCategory[];
} = {
  stubs: runtimeStubs,
  continuity: [{ id: "compat", status: "active" }],
  capital: ["human", "social", "institutional", "knowledge"]
};
