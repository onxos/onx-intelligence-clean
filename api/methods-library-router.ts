// ============================================================
// METHODS LIBRARY ROUTER — governed methodology registry over tRPC (B2-β)
//
// Exposes the DATA registry: list the approved methods, fetch one with its
// declarative rules, and verify a worker's ACTUAL outputs against a
// declared method (reusing Codex Guard / B1 for charter deviations).
//
// Pure + deterministic (no DB / keys), so it runs in CI. Follows the
// orchestrator-router / ocmbr-router pattern.
// ============================================================
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import {
  getMethod,
  listMethods,
  verifyMethodCompliance,
} from "./lib/methods-library";

const zEvidence = z.object({
  type: z.enum([
    "TEST",
    "CODE",
    "RUN",
    "ROOT_CAUSE",
    "FIX",
    "ADR",
    "DECISION",
    "COMMIT",
    "MERGE",
  ]),
  ref: z.string().optional(),
  date: z.string().optional(),
  context: z.string().optional(),
  decision: z.string().optional(),
  consequences: z.string().optional(),
});

const zFile = z.object({
  path: z.string().min(1),
  kind: z.enum(["code", "test", "doc"]).optional(),
  content: z.string().optional(),
});

const zScope = z.object({
  id: z.string().min(1),
  files: z.array(z.string()),
});

const zOutput = z.object({
  files: z.array(zFile).optional(),
  evidence: z.array(zEvidence).optional(),
  scopes: z.array(zScope).optional(),
  pr: z
    .object({
      changedLines: z.number().int().nonnegative().optional(),
      selfMerged: z.boolean().optional(),
    })
    .optional(),
  commitMessages: z.array(z.string()).optional(),
});

export const methodsLibraryRouter = createRouter({
  // The full registry of approved methods (data records).
  list: publicQuery.query(() => listMethods()),

  // Fetch one method with its declarative rules — fail-closed on unknown id.
  get: publicQuery
    .input(z.object({ id: z.string().min(1) }))
    .query(({ input }) => {
      const method = getMethod(input.id);
      if (!method) return { found: false as const };
      return { found: true as const, method };
    }),

  // Verify a worker's ACTUAL outputs against a declared method.
  verify: publicQuery
    .input(z.object({ method: z.string().min(1), output: zOutput }))
    .mutation(({ input }) => {
      return verifyMethodCompliance(input.method, input.output);
    }),
});
