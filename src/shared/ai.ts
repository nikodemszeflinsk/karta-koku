import { z } from "zod";

export const CHAT_MODES = ["conversation", "lesson", "oral_exam", "simulation"] as const;
export type ChatMode = (typeof CHAT_MODES)[number];
export const CHAT_MODE_LABELS: Record<ChatMode, string> = {
  conversation: "Rozmowa z mentorem",
  lesson: "Lekcja tematyczna",
  oral_exam: "Egzamin ustny",
  simulation: "Symulacja problemu kuchennego",
};
export const CHAT_MODE_HINTS: Record<ChatMode, string> = {
  conversation: "Zadawaj pytania, mentor dopytuje i wyjaśnia mechanizmy.",
  lesson: "Mentor prowadzi krótką lekcję wybranego zagadnienia z pytaniami kontrolnymi.",
  oral_exam: "Mentor zadaje pytania, ocenia odpowiedzi i dopytuje o uzasadnienie.",
  simulation: "Mentor opisuje problem z kuchni, Ty diagnozujesz i proponujesz działania.",
};

export const CHAT_TOPIC_TYPES = ["ingredient", "menu_item", "technique", "category"] as const;
export type ChatTopicType = (typeof CHAT_TOPIC_TYPES)[number];

export const MAX_MESSAGE_CHARS = 4000;

export const createSessionSchema = z.object({
  mode: z.enum(CHAT_MODES),
  title: z.string().trim().max(120).optional(),
  topicType: z.enum(CHAT_TOPIC_TYPES).nullable().optional(),
  topicId: z.string().max(100).nullable().optional(),
});

export const sendMessageSchema = z
  .object({
    content: z.string().trim().min(1, "Wpisz wiadomość").max(MAX_MESSAGE_CHARS, `Maks. ${MAX_MESSAGE_CHARS} znaków`),
    /** The message contains a confidential fragment the user explicitly chose to send. */
    confidential: z.boolean().default(false),
    /** Must be true when confidential: the user saw exactly what will be sent and confirmed. */
    confirmedSend: z.boolean().default(false),
    /** Store the confidential turn in history (off by default). */
    storeConfidential: z.boolean().default(false),
  })
  .refine((v) => !v.confidential || v.confirmedSend, { message: "Potwierdź wysłanie poufnego fragmentu", path: ["confirmedSend"] });

export const evaluateSchema = z.object({
  question: z.string().trim().min(5, "Wpisz pytanie").max(2000),
  answer: z.string().trim().min(1, "Wpisz odpowiedź").max(4000),
  selfConfidence: z.number().int().min(1).max(4).optional(),
});

/** Structured output requested from the model when grading an answer. */
export const evaluationOutputSchema = z.object({
  verdict: z.enum(["correct", "partially_correct", "incorrect"]),
  correctness: z.number().int().min(0).max(100),
  reasoning_quality: z.number().int().min(0).max(100),
  feedback: z.string(),
  misconceptions: z.array(z.string()),
  follow_up_question: z.string(),
  competency_keys: z.array(z.string()),
});
export type EvaluationOutput = z.infer<typeof evaluationOutputSchema>;

export const ingredientDraftSchema = z.object({
  ingredientId: z.string().min(1).max(100),
});

export const ingredientDraftOutputSchema = z.object({
  properties: z.array(
    z.object({
      aspect: z.enum([
        "composition",
        "physical",
        "chemical",
        "taste_aroma",
        "texture",
        "usage",
        "heating",
        "cooling",
        "structure_effect",
        "common_errors",
        "storage",
      ]),
      content: z.string(),
    }),
  ),
});

// ---- Responses ----

export interface AiStatus {
  enabled: boolean;
  reason: string | null;
  model: string;
  modelLight: string;
  usage: { todayUsd: number; monthUsd: number; dailyLimitUsd: number; monthlyLimitUsd: number };
}

export interface ChatSessionRow {
  id: string;
  mode: ChatMode;
  title: string;
  topicType: ChatTopicType | null;
  topicId: string | null;
  topicLabel: string | null;
  updatedAt: string;
}

export interface ChatMessageRow {
  id: string;
  role: "user" | "assistant";
  content: string;
  redacted: boolean;
  createdAt: string;
}

export interface EvaluationRow {
  id: string;
  question: string;
  answer: string;
  verdict: EvaluationOutput["verdict"];
  correctness: number;
  reasoningQuality: number;
  feedback: string;
  misconceptions: string[];
  followUpQuestion: string | null;
  competencyKeys: string[];
  createdAt: string;
}

/** Server-sent events emitted by POST /api/ai/sessions/:id/messages. */
export type ChatStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; messageId: string; stopReason: string | null; costUsd: number }
  | { type: "error"; message: string };

export const lessonDraftSchema = z.object({
  categorySlug: z.string().max(60),
  levelKey: z.string().max(40).nullable().optional(),
  topic: z.string().trim().min(3, "Opisz temat lekcji").max(300),
});

export const lessonDraftOutputSchema = z.object({
  title: z.string(),
  body: z.string(),
  competency_keys: z.array(z.string()),
  questions: z.array(
    z.object({
      type: z.enum(["single", "multi", "open", "explain_process", "error_analysis", "scenario", "compare", "fill_composition", "identify", "match"]),
      prompt: z.string(),
      explanation: z.string(),
      difficulty: z.number().int(),
      options: z.array(z.object({ text: z.string(), isCorrect: z.boolean(), matchTarget: z.string().nullable() })),
      competency_keys: z.array(z.string()),
    }),
  ),
});
