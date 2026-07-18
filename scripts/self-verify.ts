// ============================================================
// OSVA SELF-VERIFY RUNNER — STE-V-01
// Prints the unified self-verification report as formatted JSON.
// Exit code: 0 when every claim is measured, 1 when any claim is
// merely asserted (claimsAsserted > 0) — honest by construction.
//
// Run: npm run verify:self
// ============================================================
import { buildSelfVerification } from "../api/lib/self-verify";

async function main() {
  const report = await buildSelfVerification();
  console.log(JSON.stringify(report, null, 2));
  console.error(
    `[self-verify] measured=${report.claimsMeasured} asserted=${report.claimsAsserted} fingerprint=${report.fingerprint.slice(0, 16)}…`,
  );
  process.exit(report.claimsAsserted > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("[self-verify] failed:", error);
  process.exit(1);
});
