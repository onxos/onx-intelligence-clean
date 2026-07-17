// ============================================================
// seed:corpus — ingest provenance-valid corpus records into iurg_objects
// ------------------------------------------------------------
// Honest ingestion (no record-count inflation):
//   1. If an external dataset (knowledge-seed-15k.json) is present, ingest it
//      as INGESTED records (provenance = the dataset path).
//   2. Otherwise seed the curated AUTHORED veterinary corpus (real citations)
//      plus a clearly-labeled SYNTHETIC scaffold set.
//   3. Records are content-hash deduped, quality-scored and persisted via a
//      prefix-scoped replace, so reseeding is idempotent — counts never inflate.
//   4. A measured summary (total / provenance-valid / synthetic / avg quality)
//      is printed. Counts reported are the REAL persisted counts.
// ============================================================
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../api/lib/env";
import { replaceIurgObjectsByIdPrefix, saveIucSnapshot } from "../api/lib/iurg-store";
import { computeIUC } from "../api/iuc-engine";
import { buildCorpusObjects, summarizeCorpus, type CorpusSeed } from "../api/lib/corpus";
import { CURATED_VET_CORPUS } from "../api/lib/corpus-data";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seedFileName = "knowledge-seed-15k.json";
const skippedDirectories = new Set([".git", "coverage", "dist", "node_modules"]);

type JsonRecord = Record<string, unknown>;

async function findSeedFile(dir: string): Promise<string | null> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name === seedFileName) return path.join(dir, entry.name);
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || skippedDirectories.has(entry.name)) continue;
    const found = await findSeedFile(path.join(dir, entry.name));
    if (found) return found;
  }
  return null;
}

function pickArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["records", "items", "data", "entries", "knowledge"]) {
      if (Array.isArray(record[key])) return record[key] as unknown[];
    }
  }
  throw new Error(`Expected ${seedFileName} to contain an array or an object with an array field.`);
}

function textParts(record: JsonRecord, keys: string[]): string[] {
  const parts: string[] = [];
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) parts.push(value.trim());
    if (Array.isArray(value)) {
      for (const item of value) if (typeof item === "string" && item.trim()) parts.push(item.trim());
    }
  }
  return parts;
}

function summarizeRecord(record: unknown, index: number): string {
  if (typeof record === "string") return record.trim() || `Veterinary perception seed ${index + 1}`;
  if (record && typeof record === "object") {
    const summary = textParts(record as JsonRecord, [
      "title", "name", "topic", "content", "summary", "description", "text", "body", "note", "notes",
    ]).join(" — ");
    if (summary) return summary.slice(0, 600);
    return JSON.stringify(record).slice(0, 600);
  }
  return `Veterinary perception seed ${index + 1}`;
}

function inferNumber(record: unknown, keys: string[], fallback: number): number {
  if (!record || typeof record !== "object") return fallback;
  for (const key of keys) {
    const value = (record as JsonRecord)[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (Array.isArray(value)) return value.length;
  }
  return fallback;
}

/** Map an external dataset into INGESTED corpus seeds (provenance = dataset). */
function ingestExternal(records: unknown[], relPath: string): CorpusSeed[] {
  const retrievedAt = new Date().toISOString();
  return records.map((record, index) => ({
    contentText: summarizeRecord(record, index),
    type: "PERCEPTION",
    trust: Math.max(0, Math.min(1, inferNumber(record, ["confidence", "trust"], 0.7))),
    sources: Math.max(1, Math.round(inferNumber(record, ["sources"], 2))),
    provenance: {
      type: "INGESTED",
      citation: relPath,
      sourceAuthority: "external dataset",
      retrievedAt,
    },
    domainTag: "MEDICINE",
  }));
}

/**
 * Labeled SYNTHETIC scaffold. These are procedurally generated and explicitly
 * NOT provenance-valid — they exist only to exercise pipelines and are excluded
 * from the provenance-valid count. This is the honest opposite of inflation.
 */
function buildSyntheticSeeds(): CorpusSeed[] {
  const topics: Array<[string, string]> = [
    ["amoxicillin usage in canine skin infections", "confirm weight-based dosing, owner adherence, and 48-hour appetite follow-up"],
    ["parvovirus symptoms in unvaccinated puppies", "track vomiting, hemorrhagic diarrhea, fever, dehydration, and isolation urgency"],
    ["annual checkup protocol for healthy adult dogs", "capture dental score, vaccine review, parasite prevention, and body condition"],
    ["feline lower urinary tract signs", "note stranguria, inappropriate urination, litter-box frequency, and obstruction red flags"],
    ["otitis externa in floppy-eared dogs", "record ear odor, discharge color, pain on palpation, and cytology need"],
    ["post-operative spay incision monitoring", "watch swelling, discharge, licking behavior, and activity restriction compliance"],
    ["canine osteoarthritis pain management", "observe mobility, stair hesitation, NSAID tolerance, and weight control response"],
    ["tick-borne disease screening after travel", "capture travel history, tick exposure, lethargy, and platelet-count concerns"],
    ["kitten vaccination timing", "verify age window, booster spacing, deworming status, and household exposure risk"],
    ["heat stress prevention in brachycephalic dogs", "document panting severity, ambient temperature, cyanosis risk, and cooling steps"],
    ["chronic kidney disease hydration cues in cats", "track water intake, urine volume, appetite drift, and phosphorus guidance"],
    ["canine kennel cough triage", "separate dry cough cases, vaccination history, fever, and pneumonia escalation triggers"],
    ["dental prophylaxis preparation", "collect fasting status, anesthetic bloodwork needs, tartar grade, and extraction consent"],
    ["puppy deworming schedule", "confirm age-based intervals, fecal checks, weight updates, and reinfection prevention"],
    ["lameness exam after minor trauma", "record limb preference, swelling, crepitus, and rest-versus-imaging decision points"],
    ["feline diabetes home monitoring", "note insulin timing, appetite consistency, water intake, and hypoglycemia warnings"],
    ["rabbit gastrointestinal stasis early signs", "watch fecal output, appetite decline, posture, and immediate supportive care"],
    ["wound cleaning protocol for superficial bites", "document saline flushing, clipping, drainage, and rabies-status review"],
    ["heartworm prevention refill checks", "verify negative testing window, last dose timing, and missed-dose counseling"],
    ["geriatric pet wellness screening", "capture weight trend, mobility baseline, senior blood panel, and cognitive changes"],
  ];

  const templates = [
    (topic: string, detail: string) => `Clinic intake note: ${topic}; ${detail}.`,
    (topic: string, detail: string) => `Owner education cue: ${topic}; remind staff to explain that ${detail}.`,
    (topic: string, detail: string) => `Triage observation: ${topic}; front-desk checklist should confirm whether ${detail}.`,
    (topic: string, detail: string) => `Follow-up perception: ${topic}; record if ${detail}.`,
    (topic: string, detail: string) => `Protocol reminder: ${topic}; the care pathway expects teams to verify that ${detail}.`,
  ];

  return topics.flatMap(([topic, detail]) =>
    templates.map((template): CorpusSeed => ({
      contentText: template(topic, detail),
      type: "PERCEPTION",
      verification: "POSSIBLE",
      trust: 0.6,
      sources: 1,
      provenance: { type: "SYNTHETIC", citation: "", sourceAuthority: "" },
      domainTag: "MEDICINE",
    })),
  );
}

async function loadSeeds(): Promise<{ source: string; seeds: CorpusSeed[] }> {
  const filePath = await findSeedFile(repoRoot);
  if (filePath) {
    const raw = await readFile(filePath, "utf8");
    const relPath = path.relative(repoRoot, filePath);
    return { source: relPath, seeds: ingestExternal(pickArray(JSON.parse(raw)), relPath) };
  }
  return {
    source: "curated authored veterinary corpus + labeled synthetic scaffold",
    seeds: [...CURATED_VET_CORPUS, ...buildSyntheticSeeds()],
  };
}

async function main() {
  if (env.databaseUrl.startsWith("sqlite://")) {
    console.warn(
      "[seed:corpus] WARNING: DATABASE_URL is sqlite:// → the store uses the in-memory fallback. " +
        "Seeded objects will NOT persist across processes. Set a mysql:// or postgresql:// DATABASE_URL for durable persistence.",
    );
  }

  const { source, seeds } = await loadSeeds();
  const objects = buildCorpusObjects(seeds);

  await replaceIurgObjectsByIdPrefix("corpus-", objects);

  const snapshot = computeIUC(objects);
  const indicator = (key: string) => snapshot.indicators.find((i) => i.key === key)?.value ?? 0;
  await saveIucSnapshot({
    tuc: snapshot.tuc,
    ugr: indicator("UGR"),
    urs: indicator("URS"),
    ksr: indicator("UC"),
    pdr: indicator("UY"),
    krr: indicator("UVR"),
    kor: indicator("UT"),
    scg: indicator("CAS"),
    sai: indicator("FAS"),
    objectCount: snapshot.objectCount,
  });

  const summary = summarizeCorpus(objects);
  console.log(`Seeded corpus from ${source}:`);
  console.log(
    `  measured_corpus_count=${summary.total} provenance_valid=${summary.provenanceValidCount} ` +
      `authored=${summary.authoredCount} ingested=${summary.ingestedCount} synthetic=${summary.syntheticCount} ` +
      `avg_quality=${summary.avgQuality} avg_valid_quality=${summary.avgProvenanceValidQuality}`,
  );
}

main().catch((error) => {
  console.error("Failed to seed corpus.", error);
  process.exitCode = 1;
});
