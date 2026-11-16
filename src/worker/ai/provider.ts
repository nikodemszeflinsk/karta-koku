import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { HttpError } from "../lib/errors";
import { supportsServerFallback, type AiConfig, type Effort, type TokenUsage } from "./config";

export interface AiRequest {
  model: string;
  /** First block is static (cached); later blocks carry per-request context. */
  system: string[];
  messages: { role: "user" | "assistant"; content: string }[];
  maxTokens: number;
  effort: Effort;
}

export interface AiResult {
  text: string;
  stopReason: string | null;
  /** Model that actually served the request (may differ after a refusal fallback). */
  model: string;
  usage: TokenUsage;
}

export interface AiProvider {
  streamText(req: AiRequest, onText: (delta: string) => void): Promise<AiResult>;
  structured<S extends z.ZodType>(req: AiRequest, schema: S): Promise<AiResult & { data: z.infer<S> | null }>;
}

function systemBlocks(system: string[]): Anthropic.TextBlockParam[] {
  return system.map((text, i) => (i === 0 ? { type: "text", text, cache_control: { type: "ephemeral" } } : { type: "text", text }));
}

function usageOf(u: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }): TokenUsage {
  return {
    input: u.input_tokens,
    output: u.output_tokens,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
  };
}

/** Maps SDK errors to user-facing HTTP errors. Never includes prompt content. */
export function toHttpError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new HttpError(503, "ai_auth", "Klucz API Anthropic jest nieprawidłowy lub nie ma uprawnień.");
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new HttpError(429, "ai_rate_limited", "Usługa AI jest chwilowo przeciążona. Spróbuj za chwilę.");
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new HttpError(502, "ai_bad_request", "Usługa AI odrzuciła zapytanie (błąd konfiguracji modelu).");
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new HttpError(502, "ai_unreachable", "Brak połączenia z usługą AI.");
  }
  if (err instanceof Anthropic.APIError) {
    return new HttpError(502, "ai_error", `Usługa AI zwróciła błąd (${err.status ?? "?"}).`);
  }
  return new HttpError(500, "ai_internal", "Nieoczekiwany błąd trenera AI.");
}

export class AnthropicProvider implements AiProvider {
  private client: Anthropic;
  constructor(apiKey: string, baseURL?: string) {
    // maxRetries: the SDK retries 408/409/429/5xx and connection errors itself.
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 90_000, ...(baseURL ? { baseURL } : {}) });
  }

  async streamText(req: AiRequest, onText: (delta: string) => void): Promise<AiResult> {
    const fallback = supportsServerFallback(req.model);
    const stream = this.client.beta.messages.stream({
      model: req.model,
      max_tokens: req.maxTokens,
      system: systemBlocks(req.system),
      messages: req.messages,
      output_config: { effort: req.effort },
      ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
    stream.on("text", onText);
    const msg = await stream.finalMessage();
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return { text, stopReason: msg.stop_reason, model: msg.model, usage: usageOf(msg.usage) };
  }

  async structured<S extends z.ZodType>(req: AiRequest, schema: S): Promise<AiResult & { data: z.infer<S> | null }> {
    const res = await this.client.messages.parse({
      model: req.model,
      max_tokens: req.maxTokens,
      system: systemBlocks(req.system),
      messages: req.messages,
      output_config: { effort: req.effort, format: zodOutputFormat(schema) },
    });
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return {
      text,
      stopReason: res.stop_reason,
      model: res.model,
      usage: usageOf(res.usage),
      data: res.stop_reason === "refusal" ? null : ((res.parsed_output as z.infer<S> | null) ?? null),
    };
  }
}

type Factory = (cfg: AiConfig) => AiProvider;
let factory: Factory = (cfg) => new AnthropicProvider(cfg.apiKey, cfg.baseUrl);

export function getAiProvider(cfg: AiConfig): AiProvider {
  return factory(cfg);
}

/** Test hook: replace the provider (tests must never call the real API). */
export function setAiProviderFactory(f: Factory | null): void {
  factory = f ?? ((cfg) => new AnthropicProvider(cfg.apiKey, cfg.baseUrl));
}
