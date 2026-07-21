import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === "production") {
    console.warn(`[env] Warning: environment variable ${name} is not set. Some features may not work.`);
  }
  return value ?? "";
}

// ============================================================
// DATA RESIDENCY (C-4)
// ============================================================
// The deployment region must be declared explicitly so residency is an
// auditable configuration value, not an implicit accident of where the
// service happens to run. Approved regions map to in-Kingdom (KSA) or a
// documented legal basis for transfer (see DEPLOYMENT_GUIDE.md).
export const APPROVED_DATA_REGIONS = [
  "ksa-central", // In-Kingdom (Saudi Arabia) primary
  "ksa-riyadh", // In-Kingdom (Saudi Arabia) — Riyadh
  "me-central-1", // AWS Middle East (UAE) — GCC (documented transfer basis)
  "me-south-1", // AWS Middle East (Bahrain) — GCC (documented transfer basis)
] as const;

export type DataRegion = (typeof APPROVED_DATA_REGIONS)[number];

const DEFAULT_DATA_REGION: DataRegion = "ksa-central";

function resolveDataRegion(): { region: string; approved: boolean } {
  const region = (process.env.DATA_REGION ?? DEFAULT_DATA_REGION).trim();
  const approved = (APPROVED_DATA_REGIONS as readonly string[]).includes(region);
  return { region, approved };
}

const dataRegionResolved = resolveDataRegion();

export const env = {
  appId: required("APP_ID"),
  appSecret: required("APP_SECRET"),
  isProduction: process.env.NODE_ENV === "production",
  bridgeEnabled: process.env.BRIDGE_ENABLED === "true",
  bridgeSharedSecret: process.env.BRIDGE_SHARED_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "sqlite:///app/db/onx-pilot.db",
  kimiAuthUrl: process.env.KIMI_AUTH_URL ?? "https://auth.kimi.com",
  kimiOpenUrl: process.env.KIMI_OPEN_URL ?? "https://open.kimi.com",
  ownerUnionId: process.env.OWNER_UNION_ID ?? "",
  openAiApiKey: process.env.OPENAI_API_KEY ?? "",
  dataRegion: dataRegionResolved.region,
  dataRegionApproved: dataRegionResolved.approved,
};

// ============================================================
// DATA RESIDENCY VALIDATION (C-4)
// ============================================================
/**
 * Validate the configured data region against the approved allowlist.
 * Returns a structured result rather than throwing so callers can decide
 * whether to warn (dev) or fail-closed (prod).
 */
export function validateDataResidency(region: string = env.dataRegion): {
  ok: boolean;
  region: string;
  approved: readonly string[];
  message: string;
} {
  const approved = (APPROVED_DATA_REGIONS as readonly string[]).includes(region);
  return {
    ok: approved,
    region,
    approved: APPROVED_DATA_REGIONS,
    message: approved
      ? `Data region '${region}' is within the approved residency set.`
      : `Data region '${region}' is NOT approved. Allowed: ${APPROVED_DATA_REGIONS.join(", ")}.`,
  };
}

// ============================================================
// FAIL-CLOSED PRODUCTION SECRETS (H-5)
// ============================================================
/**
 * Assert that security-critical secrets are present (and strong) in
 * production. In production a missing/weak secret is a hard failure — the
 * caller (boot) must refuse to start rather than silently run without
 * verification. Returns the list of problems; empty means all good.
 *
 * The bridge secret is only required when the bridge is enabled. Webhook
 * integration secrets (TWILIO_AUTH_TOKEN, STRIPE_WEBHOOK_SECRET,
 * SQUARE_WEBHOOK_SIGNATURE_KEY) are validated only when their integration
 * is switched on via *_ENABLED, so unused integrations don't block boot —
 * but an enabled integration missing its secret fails closed.
 */
const MIN_SECRET_LENGTH = 32;

interface WebhookSecretSpec {
  enableFlag: string;
  secretVar: string;
}

const WEBHOOK_SECRETS: WebhookSecretSpec[] = [
  { enableFlag: "TWILIO_ENABLED", secretVar: "TWILIO_AUTH_TOKEN" },
  { enableFlag: "STRIPE_ENABLED", secretVar: "STRIPE_WEBHOOK_SECRET" },
  { enableFlag: "SQUARE_ENABLED", secretVar: "SQUARE_WEBHOOK_SIGNATURE_KEY" },
];

export function collectProductionSecretProblems(): string[] {
  const problems: string[] = [];
  if (process.env.NODE_ENV !== "production") return problems;

  const appSecret = process.env.APP_SECRET ?? "";
  if (!appSecret) {
    problems.push("APP_SECRET is required in production but is not set.");
  } else if (appSecret.length < MIN_SECRET_LENGTH || appSecret.includes("change-me")) {
    problems.push(`APP_SECRET is too weak (min ${MIN_SECRET_LENGTH} chars, no placeholder).`);
  }

  if (process.env.BRIDGE_ENABLED === "true") {
    const bridge = process.env.BRIDGE_SHARED_SECRET ?? "";
    if (!bridge) {
      problems.push("BRIDGE_ENABLED=true but BRIDGE_SHARED_SECRET is not set (fail-closed).");
    } else if (bridge.length < MIN_SECRET_LENGTH) {
      problems.push(`BRIDGE_SHARED_SECRET is too weak (min ${MIN_SECRET_LENGTH} chars).`);
    }
  }

  for (const { enableFlag, secretVar } of WEBHOOK_SECRETS) {
    if (process.env[enableFlag] === "true" && !process.env[secretVar]) {
      problems.push(`${enableFlag}=true but ${secretVar} is not set — webhook verification cannot fail open (fail-closed).`);
    }
  }

  return problems;
}

/** Throws in production when any critical secret is missing/weak. */
export function assertProductionSecrets(): void {
  const problems = collectProductionSecretProblems();
  if (problems.length > 0) {
    throw new Error(
      `[env] Fail-closed: refusing to start with insecure secret configuration:\n  - ${problems.join("\n  - ")}`,
    );
  }
}
