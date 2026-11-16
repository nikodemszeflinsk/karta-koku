import { asc, eq } from "drizzle-orm";
import type { Category, Level } from "../../../shared/schemas";
import type { Db } from "../../db/client";
import { competencies, knowledgeCategories, levels } from "../../db/schema";

export async function listCategories(db: Db): Promise<Category[]> {
  return db
    .select({
      slug: knowledgeCategories.slug,
      name: knowledgeCategories.name,
      description: knowledgeCategories.description,
      sortOrder: knowledgeCategories.sortOrder,
    })
    .from(knowledgeCategories)
    .orderBy(asc(knowledgeCategories.sortOrder));
}

export async function listLevels(db: Db): Promise<Level[]> {
  const rows = await db
    .select({
      levelId: levels.id,
      key: levels.key,
      name: levels.name,
      description: levels.description,
      sortOrder: levels.sortOrder,
      masteryThreshold: levels.masteryThreshold,
      minEvidence: levels.minEvidence,
      cKey: competencies.key,
      cName: competencies.name,
      cDescription: competencies.description,
    })
    .from(levels)
    .leftJoin(competencies, eq(competencies.levelId, levels.id))
    .orderBy(asc(levels.sortOrder), asc(competencies.sortOrder));

  const byKey = new Map<string, Level>();
  for (const r of rows) {
    let level = byKey.get(r.key);
    if (!level) {
      level = {
        key: r.key,
        name: r.name,
        description: r.description,
        sortOrder: r.sortOrder,
        masteryThreshold: r.masteryThreshold,
        minEvidence: r.minEvidence,
        competencies: [],
      };
      byKey.set(r.key, level);
    }
    if (r.cKey && r.cName) level.competencies.push({ key: r.cKey, name: r.cName, description: r.cDescription });
  }
  return [...byKey.values()];
}
