import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { enforceRateLimit } from "./lib/rate-limiter";
import { fingerprintKnowledge, knowledgeRouter } from "./knowledge-router";
import { engineEvents } from "./runtime-router";
import { assertBridgeAccess } from "./bridge-guard";
import {
  insertCorpusUnits,
  isCorpusPersistenceConfigured,
  loadAllCorpusUnits,
  type CorpusUnitInput,
} from "./lib/corpus-pg-store";
import {
  semanticSearchCorpus,
  reembedCorpusBatch,
  corpusRealCounts,
} from "./lib/corpus-vector-search";
import {
  invalidateCorpusSearchIndex,
  registerCorpusSource,
  searchCorpus,
} from "./lib/corpus-search";
import { getCorpusContentManifest } from "./lib/corpus-manifest";
import { getCorpusBridgeSurfaceProof } from "./lib/bridge-surface-proof";

// In-memory dedup fallback when no postgres DATABASE_URL is
// configured — honest UNPERSISTED declaration, lost on restart.
const memoryFingerprints = new Set<string>();
const memoryUnits: CorpusUnitInput[] = [];

export function __resetCorpusIngestMemoryForTests(): void {
  memoryFingerprints.clear();
  memoryUnits.length = 0;
  invalidateCorpusSearchIndex();
}

// STE-K-01: expose both corpus stores to the BM25 search index —
// in-memory ingested units always, postgres units when configured.
registerCorpusSource("ingestMemory", () =>
  memoryUnits.map((u) => ({
    id: `mem_${u.fingerprint.slice(0, 24)}`,
    domain: u.domain,
    title: u.title,
    body: u.body,
  })),
);
registerCorpusSource("corpusPg", async () =>
  isCorpusPersistenceConfigured() ? await loadAllCorpusUnits() : [],
);

export const corpusQueryRouter = createRouter({
  status: publicQuery.query(async () => getCorpusBridgeSurfaceProof()),

  // STE-K-10: measured corpus content manifest — public read (no
  // secrets, pattern of `status`). Exposes the honest DEMO/REAL
  // disclosure derived from provenance measurement, plus the
  // deterministic content sha256 that the verify:corpus CI gate pins.
  manifest: publicQuery.query(async () => ({
    bridge: "corpusQuery",
    access: "PUBLIC_READ" as const,
    ...(await getCorpusContentManifest()),
  })),

  domains: publicQuery.query(async ({ ctx }) => {
    assertBridgeAccess(ctx);
    const caller = knowledgeRouter.createCaller(ctx);
    const result = await caller.domains();
    return {
      bridge: "corpusQuery",
      ...result,
    };
  }),

  search: publicQuery
    .input(z.object({
      query: z.string().min(1),
      domain: z.string().optional(),
      tier: z.string().optional(),
      limit: z.number().min(1).max(50).default(10),
      useVector: z.boolean().default(true),
    }))
    .query(async ({ ctx, input }) => {
      assertBridgeAccess(ctx);
      const caller = knowledgeRouter.createCaller(ctx);
      const result = await caller.search(input);
      return {
        bridge: "corpusQuery",
        ...result,
      };
    }),

  // STE-K-01: rankedSearch — deterministic BM25 retrieval, PUBLIC
  // read (pattern of `status`: no secrets exposed, read-only).
  // The legacy bridge-guarded `search` contract above is preserved
  // untouched (fail-closed proven in bridge-contract.test.ts).
  rankedSearch: publicQuery
    .input(z.object({
      query: z.string().max(500),
      domain: z.string().optional(),
      limit: z.number().min(1).max(50).default(10),
      offset: z.number().min(0).max(10000).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      return {
        bridge: "corpusQuery",
        access: "PUBLIC_READ" as const,
        rateLimit,
        ...(await searchCorpus(input.query, input)),
      };
    }),

  // Admin listing by source — see the exact rows before maintaining them.
  adminListBySource: publicQuery
    .input(z.object({ source: z.string().min(1).max(200) }))
    .query(async ({ ctx, input }) => {
      assertBridgeAccess(ctx);
      if (!isCorpusPersistenceConfigured()) return { persistence: "UNPERSISTED" as const, units: [] };
      const { listCorpusBySource } = await import("./lib/corpus-pg-store");
      const units = await listCorpusBySource(input.source);
      return { persistence: "POSTGRES" as const, units };
    }),

  // Admin maintenance — retag a domain for all units of a given source.
  // Bridge-guarded + audited; returns the true affected-row count.
  adminRetagDomain: publicQuery
    .input(z.object({
      source: z.string().min(1).max(200),
      fromDomain: z.string().min(1).max(40),
      toDomain: z.string().min(1).max(40),
    }))
    .mutation(async ({ ctx, input }) => {
      assertBridgeAccess(ctx);
      if (!isCorpusPersistenceConfigured()) {
        return { persistence: "UNPERSISTED" as const, updated: 0 };
      }
      const { retagCorpusDomain } = await import("./lib/corpus-pg-store");
      const result = await retagCorpusDomain(input.source, input.fromDomain, input.toDomain);
      invalidateCorpusSearchIndex();
      engineEvents.audit("corpus", "ADMIN_RETAG_DOMAIN", { ...input, updated: result.updated });
      return { persistence: "POSTGRES" as const, updated: result.updated };
    }),

  // STE-N-02: real ingest endpoint — normalize → fingerprint →
  // dedup → insert. Ready to receive the authentic archive
  // (STE-REC-06) the moment it is recovered. Fail-closed bridge.
  ingest: publicQuery
    .input(z.object({
      units: z.array(z.object({
        domain: z.string().min(1).max(40),
        title: z.string().min(1),
        body: z.string().min(1),
        source: z.string().min(1).max(200),
      })).min(1).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      assertBridgeAccess(ctx);

      // Normalize + fingerprint, dedup inside the batch first.
      const seen = new Set<string>();
      const batch: CorpusUnitInput[] = [];
      let inBatchDuplicates = 0;
      for (const unit of input.units) {
        const fingerprint = fingerprintKnowledge(unit.title, unit.body);
        if (seen.has(fingerprint)) {
          inBatchDuplicates++;
          continue;
        }
        seen.add(fingerprint);
        batch.push({ ...unit, fingerprint });
      }

      // D11 feeding: every accepted ingest becomes institutional memory —
      // continuity ledger + causal node + audit trail + counters —
      // regardless of which persistence branch served it.
      const feedEngines = (accepted: number, duplicates: number) => {
        const domains = [...new Set(batch.map((u) => u.domain))];
        const batchId = `corpus-batch-${Date.now()}`;
        engineEvents.recordContinuity("L2_OBJECT", "CORPUS_INGEST", batchId, {
          accepted,
          duplicates,
          domains,
          source: batch[0]?.source ?? "unknown",
        });
        engineEvents.addCausalNode(batchId, {
          objectType: "CORPUS_BATCH",
          amanahScore: "0.90",
          content: `${accepted} units [${domains.join(",")}]`,
        });
        engineEvents.audit("corpus", "INGEST", { batchId, accepted, domains });
        engineEvents.noteIngestion(batch[0]?.source ?? "unknown", accepted);
      };

      if (isCorpusPersistenceConfigured()) {
        const result = await insertCorpusUnits(batch);
        if (result.accepted > 0) {
          invalidateCorpusSearchIndex();
          feedEngines(result.accepted, result.duplicates + inBatchDuplicates);
        }
        return {
          bridge: "corpusQuery",
          persistence: "POSTGRES" as const,
          accepted: result.accepted,
          duplicates: result.duplicates + inBatchDuplicates,
          total: input.units.length,
        };
      }

      // No DB: keep current in-memory behavior, declared honestly.
      let accepted = 0;
      for (const unit of batch) {
        if (memoryFingerprints.has(unit.fingerprint)) continue;
        memoryFingerprints.add(unit.fingerprint);
        memoryUnits.push(unit);
        accepted++;
      }
      if (accepted > 0) {
        invalidateCorpusSearchIndex();
        feedEngines(accepted, input.units.length - accepted);
      }
      return {
        bridge: "corpusQuery",
        persistence: "UNPERSISTED" as const,
        accepted,
        duplicates: input.units.length - accepted,
        total: input.units.length,
      };
    }),

  // EV-P1-03: بحث دلالي حقيقي (OpenAI embeddings + pgvector) على corpus provenance-valid
  semanticSearchPg: publicQuery
    .input(z.object({
      query: z.string().min(1),
      limit: z.number().min(1).max(20).default(5),
      domain: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      assertBridgeAccess(ctx);
      const { results, model, corpusSize } = await semanticSearchCorpus(
        input.query,
        input.limit,
        input.domain,
      );
      return {
        results: results.map((r) => ({
          id: r.id,
          domain: r.domain,
          category: r.category,
          title: r.title,
          body: r.body,
          similarity: Math.round(Number(r.similarity) * 1000) / 1000,
        })),
        model,
        corpusSize,
        simulated: false,
      };
    }),

  // ترحيل embeddings دفعة — idempotent؛ يُستدعى حتى اكتمال الترحيل
  reembedPg: publicQuery
    .input(z.object({ batchSize: z.number().min(1).max(500).default(200) }).optional())
    .mutation(async ({ ctx, input }) => {
      assertBridgeAccess(ctx);
      const batchSize = input?.batchSize ?? 200;
      const { reembedded, remaining, model } = await reembedCorpusBatch(batchSize);
      return { reembedded, remaining, model, done: remaining === 0 };
    }),

  // العداد الصادق: provenance-valid فقط — ما تثبته القاعدة فعلاً
  realCounts: publicQuery.query(async ({ ctx }) => {
    assertBridgeAccess(ctx);
    const { total, embedded, model } = await corpusRealCounts();
    return { total, embedded, model, simulated: false };
  }),
});
