import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { enforceRateLimit } from "./lib/rate-limiter";
import { fingerprintKnowledge, knowledgeRouter } from "./knowledge-router";
import { assertBridgeAccess, getBridgeState } from "./bridge-guard";
import {
  insertCorpusUnits,
  isCorpusPersistenceConfigured,
  loadAllCorpusUnits,
  type CorpusUnitInput,
} from "./lib/corpus-pg-store";
import {
  invalidateCorpusSearchIndex,
  registerCorpusSource,
  searchCorpus,
} from "./lib/corpus-search";

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
  status: publicQuery.query(() => ({
    bridge: "corpusQuery",
    ...getBridgeState(),
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
      const rateLimit = enforceRateLimit(ctx);
      return {
        bridge: "corpusQuery",
        access: "PUBLIC_READ" as const,
        rateLimit,
        ...(await searchCorpus(input.query, input)),
      };
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

      if (isCorpusPersistenceConfigured()) {
        const result = await insertCorpusUnits(batch);
        if (result.accepted > 0) invalidateCorpusSearchIndex();
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
      if (accepted > 0) invalidateCorpusSearchIndex();
      return {
        bridge: "corpusQuery",
        persistence: "UNPERSISTED" as const,
        accepted,
        duplicates: input.units.length - accepted,
        total: input.units.length,
      };
    }),
});
