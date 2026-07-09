import { createHash, randomUUID } from "node:crypto";
import { desc, like, sql } from "drizzle-orm";
import type { IurgObjectInput, IurgObjectType, Rank, VerificationLevel } from "../iuc-engine";
import { getDb } from "../queries/connection";
import { continuityLogEntries, iucSnapshots, iurgObjects } from "../../db/schema";
import { env } from "./env";

const GENESIS_HASH = "0".repeat(64);
// The drizzle layer here is mysql2-only. Any non-MySQL DATABASE_URL (sqlite,
// postgres — production uses Render Postgres) must use the in-memory store:
// attempting mysql2 against a Postgres host hangs then throws ETIMEDOUT,
// which previously crashed the process from the living-loop cron.
const useMemoryFallback = !/^mysql/i.test(env.databaseUrl);

const memoryStore = {
  objects: new Map<string, IurgObjectInput>(),
  snapshots: [] as Array<{
    id: string;
    timestamp: Date;
    tuc: number;
    ugr: number;
    urs: number;
    ksr: number;
    pdr: number;
    krr: number;
    kor: number;
    scg: number;
    sai: number;
    objectCount: number;
    snapshotHash: string;
  }>,
  continuity: [] as Array<{
    id: string;
    tick: number;
    eventType: ContinuityLogInput["eventType"];
    objectId: string | null;
    detail: string | null;
    previousHash: string;
    currentHash: string;
    createdAt: Date;
  }>,
};

type StoredRank = "R1" | "R2" | "R3" | "R4" | "R5" | "R6";

export interface IucSnapshotInput {
  timestamp?: Date;
  tuc: number;
  ugr?: number;
  urs?: number;
  ksr?: number;
  pdr?: number;
  krr?: number;
  kor?: number;
  scg?: number;
  sai?: number;
  objectCount: number;
}

export interface ContinuityLogInput {
  tick: number;
  eventType: "DECAY" | "REINFORCE" | "PROMOTION" | "DEMOTION" | "GATE_PENDING" | "SNAPSHOT";
  objectId?: string;
  detail?: string;
}

function toStoredRank(rank?: Rank): StoredRank {
  const n = rank ?? 1;
  return (`R${n}` as StoredRank);
}

function fromStoredRank(rank: StoredRank): Rank {
  return Number(rank.substring(1)) as Rank;
}

function safeNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function stableHash(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export async function saveIurgObject(obj: IurgObjectInput): Promise<{ id: string }> {
  const id = obj.id ?? randomUUID();
  if (useMemoryFallback) {
    memoryStore.objects.set(id, { ...obj, id });
    return { id };
  }
  const db = getDb();
  const now = new Date();
  const payload = {
    id,
    type: obj.type,
    rank: toStoredRank(obj.rank),
    strength: String(safeNumber(obj.context, safeNumber(obj.trust, 0.5))),
    verification: (obj.verification ?? "UNVERIFIED") as VerificationLevel,
    content: obj.contentText ?? (obj.id ? `iurg:${obj.id}` : null),
    context: JSON.stringify(obj),
    updatedAt: now,
    decayAppliedAt: obj.ageDays ? now : null,
    hashChain: stableHash([id, obj.type, obj.rank ?? 1, obj.verification ?? "UNVERIFIED", obj.ageDays ?? 0, obj.context ?? 1, obj.yield ?? 1]),
  };

  await db.insert(iurgObjects).values(payload).onDuplicateKeyUpdate({
    set: {
      type: payload.type,
      rank: payload.rank,
      strength: payload.strength,
      verification: payload.verification,
      content: payload.content,
      context: payload.context,
      updatedAt: payload.updatedAt,
      decayAppliedAt: payload.decayAppliedAt,
      hashChain: payload.hashChain,
    },
  });

  return { id };
}

export async function getIurgObjects(): Promise<IurgObjectInput[]> {
  if (useMemoryFallback) {
    return Array.from(memoryStore.objects.values());
  }
  const db = getDb();
  const rows = await db.select().from(iurgObjects);
  return rows.map((row) => {
    let parsed: Partial<IurgObjectInput> = {};
    if (row.context) {
      const raw = JSON.parse(row.context);
      if (typeof raw === "object" && raw !== null) parsed = raw as Partial<IurgObjectInput>;
    }
    return {
      ...parsed,
      id: row.id,
      type: row.type,
      rank: fromStoredRank(row.rank),
      verification: row.verification as VerificationLevel,
      contentText: typeof parsed.contentText === "string" ? parsed.contentText : (row.content ?? undefined),
      context: safeNumber(parsed.context, safeNumber(row.strength, 0.5)),
    };
  });
}

export async function saveIucSnapshot(snapshot: IucSnapshotInput): Promise<{ id: string; snapshotHash: string }> {
  const id = randomUUID();
  const timestamp = snapshot.timestamp ?? new Date();
  const normalized = {
    timestamp: timestamp.toISOString(),
    tuc: safeNumber(snapshot.tuc),
    ugr: safeNumber(snapshot.ugr),
    urs: safeNumber(snapshot.urs),
    ksr: safeNumber(snapshot.ksr),
    pdr: safeNumber(snapshot.pdr),
    krr: safeNumber(snapshot.krr),
    kor: safeNumber(snapshot.kor),
    scg: safeNumber(snapshot.scg),
    sai: safeNumber(snapshot.sai),
    objectCount: Math.max(0, Math.trunc(snapshot.objectCount)),
  };
  const snapshotHash = stableHash(normalized);
  if (useMemoryFallback) {
    memoryStore.snapshots.push({
      id,
      timestamp,
      tuc: normalized.tuc,
      ugr: normalized.ugr,
      urs: normalized.urs,
      ksr: normalized.ksr,
      pdr: normalized.pdr,
      krr: normalized.krr,
      kor: normalized.kor,
      scg: normalized.scg,
      sai: normalized.sai,
      objectCount: normalized.objectCount,
      snapshotHash,
    });
    return { id, snapshotHash };
  }
  const db = getDb();

  await db.insert(iucSnapshots).values({
    id,
    timestamp,
    tuc: String(normalized.tuc),
    ugr: String(normalized.ugr),
    urs: String(normalized.urs),
    ksr: String(normalized.ksr),
    pdr: String(normalized.pdr),
    krr: String(normalized.krr),
    kor: String(normalized.kor),
    scg: String(normalized.scg),
    sai: String(normalized.sai),
    objectCount: normalized.objectCount,
    snapshotHash,
  });

  return { id, snapshotHash };
}

export async function appendContinuityLog(event: ContinuityLogInput): Promise<{ id: string; currentHash: string }> {
  const latest = useMemoryFallback
    ? memoryStore.continuity[memoryStore.continuity.length - 1]
    : (await getDb().select().from(continuityLogEntries).orderBy(desc(continuityLogEntries.createdAt)).limit(1))[0];
  const previousHash = latest?.currentHash ?? GENESIS_HASH;
  const createdAt = new Date();
  const id = randomUUID();
  const currentHash = stableHash([
    previousHash,
    event.tick,
    event.eventType,
    event.objectId ?? "",
    event.detail ?? "",
    createdAt.toISOString(),
  ]);

  if (useMemoryFallback) {
    memoryStore.continuity.push({
      id,
      tick: Math.max(0, Math.trunc(event.tick)),
      eventType: event.eventType,
      objectId: event.objectId ?? null,
      detail: event.detail ?? null,
      previousHash,
      currentHash,
      createdAt,
    });
  } else {
    await getDb().insert(continuityLogEntries).values({
      id,
      tick: Math.max(0, Math.trunc(event.tick)),
      eventType: event.eventType,
      objectId: event.objectId ?? null,
      detail: event.detail ?? null,
      previousHash,
      currentHash,
      createdAt,
    });
  }

  return { id, currentHash };
}

export async function getLatestIucSnapshot() {
  if (useMemoryFallback) {
    const row = memoryStore.snapshots[memoryStore.snapshots.length - 1];
    return row ?? null;
  }
  const db = getDb();
  const [row] = await db.select().from(iucSnapshots).orderBy(desc(iucSnapshots.timestamp)).limit(1);
  if (!row) return null;
  return {
    id: row.id,
    timestamp: row.timestamp,
    tuc: safeNumber(row.tuc),
    ugr: safeNumber(row.ugr),
    urs: safeNumber(row.urs),
    ksr: safeNumber(row.ksr),
    pdr: safeNumber(row.pdr),
    krr: safeNumber(row.krr),
    kor: safeNumber(row.kor),
    scg: safeNumber(row.scg),
    sai: safeNumber(row.sai),
    objectCount: row.objectCount,
    snapshotHash: row.snapshotHash,
  };
}

export async function getIurgObjectCounts(): Promise<Partial<Record<IurgObjectType, number>>> {
  if (useMemoryFallback) {
    const counts: Partial<Record<IurgObjectType, number>> = {};
    for (const obj of memoryStore.objects.values()) {
      counts[obj.type] = (counts[obj.type] ?? 0) + 1;
    }
    return counts;
  }

  const db = getDb();
  const rows = await db
    .select({
      type: iurgObjects.type,
      count: sql<number>`count(*)`,
    })
    .from(iurgObjects)
    .groupBy(iurgObjects.type);

  const counts: Partial<Record<IurgObjectType, number>> = {};
  for (const row of rows) {
    counts[row.type as IurgObjectType] = safeNumber(row.count);
  }
  return counts;
}

export async function listContinuityLog(limit = 100) {
  if (useMemoryFallback) {
    return memoryStore.continuity.slice(-Math.max(0, limit)).reverse();
  }
  const db = getDb();
  return db.select().from(continuityLogEntries).orderBy(desc(continuityLogEntries.createdAt)).limit(limit);
}

export async function getIucHealthStats(): Promise<{
  objectCount: number;
  snapshotCount: number;
  continuityLogCount: number;
  lastTickAt: Date | null;
}> {
  if (useMemoryFallback) {
    return {
      objectCount: memoryStore.objects.size,
      snapshotCount: memoryStore.snapshots.length,
      continuityLogCount: memoryStore.continuity.length,
      lastTickAt: memoryStore.continuity.length
        ? memoryStore.continuity[memoryStore.continuity.length - 1].createdAt
        : null,
    };
  }

  const db = getDb();
  const [objectsRows, snapshotRows, continuityRows] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(iurgObjects),
    db.select({ count: sql<number>`count(*)` }).from(iucSnapshots),
    db.select({
      count: sql<number>`count(*)`,
      lastTickAt: sql<Date | string | null>`max(${continuityLogEntries.createdAt})`,
    }).from(continuityLogEntries),
  ]);

  const rawLastTickAt = continuityRows[0]?.lastTickAt ?? null;
  const parsedLastTickAt =
    rawLastTickAt instanceof Date
      ? rawLastTickAt
      : typeof rawLastTickAt === "string"
        ? new Date(rawLastTickAt)
        : null;

  return {
    objectCount: safeNumber(objectsRows[0]?.count),
    snapshotCount: safeNumber(snapshotRows[0]?.count),
    continuityLogCount: safeNumber(continuityRows[0]?.count),
    lastTickAt: parsedLastTickAt && !Number.isNaN(parsedLastTickAt.getTime()) ? parsedLastTickAt : null,
  };
}

export async function replaceIurgObjects(objects: IurgObjectInput[]): Promise<void> {
  if (useMemoryFallback) {
    memoryStore.objects.clear();
    for (const obj of objects) {
      memoryStore.objects.set(obj.id ?? randomUUID(), obj);
    }
    return;
  }
  const db = getDb();
  await db.delete(iurgObjects);
  for (const obj of objects) {
    await saveIurgObject(obj);
  }
}

export async function replaceIurgObjectsByIdPrefix(prefix: string, objects: IurgObjectInput[]): Promise<void> {
  if (useMemoryFallback) {
    for (const id of Array.from(memoryStore.objects.keys())) {
      if (id.startsWith(prefix)) {
        memoryStore.objects.delete(id);
      }
    }
    for (const obj of objects) {
      memoryStore.objects.set(obj.id ?? randomUUID(), obj);
    }
    return;
  }

  const db = getDb();
  await db.delete(iurgObjects).where(like(iurgObjects.id, `${prefix}%`));
  for (const obj of objects) {
    await saveIurgObject(obj);
  }
}

export async function clearContinuityLogEntries(): Promise<void> {
  if (useMemoryFallback) {
    memoryStore.continuity.length = 0;
    return;
  }
  const db = getDb();
  await db.delete(continuityLogEntries);
}

export async function clearIucSnapshots(): Promise<void> {
  if (useMemoryFallback) {
    memoryStore.snapshots.length = 0;
    return;
  }
  const db = getDb();
  await db.delete(iucSnapshots);
}
