// ============================================================
// CCMR — Constitutional Classification into Root / Constitution /
//        Owner / Evidence (B3)
//
// Deterministic classifier: every asset or decision is sorted into one of
// four constitutional roles, with an explicit justification (the signals
// that drove the choice). No I/O, no randomness — same input always yields
// the same class, so it runs in CI and can back an audit.
//
//   ROOT         جذر    — irreducible source: purpose, mission, values.
//   CONSTITUTION دستور  — rules, principles, policy, charter, governance.
//   OWNER        مالك   — the accountable party: role, authority, mandate.
//   EVIDENCE     دليل   — proof: code, tests, runs, metrics, data.
// ============================================================

export const CCMR_CLASSES = ["ROOT", "CONSTITUTION", "OWNER", "EVIDENCE"] as const;
export type CcmrClass = (typeof CCMR_CLASSES)[number];

export const CCMR_LABEL_AR: Record<CcmrClass, string> = {
  ROOT: "جذر",
  CONSTITUTION: "دستور",
  OWNER: "مالك",
  EVIDENCE: "دليل",
};

export interface Asset {
  id: string;
  /** Optional explicit kind (e.g. "mission", "principle", "role", "test"). */
  kind?: string;
  /** Free text describing the asset / decision. */
  text?: string;
  /** Optional tags reinforcing the signal. */
  tags?: string[];
}

export interface Classification {
  assetId: string;
  class: CcmrClass;
  labelAr: string;
  /** Deterministic 0..1 share of matched signals for the chosen class. */
  confidence: number;
  /** The literal keywords/kinds that matched, per class. */
  signals: string[];
  reason: string;
}

// Keyword signals per class (Arabic + English), matched case-insensitively.
const CLASS_SIGNALS: Record<CcmrClass, string[]> = {
  ROOT: [
    "root",
    "source",
    "origin",
    "purpose",
    "mission",
    "vision",
    "value",
    "values",
    "raison",
    "جذر",
    "أصل",
    "مصدر",
    "غاية",
    "رسالة",
    "رؤية",
    "قيمة",
    "قيم",
    "مقصد",
  ],
  CONSTITUTION: [
    "constitution",
    "constitutional",
    "charter",
    "principle",
    "principles",
    "rule",
    "rules",
    "policy",
    "law",
    "governance",
    "amendment",
    "clause",
    "دستور",
    "دستوري",
    "ميثاق",
    "مبدأ",
    "مبادئ",
    "قاعدة",
    "قواعد",
    "سياسة",
    "حوكمة",
    "بند",
    "تعديل",
  ],
  OWNER: [
    "owner",
    "ownership",
    "accountable",
    "responsible",
    "authority",
    "role",
    "mandate",
    "steward",
    "custodian",
    "guardian",
    "approver",
    "مالك",
    "ملكية",
    "مسؤول",
    "مساءلة",
    "صلاحية",
    "دور",
    "تفويض",
    "وصي",
    "معتمِد",
    "مالِك",
  ],
  EVIDENCE: [
    "evidence",
    "proof",
    "test",
    "tests",
    "run",
    "output",
    "metric",
    "metrics",
    "data",
    "measurement",
    "commit",
    "log",
    "audit",
    "دليل",
    "برهان",
    "إثبات",
    "اختبار",
    "تشغيل",
    "مخرجات",
    "مؤشر",
    "بيانات",
    "قياس",
    "سجل",
    "تدقيق",
  ],
};

// Direct kind → class mapping (authoritative when an asset declares its kind).
const KIND_TO_CLASS: Record<string, CcmrClass> = {
  mission: "ROOT",
  vision: "ROOT",
  value: "ROOT",
  purpose: "ROOT",
  root: "ROOT",
  principle: "CONSTITUTION",
  policy: "CONSTITUTION",
  rule: "CONSTITUTION",
  charter: "CONSTITUTION",
  law: "CONSTITUTION",
  governance: "CONSTITUTION",
  owner: "OWNER",
  role: "OWNER",
  authority: "OWNER",
  mandate: "OWNER",
  steward: "OWNER",
  test: "EVIDENCE",
  proof: "EVIDENCE",
  evidence: "EVIDENCE",
  metric: "EVIDENCE",
  data: "EVIDENCE",
  audit: "EVIDENCE",
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isArabic(s: string): boolean {
  return /[\u0600-\u06FF]/.test(s);
}

/** Unify Arabic orthographic variants so morphology-tolerant matching works. */
function normalizeAr(s: string): string {
  return s
    .replace(/[\u0640]/g, "") // tatweel
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ت") // taa marbuta ⇄ taa (suffix shift)
    .replace(/ى/g, "ي");
}

/** Strip a leading clitic (و/ف/ب/ك) and the definite article «ال». */
function stripClitics(token: string): string {
  let t = token;
  if (/^[وفبك]/.test(t) && t.length > 3) t = t.slice(1);
  if (t.startsWith("ال") && t.length > 3) t = t.slice(2);
  return t;
}

function arabicTokens(haystack: string): string[] {
  return haystack
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((t) => stripClitics(normalizeAr(t)));
}

function countSignals(haystack: string, cls: CcmrClass): string[] {
  const found: string[] = [];
  const arTokens = arabicTokens(haystack);
  for (const kw of CLASS_SIGNALS[cls]) {
    if (isArabic(kw)) {
      // Morphology-tolerant: match a keyword stem against clitic/article/
      // suffix-stripped tokens (e.g. «الجذر», «غايتنا» → «جذر», «غايت»).
      const stem = stripClitics(normalizeAr(kw));
      if (arTokens.some((t) => t === stem || t.startsWith(stem))) found.push(kw);
    } else {
      const re = new RegExp(`(^|[^\\p{L}])${escapeRe(kw)}([^\\p{L}]|$)`, "iu");
      if (re.test(haystack)) found.push(kw);
    }
  }
  return found;
}

/**
 * Classify a single asset. Deterministic and total: an asset with no signal
 * at all falls back to EVIDENCE (the least-privileged, "just an artifact"
 * reading) rather than guessing a higher constitutional role.
 */
export function classify(asset: Asset): Classification {
  const id = asset?.id ?? "";
  const kind = (asset?.kind ?? "").toLowerCase().trim();
  const text = asset?.text ?? "";
  const tags = Array.isArray(asset?.tags) ? asset.tags : [];
  const haystack = ` ${[kind, text, ...tags].join(" ").toLowerCase()} `;

  // 1) An explicit, recognised kind is authoritative.
  const kindClass = KIND_TO_CLASS[kind];
  if (kindClass) {
    const signals = countSignals(haystack, kindClass);
    return {
      assetId: id,
      class: kindClass,
      labelAr: CCMR_LABEL_AR[kindClass],
      confidence: 1,
      signals: [`kind:${kind}`, ...signals],
      reason: `النوع المعلن «${kind}» يحدِّد التصنيف مباشرةً: ${CCMR_LABEL_AR[kindClass]}.`,
    };
  }

  // 2) Otherwise score by keyword signals; highest wins, ties by class order.
  const perClass = CCMR_CLASSES.map((cls) => ({
    cls,
    matches: countSignals(haystack, cls),
  }));
  const totalMatches = perClass.reduce((n, p) => n + p.matches.length, 0);

  let best = perClass[0];
  for (const p of perClass) {
    if (p.matches.length > best.matches.length) best = p;
  }

  if (best.matches.length === 0) {
    return {
      assetId: id,
      class: "EVIDENCE",
      labelAr: CCMR_LABEL_AR.EVIDENCE,
      confidence: 0,
      signals: [],
      reason:
        "لا توجد إشارات دستورية مميِّزة — يُصنَّف كدليل/أثر (أقل امتياز) افتراضياً.",
    };
  }

  const confidence = best.matches.length / totalMatches;
  return {
    assetId: id,
    class: best.cls,
    labelAr: CCMR_LABEL_AR[best.cls],
    confidence,
    signals: best.matches,
    reason: `أقوى تطابق للإشارات في فئة ${CCMR_LABEL_AR[best.cls]} (${
      best.matches.length
    }/${totalMatches}): ${best.matches.join("، ")}.`,
  };
}

export function classifyMany(assets: Asset[]): Classification[] {
  return (Array.isArray(assets) ? assets : []).map(classify);
}
