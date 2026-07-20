import { z } from "zod";
import { createRouter, protectedQuery } from "./middleware";

/**
 * AI Bridge — federation endpoint that lets sibling ONX services (marketing,
 * platform) run real LLM completions through THIS service's configured
 * provider, authenticated by the bridge shared secret (protectedQuery).
 *
 * Rationale: secret env values cannot be copied across Render services via
 * API, so instead of duplicating OPENAI_API_KEY everywhere, the brain serves
 * completions to the body over the secured bridge.
 */
export const aiBridgeRouter = createRouter({
  complete: protectedQuery
    .input(z.object({
      system: z.string().max(8000).default(""),
      prompt: z.string().min(1).max(24000),
      model: z.string().max(80).default("gpt-4o-mini"),
      temperature: z.number().min(0).max(2).default(0.7),
      maxTokens: z.number().min(16).max(4000).default(2000),
    }))
    .mutation(async ({ input }) => {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return { ok: false as const, reason: "OPENAI_API_KEY_NOT_CONFIGURED", content: "" };
      }
      try {
        const { default: OpenAI } = await import("openai");
        const openai = new OpenAI({ apiKey });
        const messages: Array<{ role: "system" | "user"; content: string }> = [];
        if (input.system) messages.push({ role: "system", content: input.system });
        messages.push({ role: "user", content: input.prompt });
        const res = await openai.chat.completions.create({
          model: input.model,
          messages,
          temperature: input.temperature,
          max_tokens: input.maxTokens,
        });
        return {
          ok: true as const,
          content: res.choices[0]?.message?.content ?? "",
          model: input.model,
          usage: {
            promptTokens: res.usage?.prompt_tokens ?? 0,
            completionTokens: res.usage?.completion_tokens ?? 0,
          },
        };
      } catch (err) {
        return { ok: false as const, reason: `PROVIDER_ERROR: ${(err as Error).message}`, content: "" };
      }
    }),

  /** Lightweight liveness/capability probe for federated consumers. */
  status: protectedQuery.query(async () => ({
    ok: true as const,
    providerConfigured: Boolean(process.env.OPENAI_API_KEY),
    defaultModel: "gpt-4o-mini",
    imageModel: "gpt-image-1",
  })),

  /**
   * Real image generation for sibling services (marketing creative factory).
   * Uses the same OPENAI_API_KEY already configured on this service — the
   * caller never needs its own key. Returns base64 PNG (data URL ready).
   */
  generateImage: protectedQuery
    .input(z.object({
      prompt: z.string().min(1).max(4000),
      size: z.enum(["1024x1024", "1536x1024", "1024x1536"]).default("1024x1024"),
      quality: z.enum(["low", "medium", "high"]).default("medium"),
    }))
    .mutation(async ({ input }) => {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return { ok: false as const, reason: "OPENAI_API_KEY_NOT_CONFIGURED", imageBase64: "", mime: "" };
      }
      try {
        const { default: OpenAI } = await import("openai");
        const openai = new OpenAI({ apiKey });
        const res = await openai.images.generate({
          model: "gpt-image-1",
          prompt: input.prompt,
          size: input.size,
          quality: input.quality,
        });
        const b64 = res.data?.[0]?.b64_json ?? "";
        if (!b64) {
          return { ok: false as const, reason: "PROVIDER_RETURNED_NO_IMAGE", imageBase64: "", mime: "" };
        }
        return { ok: true as const, imageBase64: b64, mime: "image/png", model: "gpt-image-1" };
      } catch (err) {
        return { ok: false as const, reason: `PROVIDER_ERROR: ${(err as Error).message}`, imageBase64: "", mime: "" };
      }
    }),
});
