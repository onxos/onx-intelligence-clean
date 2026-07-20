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

  /**
   * Real Arabic-capable speech synthesis (OpenAI TTS) for sibling services.
   * Returns base64 MP3 audio. Used by the marketing video pipeline for
   * voiceovers — again without the caller needing its own key.
   */
  speech: protectedQuery
    .input(z.object({
      text: z.string().min(1).max(4000),
      voice: z.enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]).default("onyx"),
      speed: z.number().min(0.25).max(4).default(1.0),
    }))
    .mutation(async ({ input }) => {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return { ok: false as const, reason: "OPENAI_API_KEY_NOT_CONFIGURED", audioBase64: "" };
      }
      try {
        const { default: OpenAI } = await import("openai");
        const openai = new OpenAI({ apiKey });
        const res = await openai.audio.speech.create({
          model: "tts-1",
          voice: input.voice,
          input: input.text,
          speed: input.speed,
          response_format: "mp3",
        });
        const buf = Buffer.from(await res.arrayBuffer());
        return { ok: true as const, audioBase64: buf.toString("base64"), mime: "audio/mpeg", model: "tts-1" };
      } catch (err) {
        return { ok: false as const, reason: `PROVIDER_ERROR: ${(err as Error).message}`, audioBase64: "" };
      }
    }),

  /**
   * Gemini image generation ("Nano Banana" family) via GEMINI_API_KEY.
   * Higher fidelity than gpt-image-1 for ad creative + correct Arabic text
   * rendering. Returns base64 image (data URL ready). Key-free fallback:
   * returns KEY_NOT_CONFIGURED so the caller can fall back to OpenAI.
   */
  generateImageGemini: protectedQuery
    .input(z.object({
      prompt: z.string().min(1).max(4000),
      aspectRatio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]).default("1:1"),
      model: z.string().max(80).default("gemini-3-pro-image-preview"),
    }))
    .mutation(async ({ input }) => {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return { ok: false as const, reason: "GEMINI_API_KEY_NOT_CONFIGURED", imageBase64: "", mime: "" };
      }
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${input.model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: input.prompt }] }],
              generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: input.aspectRatio } },
            }),
          },
        );
        const body = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> } }>;
          error?: { message?: string };
        };
        if (!res.ok) {
          return { ok: false as const, reason: `PROVIDER_ERROR: ${body?.error?.message ?? res.status}`, imageBase64: "", mime: "" };
        }
        const part = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
        if (!part?.inlineData?.data) {
          return { ok: false as const, reason: "PROVIDER_RETURNED_NO_IMAGE", imageBase64: "", mime: "" };
        }
        return { ok: true as const, imageBase64: part.inlineData.data, mime: part.inlineData.mimeType ?? "image/png", model: input.model };
      } catch (err) {
        return { ok: false as const, reason: `PROVIDER_ERROR: ${(err as Error).message}`, imageBase64: "", mime: "" };
      }
    }),

  /**
   * Veo generative video — starts a long-running generation operation.
   * Poll with videoStatus. Requires GEMINI_API_KEY with Veo access.
   */
  generateVideoVeo: protectedQuery
    .input(z.object({
      prompt: z.string().min(1).max(4000),
      aspectRatio: z.enum(["16:9", "9:16"]).default("16:9"),
      model: z.string().max(80).default("veo-3.1-generate-preview"),
    }))
    .mutation(async ({ input }) => {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return { ok: false as const, reason: "GEMINI_API_KEY_NOT_CONFIGURED", operationName: "" };
      }
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${input.model}:predictLongRunning?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              instances: [{ prompt: input.prompt }],
              parameters: { aspectRatio: input.aspectRatio },
            }),
          },
        );
        const body = (await res.json()) as { name?: string; error?: { message?: string } };
        if (!res.ok || !body.name) {
          return { ok: false as const, reason: `PROVIDER_ERROR: ${body?.error?.message ?? res.status}`, operationName: "" };
        }
        return { ok: true as const, operationName: body.name, model: input.model };
      } catch (err) {
        return { ok: false as const, reason: `PROVIDER_ERROR: ${(err as Error).message}`, operationName: "" };
      }
    }),

  /** Poll a Veo long-running operation; returns video base64 when done. */
  videoStatus: protectedQuery
    .input(z.object({ operationName: z.string().min(1).max(500) }))
    .query(async ({ input }) => {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return { ok: false as const, reason: "GEMINI_API_KEY_NOT_CONFIGURED", done: false, videoBase64: "" };
      }
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/${input.operationName}?key=${apiKey}`,
        );
        const body = (await res.json()) as {
          done?: boolean;
          error?: { message?: string };
          response?: { generateVideoResponse?: { generatedSamples?: Array<{ video?: { uri?: string; bytesBase64Encoded?: string } }> } };
        };
        if (body.error) {
          return { ok: false as const, reason: `PROVIDER_ERROR: ${body.error.message}`, done: true, videoBase64: "" };
        }
        if (!body.done) {
          return { ok: true as const, done: false as const, videoBase64: "" };
        }
        const sample = body.response?.generateVideoResponse?.generatedSamples?.[0]?.video;
        if (sample?.bytesBase64Encoded) {
          return { ok: true as const, done: true as const, videoBase64: sample.bytesBase64Encoded, mime: "video/mp4" };
        }
        if (sample?.uri) {
          const vid = await fetch(`${sample.uri}${sample.uri.includes("?") ? "&" : "?"}key=${apiKey}`);
          const buf = Buffer.from(await vid.arrayBuffer());
          return { ok: true as const, done: true as const, videoBase64: buf.toString("base64"), mime: "video/mp4" };
        }
        return { ok: false as const, reason: "OPERATION_DONE_BUT_NO_VIDEO", done: true, videoBase64: "" };
      } catch (err) {
        return { ok: false as const, reason: `PROVIDER_ERROR: ${(err as Error).message}`, done: false, videoBase64: "" };
      }
    }),
});
