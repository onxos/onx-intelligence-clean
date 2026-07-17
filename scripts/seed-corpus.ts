import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../api/lib/env";
import { replaceIurgObjectsByIdPrefix, saveIucSnapshot } from "../api/lib/iurg-store";
import { computeIUC, type IurgObjectInput, type VerificationLevel } from "../api/iuc-engine";

type JsonRecord = Record<string, unknown>;
type SeedRecord = JsonRecord | string;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seedFileName = "knowledge-seed-15k.json";
const skippedDirectories = new Set([".git", "coverage", "dist", "node_modules"]);

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

async function findSeedFile(dir: string): Promise<string | null> {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isFile() && entry.name === seedFileName) {
      return path.join(dir, entry.name);
    }
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
      for (const item of value) {
        if (typeof item === "string" && item.trim()) parts.push(item.trim());
      }
    }
  }
  return parts;
}

function summarizeRecord(record: SeedRecord, index: number): string {
  if (typeof record === "string") {
    return record.trim() || `Veterinary perception seed ${index + 1}`;
  }

  const summary = textParts(record, [
    "title",
    "name",
    "topic",
    "content",
    "summary",
    "description",
    "text",
    "body",
    "note",
    "notes",
  ]).join(" — ");

  if (summary) return summary.slice(0, 600);
  return JSON.stringify(record).slice(0, 600);
}

function inferSources(record: SeedRecord): number {
  if (typeof record === "string") return 2;
  const value = record.sources;
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(1, Math.round(value));
  if (Array.isArray(value)) return Math.max(1, value.length);
  return 2;
}

function inferTrust(record: SeedRecord, index: number): number {
  if (typeof record === "string") return 0.68 + (index % 5) * 0.04;
  const confidence = record.confidence;
  if (typeof confidence === "number" && Number.isFinite(confidence)) return clamp01(confidence);
  const trust = record.trust;
  if (typeof trust === "number" && Number.isFinite(trust)) return clamp01(trust);
  return 0.68 + (index % 5) * 0.04;
}

function inferVerification(trust: number): VerificationLevel {
  if (trust >= 0.9) return "CONFIRMED";
  if (trust >= 0.75) return "PROBABLE";
  return "POSSIBLE";
}

function makeId(summary: string): string {
  const hash = createHash("sha1").update(summary).digest("hex").slice(0, 29);
  return `corpus-${hash}`;
}

function indicatorValue(
  snapshot: ReturnType<typeof computeIUC>,
  key: "UGR" | "URS" | "UC" | "UY" | "UVR" | "UT" | "CAS" | "FAS",
): number {
  return snapshot.indicators.find((indicator) => indicator.key === key)?.value ?? 0;
}

function buildPerception(record: SeedRecord, index: number): IurgObjectInput {
  const contentText = summarizeRecord(record, index);
  const trust = inferTrust(record, index);
  const sources = inferSources(record);

  return {
    id: makeId(contentText),
    type: "PERCEPTION",
    rank: 1,
    verification: inferVerification(trust),
    contentText,
    context: clamp01(0.7 + (index % 4) * 0.08),
    yield: clamp01(0.62 + (index % 3) * 0.07),
    amanah: 0.86,
    founderAlignment: 0.82,
    validated: trust >= 0.75,
    sources,
    trust,
    transfer: clamp01(0.58 + (index % 4) * 0.06),
    drift: 0.02,
    ageDays: 0,
  };
}

function buildFallbackSeedRecords(): SeedRecord[] {
  const topics = [
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
  ] as const;

  const templates = [
    (topic: string, detail: string) => `Clinic intake note: ${topic}; ${detail}.`,
    (topic: string, detail: string) => `Owner education cue: ${topic}; remind staff to explain that ${detail}.`,
    (topic: string, detail: string) => `Triage observation: ${topic}; front-desk checklist should confirm whether ${detail}.`,
    (topic: string, detail: string) => `Follow-up perception: ${topic}; record if ${detail}.`,
    (topic: string, detail: string) => `Protocol reminder: ${topic}; the care pathway expects teams to verify that ${detail}.`,
  ] as const;

  return topics.flatMap(([topic, detail]) => templates.map((template) => template(topic, detail)));
}

async function loadSeedRecords(): Promise<{ source: string; records: SeedRecord[] }> {
  const filePath = await findSeedFile(repoRoot);
  if (filePath) {
    const raw = await readFile(filePath, "utf8");
    return {
      source: path.relative(repoRoot, filePath),
      records: pickArray(JSON.parse(raw)) as SeedRecord[],
    };
  }

  return {
    source: "built-in veterinary sample corpus",
    records: buildFallbackSeedRecords(),
  };
}

async function main() {
  if (env.databaseUrl.startsWith("sqlite://")) {
    throw new Error("seed:corpus requires a persistent MySQL DATABASE_URL; sqlite:// currently uses the in-memory fallback.");
  }

  const { source, records } = await loadSeedRecords();
  const objects = records.map(buildPerception);

  await replaceIurgObjectsByIdPrefix("corpus-", objects);

  const snapshot = computeIUC(objects);
  await saveIucSnapshot({
    tuc: snapshot.tuc,
    ugr: indicatorValue(snapshot, "UGR"),
    urs: indicatorValue(snapshot, "URS"),
    ksr: indicatorValue(snapshot, "UC"),
    pdr: indicatorValue(snapshot, "UY"),
    krr: indicatorValue(snapshot, "UVR"),
    kor: indicatorValue(snapshot, "UT"),
    scg: indicatorValue(snapshot, "CAS"),
    sai: indicatorValue(snapshot, "FAS"),
    objectCount: snapshot.objectCount,
  });

  console.log(`Seeded ${objects.length} PERCEPTION objects into iurg_objects from ${source} and stored a corpus snapshot.`);
}

main().catch((error) => {
  console.error("Failed to seed corpus.", error);
  process.exitCode = 1;
});
