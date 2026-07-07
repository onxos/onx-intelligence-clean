// ============================================================
// VOICE ROUTER — Arabic STT (Whisper) + TTS (OpenAI TTS)
// P0-09: Voice input/output in Arabic
// ============================================================
import { z } from "zod";
import OpenAI from "openai";
import { createRouter, publicQuery } from "./middleware";
import { env } from "./lib/env";

// Lazy OpenAI client
let openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openai) {
    const key = env.openAiApiKey || process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");
    openai = new OpenAI({ apiKey: key });
  }
  return openai;
}

// Stats
let sttRequests = 0;
let ttsRequests = 0;
let totalAudioMs = 0;

export const voiceRouter = createRouter({
  // STT: Speech-to-Text via Whisper
  transcribe: publicQuery
    .input(z.object({
      audioBase64: z.string().describe("Base64-encoded audio file (mp3, mp4, wav, webm, m4a)"),
      mimeType: z.string().default("audio/webm").describe("MIME type of the audio"),
      language: z.string().default("ar").describe("Language code — 'ar' for Arabic"),
      prompt: z.string().optional().describe("Optional hint for domain vocabulary"),
    }))
    .mutation(async ({ input }) => {
      const ai = getOpenAI();
      sttRequests++;

      // Decode base64 to buffer
      const buffer = Buffer.from(input.audioBase64, "base64");
      const ext = input.mimeType.split("/")[1]?.split(";")[0] || "webm";

      // Create a File-like object for the OpenAI SDK
      const file = new File([buffer], `audio.${ext}`, { type: input.mimeType });

      const response = await ai.audio.transcriptions.create({
        file,
        model: "whisper-1",
        language: input.language === "ar" ? "ar" : undefined,
        prompt: input.prompt || (input.language === "ar" ? "هذا صوت بالعربية" : undefined),
        response_format: "verbose_json",
      });

      return {
        text: response.text,
        language: response.language || input.language,
        duration: response.duration || 0,
        segments: response.segments?.map(s => ({
          text: s.text,
          start: s.start,
          end: s.end,
          confidence: s.avg_logprob ? Math.exp(s.avg_logprob) : null,
        })) ?? [],
        model: "whisper-1",
      };
    }),

  // TTS: Text-to-Speech
  synthesize: publicQuery
    .input(z.object({
      text: z.string().max(4096).describe("Text to synthesize (Arabic or English)"),
      voice: z.enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]).default("nova").describe("Voice character"),
      speed: z.number().min(0.25).max(4.0).default(1.0),
      format: z.enum(["mp3", "opus", "aac", "flac", "wav", "pcm"]).default("mp3"),
    }))
    .mutation(async ({ input }) => {
      const ai = getOpenAI();
      ttsRequests++;

      const response = await ai.audio.speech.create({
        model: "tts-1",
        voice: input.voice,
        input: input.text,
        speed: input.speed,
        response_format: input.format,
      });

      // Convert to base64 for transport
      const arrayBuffer = await response.arrayBuffer();
      const base64Audio = Buffer.from(arrayBuffer).toString("base64");
      const estimatedMs = Math.round((input.text.length / 15) * 1000); // rough estimate
      totalAudioMs += estimatedMs;

      return {
        audioBase64: base64Audio,
        mimeType: `audio/${input.format}`,
        estimatedDurationMs: estimatedMs,
        characters: input.text.length,
        voice: input.voice,
        model: "tts-1",
      };
    }),

  // TTS HD quality
  synthesizeHD: publicQuery
    .input(z.object({
      text: z.string().max(4096),
      voice: z.enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]).default("nova"),
      speed: z.number().min(0.25).max(4.0).default(1.0),
    }))
    .mutation(async ({ input }) => {
      const ai = getOpenAI();
      ttsRequests++;

      const response = await ai.audio.speech.create({
        model: "tts-1-hd",
        voice: input.voice,
        input: input.text,
        speed: input.speed,
        response_format: "mp3",
      });

      const arrayBuffer = await response.arrayBuffer();
      const base64Audio = Buffer.from(arrayBuffer).toString("base64");

      return {
        audioBase64: base64Audio,
        mimeType: "audio/mp3",
        characters: input.text.length,
        voice: input.voice,
        model: "tts-1-hd",
      };
    }),

  // Translate non-Arabic audio to Arabic text
  translateToArabic: publicQuery
    .input(z.object({
      audioBase64: z.string(),
      mimeType: z.string().default("audio/webm"),
    }))
    .mutation(async ({ input }) => {
      const ai = getOpenAI();

      const buffer = Buffer.from(input.audioBase64, "base64");
      const ext = input.mimeType.split("/")[1]?.split(";")[0] || "webm";
      const file = new File([buffer], `audio.${ext}`, { type: input.mimeType });

      // First transcribe in original language
      const transcription = await ai.audio.transcriptions.create({
        file,
        model: "whisper-1",
        response_format: "text",
      });

      // Then translate to Arabic via GPT-4o
      const translation = await ai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "ترجم النص التالي إلى العربية الفصحى بدقة عالية مع الحفاظ على المعنى التقني." },
          { role: "user", content: transcription },
        ],
        max_tokens: 1000,
      });

      return {
        originalText: transcription,
        arabicText: translation.choices[0]?.message.content || "",
        model: "whisper-1 + gpt-4o",
      };
    }),

  // Stats
  stats: publicQuery.query(() => ({
    sttRequests,
    ttsRequests,
    totalAudioMs,
    supportedLanguages: ["ar", "en", "fr", "de", "es", "tr", "ur"],
    models: { stt: "whisper-1", tts: "tts-1", ttsHD: "tts-1-hd" },
    voices: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
    arabicOptimized: true,
  })),
});
