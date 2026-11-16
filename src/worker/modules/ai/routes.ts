import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  CHAT_MODE_LABELS,
  createSessionSchema,
  evaluateSchema,
  evaluationOutputSchema,
  ingredientDraftOutputSchema,
  ingredientDraftSchema,
  lessonDraftOutputSchema,
  lessonDraftSchema,
  sendMessageSchema,
  type AiStatus,
  type ChatMessageRow,
  type ChatSessionRow,
  type ChatStreamEvent,
  type EvaluationRow,
} from "../../../shared/ai";
import { aiConfig, type AiConfig } from "../../ai/config";
import { learnerContext, topicContext, trimHistory } from "../../ai/context";
import {
  COACH_SYSTEM_PROMPT,
  EVALUATION_SYSTEM_PROMPT,
  INGREDIENT_DRAFT_SYSTEM_PROMPT,
  LESSON_DRAFT_SYSTEM_PROMPT,
  modeInstruction,
  titlePrompt,
} from "../../ai/prompts";
import { getAiProvider, toHttpError } from "../../ai/provider";
import { guardAiRequest, recordUsage, spentMicroUsd } from "../../ai/usage";
import type { Db } from "../../db/client";
import { answerEvaluations, chatMessages, chatSessions, competencies, ingredientProperties, ingredients, knowledgeCategories, learningModules, lessonCompetencies, lessons, levels, questions, sources } from "../../db/schema";
import { questionInputSchema } from "../../../shared/learning";
import { indexStatements } from "../../lib/search";
import { questionWrites } from "../learning/routes";
import { HttpError } from "../../lib/errors";
import { iso, notFound, requireEditor } from "../../lib/knowledge";
import { validationHook } from "../../lib/validation";
import { reindexIngredient } from "../ingredients/routes";
import { requireAuth } from "../../middleware/session";
import type { AppEnv } from "../../types";

const REDACTED_USER = "[Poufny fragment — treść nie została zapisana w historii.]";
const REDACTED_ASSISTANT = "[Odpowiedź dotycząca poufnego fragmentu — nie zapisano w historii.]";

function requireEnabled(cfg: AiConfig): void {
  if (!cfg.enabled) throw new HttpError(503, "ai_disabled", cfg.disabledReason ?? "Trener AI jest wyłączony.");
}

async function ownSession(db: Db, userId: string, id: string) {
  const [s] = await db.select().from(chatSessions).where(and(eq(chatSessions.id, id), eq(chatSessions.userId, userId)));
  if (!s) notFound("Nie znaleziono rozmowy.");
  return s;
}

const usd = (micro: number) => Math.round(micro) / 1_000_000;

export const aiRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get("/status", async (c) => {
    const cfg = aiConfig(c.env);
    const spent = await spentMicroUsd(c.var.db, c.var.user!.id);
    const body: AiStatus = {
      enabled: cfg.enabled,
      reason: cfg.disabledReason,
      model: cfg.model,
      modelLight: cfg.modelLight,
      usage: { todayUsd: usd(spent.today), monthUsd: usd(spent.month), dailyLimitUsd: cfg.dailyBudgetUsd, monthlyLimitUsd: cfg.monthlyBudgetUsd },
    };
    return c.json(body);
  })

  // ---- sessions (private to the user) ----
  .get("/sessions", async (c) => {
    const db = c.var.db;
    const rows = await db.select().from(chatSessions).where(eq(chatSessions.userId, c.var.user!.id)).orderBy(desc(chatSessions.updatedAt)).limit(100);
    const out: ChatSessionRow[] = await Promise.all(
      rows.map(async (s) => ({
        id: s.id,
        mode: s.mode,
        title: s.title,
        topicType: s.topicType,
        topicId: s.topicId,
        topicLabel: (await topicContext(db, s.topicType, s.topicId)).label,
        updatedAt: iso(s.updatedAt),
      })),
    );
    return c.json({ sessions: out });
  })
  .post("/sessions", zValidator("json", createSessionSchema, validationHook), async (c) => {
    const input = c.req.valid("json");
    const db = c.var.db;
    const topic = await topicContext(db, input.topicType ?? null, input.topicId ?? null);
    if (input.topicType && !topic.label) throw new HttpError(400, "validation_error", "Nieznany temat.", { topicId: "Nieznany temat" });
    const id = crypto.randomUUID();
    const title = input.title || (topic.label ? `${CHAT_MODE_LABELS[input.mode]}: ${topic.label}` : CHAT_MODE_LABELS[input.mode]);
    await db.insert(chatSessions).values({ id, userId: c.var.user!.id, mode: input.mode, title, topicType: input.topicType ?? null, topicId: input.topicId ?? null });
    return c.json({ id }, 201);
  })
  .get("/sessions/:id", async (c) => {
    const db = c.var.db;
    const s = await ownSession(db, c.var.user!.id, c.req.param("id"));
    const msgs = await db.select().from(chatMessages).where(eq(chatMessages.sessionId, s.id)).orderBy(asc(chatMessages.createdAt));
    const messages: ChatMessageRow[] = msgs.map((m) => ({ id: m.id, role: m.role, content: m.content, redacted: m.redacted, createdAt: iso(m.createdAt) }));
    const topic = await topicContext(db, s.topicType, s.topicId);
    return c.json({ session: { id: s.id, mode: s.mode, title: s.title, topicType: s.topicType, topicId: s.topicId, topicLabel: topic.label, updatedAt: iso(s.updatedAt) }, messages });
  })
  .delete("/sessions/:id", async (c) => {
    const s = await ownSession(c.var.db, c.var.user!.id, c.req.param("id"));
    await c.var.db.delete(chatSessions).where(eq(chatSessions.id, s.id));
    return c.json({ ok: true });
  })

  // ---- chat turn, streamed as SSE ----
  .post("/sessions/:id/messages", zValidator("json", sendMessageSchema, validationHook), async (c) => {
    const cfg = aiConfig(c.env);
    requireEnabled(cfg);
    const input = c.req.valid("json");
    const db = c.var.db;
    const user = c.var.user!;
    const session = await ownSession(db, user.id, c.req.param("id"));
    await guardAiRequest(db, cfg, user.id);

    const keep = !input.confidential || input.storeConfidential;
    const prior = await db.select().from(chatMessages).where(eq(chatMessages.sessionId, session.id)).orderBy(asc(chatMessages.createdAt));
    const isFirst = prior.length === 0;

    const [learner, topic] = await Promise.all([learnerContext(db, user.id, user.name), topicContext(db, session.topicType, session.topicId)]);
    const contextBlock = ["KONTEKST", learner, topic.text].filter(Boolean).join("\n\n").slice(0, Math.floor(cfg.maxContextChars / 3));
    const history = trimHistory(
      [
        ...prior.map((m) => ({ role: m.role, content: m.redacted ? (m.role === "user" ? REDACTED_USER : REDACTED_ASSISTANT) : m.content })),
        { role: "user" as const, content: input.confidential ? `[Poufny fragment udostępniony świadomie przez użytkownika]\n${input.content}` : input.content },
      ],
      cfg.maxContextChars,
    );

    // Persist the user's turn first (redacted if confidential and not consented).
    await db.insert(chatMessages).values({
      id: crypto.randomUUID(),
      sessionId: session.id,
      role: "user",
      content: keep ? input.content : "",
      redacted: !keep,
    });

    const provider = getAiProvider(cfg);
    return streamSSE(c, async (stream) => {
      // Writes to a closed connection are ignored: the generation itself must finish and be saved
      // even if the user navigates away (the reply is billed either way).
      const send = (e: ChatStreamEvent): Promise<void> =>
        stream.aborted ? Promise.resolve() : stream.writeSSE({ event: e.type, data: JSON.stringify(e) }).catch(() => undefined);
      const generation = (async () => {
      try {
        const result = await provider.streamText(
          {
            model: cfg.model,
            system: [COACH_SYSTEM_PROMPT, `${modeInstruction(session.mode)}\n\n${contextBlock}`],
            messages: history,
            maxTokens: cfg.maxOutputTokens,
            effort: cfg.effort,
          },
          (delta) => void send({ type: "delta", text: delta }),
        );
        const cost = await recordUsage(db, user.id, result.model, result.usage);
        let text = result.text;
        if (result.stopReason === "refusal") text = text || "Model odmówił odpowiedzi na to pytanie. Spróbuj sformułować je inaczej.";
        if (result.stopReason === "max_tokens") text += "\n\n[Odpowiedź przerwana: osiągnięto limit długości.]";
        const messageId = crypto.randomUUID();
        await db.batch([
          db.insert(chatMessages).values({
            id: messageId,
            sessionId: session.id,
            role: "assistant",
            content: keep ? text : "",
            redacted: !keep,
            model: result.model,
            stopReason: result.stopReason,
          }),
          db.update(chatSessions).set({ updatedAt: new Date() }).where(eq(chatSessions.id, session.id)),
        ]);
        await send({ type: "done", messageId, stopReason: result.stopReason, costUsd: usd(cost) });

        // Cheap model names the conversation after the first turn (never for confidential turns).
        if (isFirst && !input.confidential) {
          c.executionCtx.waitUntil(
            (async () => {
              try {
                const t = await provider.streamText(
                  { model: cfg.modelLight, system: ["Odpowiadasz wyłącznie krótkim tytułem."], messages: [{ role: "user", content: titlePrompt(input.content) }], maxTokens: 60, effort: "low" },
                  () => {},
                );
                await recordUsage(db, user.id, t.model, t.usage);
                const title = t.text.replace(/["„”.\n]/g, "").trim().slice(0, 80);
                if (title) await db.update(chatSessions).set({ title }).where(eq(chatSessions.id, session.id));
              } catch {
                /* title is cosmetic */
              }
            })(),
          );
        }
      } catch (err) {
        const e = toHttpError(err);
        console.error("ai_stream_error", e.code);
        await send({ type: "error", message: e.message });
      }
      })();
      // Keep the Worker alive until the reply is stored, even after a client disconnect.
      c.executionCtx.waitUntil(generation);
      await generation;
    });
  })

  // ---- answer evaluation (structured output) ----
  .get("/evaluations", async (c) => {
    const rows = await c.var.db.select().from(answerEvaluations).where(eq(answerEvaluations.userId, c.var.user!.id)).orderBy(desc(answerEvaluations.createdAt)).limit(50);
    const out: EvaluationRow[] = rows.map((r) => ({
      id: r.id,
      question: r.question,
      answer: r.answer,
      verdict: r.verdict,
      correctness: r.correctness,
      reasoningQuality: r.reasoningQuality,
      feedback: r.feedback,
      misconceptions: r.misconceptions,
      followUpQuestion: r.followUpQuestion,
      competencyKeys: r.competencyKeys,
      createdAt: iso(r.createdAt),
    }));
    return c.json({ evaluations: out });
  })
  .post("/evaluate", zValidator("json", evaluateSchema, validationHook), async (c) => {
    const cfg = aiConfig(c.env);
    requireEnabled(cfg);
    const input = c.req.valid("json");
    const db = c.var.db;
    const user = c.var.user!;
    await guardAiRequest(db, cfg, user.id);
    const comps = await db.select({ key: competencies.key, name: competencies.name }).from(competencies);
    const allowed = new Set(comps.map((x) => x.key));
    try {
      const res = await getAiProvider(cfg).structured(
        {
          model: cfg.model,
          system: [EVALUATION_SYSTEM_PROMPT, `Dostępne klucze kompetencji: ${comps.map((x) => `${x.key} (${x.name})`).join(", ")}`],
          messages: [{ role: "user", content: `PYTANIE:\n${input.question}\n\nODPOWIEDŹ UCZNIA:\n${input.answer}` }],
          maxTokens: Math.min(cfg.maxOutputTokens, 2000),
          effort: cfg.effort,
        },
        evaluationOutputSchema,
      );
      await recordUsage(db, user.id, res.model, res.usage);
      if (!res.data) throw new HttpError(502, "ai_no_result", "Trener nie zwrócił oceny. Spróbuj ponownie.");
      const d = res.data;
      const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
      const row = {
        id: crypto.randomUUID(),
        userId: user.id,
        question: input.question,
        answer: input.answer,
        correctness: clamp(d.correctness),
        reasoningQuality: clamp(d.reasoning_quality),
        selfConfidence: input.selfConfidence ?? null,
        verdict: d.verdict,
        feedback: d.feedback,
        misconceptions: d.misconceptions.slice(0, 10),
        followUpQuestion: d.follow_up_question || null,
        competencyKeys: d.competency_keys.filter((k) => allowed.has(k)),
        model: res.model,
      };
      await db.insert(answerEvaluations).values(row);
      const out: EvaluationRow = { ...row, createdAt: new Date().toISOString() };
      return c.json(out, 201);
    } catch (err) {
      throw toHttpError(err);
    }
  })

  // ---- AI draft of an ingredient card (editors) ----
  .post("/drafts/ingredient", requireEditor, zValidator("json", ingredientDraftSchema, validationHook), async (c) => {
    const cfg = aiConfig(c.env);
    requireEnabled(cfg);
    const { ingredientId } = c.req.valid("json");
    const db = c.var.db;
    const user = c.var.user!;
    const [ing] = await db
      .select({ id: ingredients.id, namePl: ingredients.namePl, nameOriginal: ingredients.nameOriginal, transliteration: ingredients.transliteration, category: knowledgeCategories.name })
      .from(ingredients)
      .leftJoin(knowledgeCategories, eq(knowledgeCategories.id, ingredients.categoryId))
      .where(eq(ingredients.id, ingredientId));
    if (!ing) notFound("Nie znaleziono składnika.");
    await guardAiRequest(db, cfg, user.id);
    try {
      const res = await getAiProvider(cfg).structured(
        {
          model: cfg.model,
          system: [INGREDIENT_DRAFT_SYSTEM_PROMPT],
          messages: [
            {
              role: "user",
              content: `Składnik: ${ing.namePl}${ing.nameOriginal ? ` (${ing.nameOriginal}${ing.transliteration ? `, ${ing.transliteration}` : ""})` : ""}${ing.category ? `; kategoria: ${ing.category}` : ""}. Przygotuj szkic właściwości.`,
            },
          ],
          maxTokens: cfg.maxOutputTokens,
          effort: cfg.effort,
        },
        ingredientDraftOutputSchema,
      );
      await recordUsage(db, user.id, res.model, res.usage);
      const props = (res.data?.properties ?? []).filter((p) => p.content.trim()).slice(0, 15);
      if (props.length === 0) throw new HttpError(502, "ai_no_result", "Trener nie przygotował szkicu. Spróbuj ponownie.");
      const sourceId = crypto.randomUUID();
      const today = new Date().toISOString().slice(0, 10);
      await db.batch([
        db.insert(sources).values({
          id: sourceId,
          type: "ai_draft",
          title: `Szkic AI: ${ing.namePl} (${res.model}, ${today})`,
          notes: "Wygenerowane automatycznie. Wymaga weryfikacji przed uznaniem za potwierdzone.",
          retrievedAt: today,
          isPrivate: false,
          ownerId: user.id,
        }),
        ...props.map((p) =>
          db.insert(ingredientProperties).values({
            id: crypto.randomUUID(),
            ingredientId: ing.id,
            aspect: p.aspect,
            content: p.content.trim().slice(0, 5000),
            status: "needs_verification",
            sourceId,
            createdBy: user.id,
            updatedBy: user.id,
          }),
        ),
      ]);
      await reindexIngredient(db, ing.id);
      return c.json({ added: props.length, sourceId }, 201);
    } catch (err) {
      throw toHttpError(err);
    }
  })

  // ---- AI draft of a lesson with questions (editors) ----
  .post("/drafts/lesson", requireEditor, zValidator("json", lessonDraftSchema, validationHook), async (c) => {
    const cfg = aiConfig(c.env);
    requireEnabled(cfg);
    const input = c.req.valid("json");
    const db = c.var.db;
    const user = c.var.user!;
    const [cat] = await db.select().from(knowledgeCategories).where(eq(knowledgeCategories.slug, input.categorySlug));
    if (!cat) throw new HttpError(400, "validation_error", "Nieznana kategoria.", { categorySlug: "Nieznana kategoria" });
    const [lvl] = input.levelKey ? await db.select().from(levels).where(eq(levels.key, input.levelKey)) : [];
    const comps = await db.select({ id: competencies.id, key: competencies.key, name: competencies.name, levelId: competencies.levelId }).from(competencies);
    const usable = lvl ? comps.filter((x) => x.levelId === lvl.id) : comps;
    await guardAiRequest(db, cfg, user.id);
    try {
      const res = await getAiProvider(cfg).structured(
        {
          model: cfg.model,
          system: [LESSON_DRAFT_SYSTEM_PROMPT],
          messages: [
            {
              role: "user",
              content: `Kategoria: ${cat.name}\nPoziom: ${lvl?.name ?? "kucharz zaawansowany → chef"}\nTemat lekcji: ${input.topic}\nDostępne kompetencje: ${usable.map((x) => `${x.key} (${x.name})`).join(", ")}`,
            },
          ],
          maxTokens: Math.max(cfg.maxOutputTokens, 6000),
          effort: cfg.effort,
        },
        lessonDraftOutputSchema,
      );
      await recordUsage(db, user.id, res.model, res.usage);
      const d = res.data;
      if (!d || !d.title.trim() || !d.body.trim()) throw new HttpError(502, "ai_no_result", "Trener nie przygotował lekcji. Spróbuj ponownie.");
      const byKey = new Map(comps.map((x) => [x.key, x.id]));
      const today = new Date().toISOString().slice(0, 10);
      const sourceId = crypto.randomUUID();
      // One "AI drafts" module per category collects generated lessons until the owner moves/edits them.
      const [mod] = await db.select({ id: learningModules.id }).from(learningModules).where(and(eq(learningModules.categoryId, cat.id), eq(learningModules.title, "Szkice AI")));
      const moduleId = mod?.id ?? crypto.randomUUID();
      const lessonId = crypto.randomUUID();
      const lessonComps = [...new Set(d.competency_keys.map((k) => byKey.get(k)).filter((v): v is string => Boolean(v)))];
      // Keep only questions that pass the same validation as manual ones.
      const qs = d.questions
        .map((q) =>
          questionInputSchema.safeParse({
            type: q.type,
            prompt: q.prompt,
            explanation: q.explanation,
            difficulty: Math.min(3, Math.max(1, q.difficulty)),
            categorySlug: cat.slug,
            lessonId,
            competencyKeys: q.competency_keys.filter((k) => byKey.has(k)),
            options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect, matchTarget: o.matchTarget })),
            status: "needs_verification",
            sourceId,
          }),
        )
        .filter((r) => r.success)
        .map((r) => r.data)
        .slice(0, 8);
      await db.batch([
        db.insert(sources).values({ id: sourceId, type: "ai_draft", title: `Szkic AI: ${d.title.slice(0, 120)} (${res.model}, ${today})`, notes: "Wygenerowane automatycznie. Wymaga weryfikacji.", retrievedAt: today, ownerId: user.id }),
        ...(mod ? [] : [db.insert(learningModules).values({ id: moduleId, categoryId: cat.id, levelId: lvl?.id ?? null, title: "Szkice AI", description: "Lekcje wygenerowane przez trenera AI — do weryfikacji.", sortOrder: 9999, createdBy: user.id })]),
        db.insert(lessons).values({ id: lessonId, moduleId, title: d.title.trim().slice(0, 160), body: d.body.trim().slice(0, 50000), status: "needs_verification", sourceId, createdBy: user.id, updatedBy: user.id }),
        ...lessonComps.map((cid) => db.insert(lessonCompetencies).values({ lessonId, competencyId: cid })),
        ...indexStatements(db, { type: "lesson", id: lessonId, ownerId: null, title: d.title, body: d.body }),
      ]);
      for (const q of qs) {
        const qid = crypto.randomUUID();
        await db.batch([
          db.insert(questions).values({ id: qid, type: q.type, prompt: q.prompt, explanation: q.explanation, difficulty: q.difficulty, categoryId: cat.id, lessonId, status: "needs_verification", sourceId, createdBy: user.id, updatedBy: user.id }),
          ...questionWrites(db, qid, q, q.competencyKeys.map((k) => byKey.get(k)!)),
        ]);
      }
      return c.json({ lessonId, questions: qs.length }, 201);
    } catch (err) {
      throw toHttpError(err);
    }
  });

