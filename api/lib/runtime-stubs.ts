export type CapitalCategory = "human" | "social" | "institutional" | "knowledge";

export interface ContinuityLayer {
  id: string;
  status: "active" | "standby";
}

export class Guardian {
  validate(action: string) {
    return { allowed: true, action, reason: "stub-validated" };
  }
}

export class USFIPv2Engine {
  evaluate(prompt: string) {
    return { summary: `USFI-v2 stub evaluated: ${prompt}` };
  }
}

export const runtimeStubs = {
  version: "2.0-local-stub",
  engines: 18,
  status: "ready"
};
