// ============================================================
// REALITY ENGINE ROUTER (B5) — tRPC surface
// Exposes the deterministic reality pipeline: ontology, full run
// (ingest → graph → contradiction detection), scope overlap, and
// extraction. Pure / deterministic → CI-safe, keyless, DB-free.
// ============================================================
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import {
  runRealityPipeline,
  defaultOntology,
  scopesOverlap,
  parseText,
  type RawInput,
} from "./lib/reality-engine";

const zProvenance = z.object({
  source: z.string().min(1),
  method: z.string().min(1),
  recordedAt: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

const zValidityScope = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
    domain: z.string().optional(),
  })
  .optional();

const zRawInput = z.object({
  id: z.string().min(1),
  text: z.string().optional(),
  triple: z
    .object({
      subject: z.string().min(1),
      predicate: z.string().min(1),
      object: z.string().min(1),
    })
    .optional(),
  provenance: zProvenance,
  validityScope: zValidityScope,
  authorityLevel: z
    .enum([
      "EMERGENCY_SAFETY",
      "LEGAL",
      "CONSTITUTIONAL_PILLAR",
      "NON_NEGOTIABLE",
      "ACTIVE_FOUNDER_INTENT",
      "INSTITUTIONAL_JUDGMENT",
      "EXPERIMENTAL",
      "ADVISORY",
    ])
    .optional(),
});

export const realityEngineRouter = createRouter({
  ontology: publicQuery.query(() => {
    const ont = defaultOntology();
    return {
      entityTypes: ont.entityTypes,
      predicates: Object.entries(ont.predicates).map(([id, def]) => ({
        id,
        functional: def.functional,
        negates: def.negates ?? null,
      })),
    };
  }),

  run: publicQuery
    .input(z.object({ inputs: z.array(zRawInput) }))
    .query(({ input }) => runRealityPipeline(input.inputs as RawInput[])),

  extract: publicQuery
    .input(z.object({ text: z.string() }))
    .query(({ input }) => ({ parsed: parseText(input.text) })),

  scopesOverlap: publicQuery
    .input(
      z.object({
        a: z
          .object({ from: z.string().optional(), to: z.string().optional(), domain: z.string().optional() })
          .optional(),
        b: z
          .object({ from: z.string().optional(), to: z.string().optional(), domain: z.string().optional() })
          .optional(),
      }),
    )
    .query(({ input }) => ({ overlap: scopesOverlap(input.a, input.b) })),
});
