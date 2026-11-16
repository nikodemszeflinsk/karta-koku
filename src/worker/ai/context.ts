import { asc, desc, eq } from "drizzle-orm";
import type { ChatTopicType } from "../../shared/ai";
import { ASPECT_LABELS, COMPONENT_ROLE_LABELS, KIND_LABELS, TIER_LABELS, type VerificationStatus } from "../../shared/knowledge";
import type { Db } from "../db/client";
import {
  answerEvaluations,
  ingredientProperties,
  ingredients,
  knowledgeCategories,
  menuCategories,
  menuItemComponents,
  menuItems,
  sources,
  techniques,
} from "../db/schema";
import { listLevels } from "../modules/academy/repo";
import { getProfile } from "../modules/me/routes";

const STATUS_TAG: Record<VerificationStatus, string> = {
  confirmed: "[potwierdzone]",
  general_knowledge: "[wiedza ogólna]",
  needs_verification: "[do weryfikacji]",
  unknown: "[brak informacji]",
};

/** Learner profile + recent weak spots. Never includes notes, recipes or vault content. */
export async function learnerContext(db: Db, userId: string, fallbackName: string): Promise<string> {
  const [profile, levels, weak] = await Promise.all([
    getProfile(db, userId),
    listLevels(db),
    db
      .select({
        question: answerEvaluations.question,
        misconceptions: answerEvaluations.misconceptions,
        correctness: answerEvaluations.correctness,
        reasoningQuality: answerEvaluations.reasoningQuality,
      })
      .from(answerEvaluations)
      .where(eq(answerEvaluations.userId, userId))
      .orderBy(desc(answerEvaluations.createdAt))
      .limit(8),
  ]);
  const target = levels.find((l) => l.key === profile.targetLevelKey);
  const lines = [
    "PROFIL UCZNIA",
    `Imię: ${profile.displayName ?? fallbackName}`,
    profile.position ? `Stanowisko: ${profile.position}` : null,
    target
      ? `Poziom docelowy: ${target.name}. Kompetencje: ${target.competencies.map((c) => `${c.name} (${c.key})`).join(", ")}.`
      : "Poziom docelowy: nie wybrano (zakładaj ścieżkę kucharz zaawansowany → chef).",
  ];
  // Weak = wrong, or right without understanding (low reasoning quality).
  const weakOnes = weak.filter((w) => w.correctness < 70 || w.reasoningQuality < 60);
  if (weakOnes.length) {
    lines.push("Ostatnie słabe obszary (z ocen odpowiedzi):");
    for (const w of weakOnes.slice(0, 5)) {
      lines.push(`- pytanie: ${w.question.slice(0, 160)}${w.misconceptions.length ? ` | błędy: ${w.misconceptions.slice(0, 2).join("; ")}` : ""}`);
    }
  }
  return lines.filter(Boolean).join("\n");
}

async function sourceTitle(db: Db, id: string | null): Promise<string> {
  if (!id) return "bez źródła";
  const [s] = await db.select({ title: sources.title, isPrivate: sources.isPrivate }).from(sources).where(eq(sources.id, id));
  // Private sources are not disclosed to the model; only their existence.
  return s ? (s.isPrivate ? "źródło prywatne" : s.title) : "bez źródła";
}

/** Data from the knowledge base about the session topic, with reliability tags. */
export async function topicContext(db: Db, type: ChatTopicType | null, id: string | null): Promise<{ label: string | null; text: string | null }> {
  if (!type || !id) return { label: null, text: null };
  if (type === "ingredient") {
    const [ing] = await db.select().from(ingredients).where(eq(ingredients.id, id));
    if (!ing) return { label: null, text: null };
    const props = await db.select().from(ingredientProperties).where(eq(ingredientProperties.ingredientId, id)).orderBy(asc(ingredientProperties.aspect));
    const lines = [
      `TEMAT: składnik „${ing.namePl}”${ing.nameOriginal ? ` (${ing.nameOriginal}${ing.transliteration ? `, ${ing.transliteration}` : ""})` : ""} ${STATUS_TAG[ing.status]}`,
      ing.description ? `Opis: ${ing.description}` : null,
    ];
    for (const p of props) lines.push(`- ${ASPECT_LABELS[p.aspect]} ${STATUS_TAG[p.status]} (${await sourceTitle(db, p.sourceId)}): ${p.content}`);
    if (props.length === 0) lines.push("Baza nie zawiera jeszcze opisanych właściwości tego składnika.");
    return { label: ing.namePl, text: lines.filter(Boolean).join("\n") };
  }
  if (type === "menu_item") {
    const [row] = await db
      .select({ item: menuItems, tier: menuCategories.tier, kind: menuCategories.kind })
      .from(menuItems)
      .innerJoin(menuCategories, eq(menuCategories.id, menuItems.menuCategoryId))
      .where(eq(menuItems.id, id));
    if (!row) return { label: null, text: null };
    const comps = await db.select().from(menuItemComponents).where(eq(menuItemComponents.menuItemId, id)).orderBy(asc(menuItemComponents.sortOrder));
    const it = row.item;
    const lines = [
      `TEMAT: pozycja karty KOKU „${it.name}” — ${TIER_LABELS[row.tier]}, ${KIND_LABELS[row.kind]} ${STATUS_TAG[it.status]} (${await sourceTitle(db, it.sourceId)})`,
      it.portion ? `Porcja: ${it.portion}` : null,
      comps.length
        ? `Skład wg źródła: ${comps.map((c) => `${c.label} (${COMPONENT_ROLE_LABELS[c.role]}) ${STATUS_TAG[c.status]}`).join(", ")}`
        : "Skład: brak danych w bazie.",
      it.componentsComplete ? "Skład oznaczony jako kompletny." : "UWAGA: skład NIEPEŁNY — znane są tylko składniki wymienione wyżej. Nie uzupełniaj braków jako faktów o KOKU.",
      it.technique ? `Technika: ${it.technique}` : null,
      it.texture ? `Tekstura: ${it.texture}` : null,
      it.flavor ? `Smak: ${it.flavor}` : null,
    ];
    return { label: it.name, text: lines.filter(Boolean).join("\n") };
  }
  if (type === "technique") {
    const [t] = await db.select().from(techniques).where(eq(techniques.id, id));
    if (!t) return { label: null, text: null };
    return {
      label: t.name,
      text: [`TEMAT: technika „${t.name}” ${STATUS_TAG[t.status]} (${await sourceTitle(db, t.sourceId)})`, t.description ? `Opis w bazie: ${t.description}` : "Brak opisu w bazie."].join("\n"),
    };
  }
  const [cat] = await db.select().from(knowledgeCategories).where(eq(knowledgeCategories.slug, id));
  if (!cat) return { label: null, text: null };
  const names = await db.select({ name: ingredients.namePl }).from(ingredients).where(eq(ingredients.categoryId, cat.id)).limit(40);
  return {
    label: cat.name,
    text: [`TEMAT: kategoria wiedzy „${cat.name}”.`, names.length ? `Składniki tej kategorii w bazie: ${names.map((n) => n.name).join(", ")}.` : null].filter(Boolean).join("\n"),
  };
}

/** Keeps the newest messages that fit in the character budget; merges same-role neighbours. */
export function trimHistory(
  history: { role: "user" | "assistant"; content: string }[],
  budgetChars: number,
): { role: "user" | "assistant"; content: string }[] {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  let used = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i]!;
    if (used + m.content.length > budgetChars && out.length > 0) break;
    used += m.content.length;
    out.unshift(m);
  }
  // The API needs alternating roles starting with "user".
  const merged: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of out) {
    const last = merged.at(-1);
    if (last && last.role === m.role) last.content += `\n\n${m.content}`;
    else merged.push({ ...m });
  }
  while (merged[0]?.role === "assistant") merged.shift();
  return merged;
}
