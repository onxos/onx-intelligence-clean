// ============================================================
// ASK ROUTER — STE-K-04 "ask.onx" deterministic cited answer.
// ask.onx: PUBLIC read (rankedSearch/classify pattern) — fuses
// intent classification + BM25 retrieval into one honest,
// deterministic, cited answer with an explicit truth disclosure
// and honest refusal below the relevance threshold. Zero LLM,
// zero keys, no secrets. The LLM-backed bridge paths stay locked.
// ============================================================
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { composeAnswer } from "./lib/answer-composer";

export const askRouter = createRouter({
  onx: publicQuery
    .input(z.object({
      question: z.string().min(1).max(2000),
      topK: z.number().min(1).max(20).default(5),
      domain: z.string().optional(),
    }))
    .query(async ({ input }) => ({
      access: "PUBLIC_READ" as const,
      ...(await composeAnswer(input.question, { topK: input.topK, domain: input.domain })),
    })),
});
