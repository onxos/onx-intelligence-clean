// ============================================================
// CORPUS ONX CANON — ONX-owned constitutional canonical records
// ------------------------------------------------------------
// The real, ONX-owned constitutional material that ACTUALLY exists in this
// repository today: the Seven Constitutional Principles enforced by
// api/constitution-router.ts. Each is an AUTHORED, provenance-valid canonical
// record cited to the ONX Constitution under ONX Founder authority.
//
// Honesty note: the wider programme references "133 constitutional assets",
// Genesis and SBP corpora — but only these seven principles are materialised as
// data in this repo. We ingest exactly what genuinely exists (no fabrication,
// no inflation); the remainder is reported as a sourcing blocker, not counted.
// ============================================================
import type { CorpusSeed } from "./corpus";

function principle(nameEn: string, nameAr: string, statement: string): CorpusSeed {
  return {
    contentText: `ONX Constitutional Principle — ${nameEn} (${nameAr}): ${statement}`,
    type: "UNDERSTANDING",
    verification: "PROVEN",
    provenance: {
      type: "AUTHORED",
      citation: "ONX Constitution — The Seven Principles",
      sourceAuthority: "ONX Founder",
    },
    sources: 4,
    trust: 0.97,
    domainTag: "GOVERNANCE",
    accessTier: "INTERNAL",
  };
}

/**
 * The Seven Constitutional Principles (Amanah, Ihsan, Adl, Rahmah, Hikmah,
 * Itqan, Tawakkul) as authored, cited canonical records. These mirror the
 * PRINCIPLES enforced in constitution-router.ts and carry the weights used in
 * constitutional validation.
 */
export const CURATED_ONX_CANON: CorpusSeed[] = [
  principle(
    "Trustworthiness", "الأمانة",
    "Every decision and action must be discharged as a trust: responsibility and reliability are owed in full, and the highest constitutional weight (0.20) is placed on honouring that trust without evasion or inflation.",
  ),
  principle(
    "Excellence", "الإحسان",
    "Work must be pursued to the point of excellence and completion — striving for perfection in every effort — carrying a constitutional weight of 0.15 in the validation of any act.",
  ),
  principle(
    "Justice", "العدل",
    "Fairness and equity must govern every judgement and allocation; justice is weighted 0.18 in constitutional validation and forbids partiality or hidden bias in decisions.",
  ),
  principle(
    "Compassion", "الرحمة",
    "Mercy and care must inform every interaction; compassion carries a constitutional weight of 0.12 and requires that outcomes account for the wellbeing of those affected.",
  ),
  principle(
    "Wisdom", "الحكمة",
    "Deep wisdom must underlie every decision — considering long-range consequence and purpose — and is weighted 0.15 in constitutional validation.",
  ),
  principle(
    "Mastery", "الإتقان",
    "Precision and mastery are required in execution; itqan is weighted 0.10 and demands rigorous, verifiable craftsmanship rather than approximation.",
  ),
  principle(
    "Trust in the Divine", "التوكل",
    "Reliance upon God is coupled with taking the necessary means: tawakkul is weighted 0.10 and unites sincere dependence with diligent, competent action.",
  ),
];
