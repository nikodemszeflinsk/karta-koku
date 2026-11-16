import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import type { IngredientDetail, MenuItemDetail, MenuItemSummary, MenuVersion, NoteRow, RecipeDetail, SearchHit, SourceRow } from "../src/shared/knowledge";
import { api, createUserWithRole, loginCookie, OWNER, setupOwner } from "./helpers";

let owner = "";
let learner = "";
let trainer = "";

const json = async <T>(res: Response | Promise<Response>): Promise<T> => (await res).json() as Promise<T>;

beforeAll(async () => {
  await setupOwner();
  owner = await loginCookie(OWNER.email, OWNER.password);
  await createUserWithRole("learner2@example.test", "learner password 123", "learner");
  learner = await loginCookie("learner2@example.test", "learner password 123");
  await createUserWithRole("trainer@example.test", "trainer password 123", "trainer");
  trainer = await loginCookie("trainer@example.test", "trainer password 123");
});

describe("KOKU public materials import", () => {
  it("imports one current menu version with tiers kept separate", async () => {
    const { versions } = await json<{ versions: MenuVersion[] }>(api("/api/menu/versions", { cookie: learner }));
    expect(versions).toHaveLength(1);
    expect(versions[0]!.isCurrent).toBe(true);
    expect(versions[0]!.itemCount).toBe(37);

    const { items } = await json<{ items: MenuItemSummary[] }>(api(`/api/menu/versions/${versions[0]!.id}/items`, { cookie: learner }));
    const byTier = (t: string) => items.filter((i) => i.tier === t);
    expect(byTier("premium")).toHaveLength(12);
    expect(byTier("seasonal")).toHaveLength(9);
    expect(byTier("promo")).toHaveLength(15);
    expect(byTier("standard")).toHaveLength(1);
    // Nothing is presented as confirmed or complete.
    expect(items.every((i) => i.status === "needs_verification" && !i.componentsComplete)).toBe(true);
    expect(byTier("promo").every((i) => i.currencyStatus === "to_check")).toBe(true);
  });

  it("keeps components verbatim and imports no allergens", async () => {
    const d = await json<MenuItemDetail>(api("/api/menu/items/mi_jz26_futomaki_losos_miso", { cookie: learner }));
    expect(d.components.map((c) => c.label)).toEqual(["ogórek", "tykwa", "jabłko w tempurze", "serek", "majonez", "sos dyniowy"]);
    expect(d.priceGrosze).toBe(3100);
    expect(d.source?.type).toBe("official_material");
    const n = await env.DB.prepare("SELECT count(*) AS n FROM menu_item_allergens").first<{ n: number }>();
    expect(n?.n).toBe(0);
  });
});

describe("search (FTS5)", () => {
  it("folds Polish diacritics and matches prefixes", async () => {
    const { results } = await json<{ results: SearchHit[] }>(api("/api/search?q=lososiem%20miso", { cookie: learner }));
    expect(results.map((r) => r.id)).toContain("mi_jz26_futomaki_losos_miso");
    const r2 = await json<{ results: SearchHit[] }>(api("/api/search?q=dyni", { cookie: learner }));
    expect(r2.results.map((r) => r.id)).toContain("mi_jz26_krem_dyniowy");
  });

  it("treats FTS operators in the query as plain text", async () => {
    for (const q of ['" OR *', "NEAR(a b)", "a:b -c", "*"]) {
      const res = await api(`/api/search?q=${encodeURIComponent(q)}`, { cookie: learner });
      expect([200, 400]).toContain(res.status);
    }
  });

  it("validates the query", async () => {
    expect((await api("/api/search?q=a", { cookie: learner })).status).toBe(400);
  });
});

describe("ingredients, statuses and versioning", () => {
  let ingId = "";
  let aiSource = "";
  const officialSource = "src_koku_wkladka_jz_2026";

  it("lets learners read but not write shared knowledge", async () => {
    expect((await api("/api/ingredients", { cookie: learner })).status).toBe(200);
    const res = await api("/api/ingredients", { cookie: learner, body: { namePl: "Nori" } });
    expect(res.status).toBe(403);
  });

  it("creates an ingredient (editor) and rejects case-insensitive duplicates", async () => {
    const res = await api("/api/ingredients", {
      cookie: trainer,
      body: { namePl: "Ryż do sushi", nameOriginal: "寿司米", transliteration: "sushi-mai", categorySlug: "ryz", status: "general_knowledge" },
    });
    expect(res.status).toBe(201);
    ingId = ((await res.json()) as { id: string }).id;
    const dup = await api("/api/ingredients", { cookie: owner, body: { namePl: "RYZ DO SUSHI" } });
    expect(dup.status).toBe(409);
  });

  it("refuses 'confirmed' without a confirming source", async () => {
    const noSource = await api(`/api/ingredients/${ingId}/properties`, {
      cookie: owner,
      body: { aspect: "texture", content: "x", status: "confirmed" },
    });
    expect(noSource.status).toBe(400);

    const src = await api("/api/sources", { cookie: owner, body: { type: "ai_draft", title: "Szkic AI testowy" } });
    aiSource = ((await src.json()) as { id: string }).id;
    const aiConfirmed = await api(`/api/ingredients/${ingId}/properties`, {
      cookie: owner,
      body: { aspect: "texture", content: "x", status: "confirmed", sourceId: aiSource },
    });
    expect(aiConfirmed.status).toBe(400);

    const ok = await api(`/api/ingredients/${ingId}/properties`, {
      cookie: owner,
      body: { aspect: "usage", content: "Opis z materiału oficjalnego", status: "confirmed", sourceId: officialSource },
    });
    expect(ok.status).toBe(201);
  });

  it("uses optimistic locking and records revisions", async () => {
    const d1 = await json<IngredientDetail>(api(`/api/ingredients/${ingId}`, { cookie: learner }));
    expect(d1.version).toBe(1);
    expect(d1.properties[0]?.source?.id).toBe(officialSource);

    const upd = await api(`/api/ingredients/${ingId}`, { method: "PATCH", cookie: owner, body: { expectedVersion: 1, origin: "Japonia" } });
    expect(upd.status).toBe(200);
    expect(((await upd.json()) as IngredientDetail).version).toBe(2);

    const stale = await api(`/api/ingredients/${ingId}`, { method: "PATCH", cookie: owner, body: { expectedVersion: 1, origin: "X" } });
    expect(stale.status).toBe(409);

    const { revisions } = await json<{ revisions: { entityType: string; version: number; snapshot: { origin: string | null } }[] }>(
      api(`/api/ingredients/${ingId}/revisions`, { cookie: owner }),
    );
    const ingRev = revisions.find((r) => r.entityType === "ingredient");
    expect(ingRev?.version).toBe(1);
    expect(ingRev?.snapshot.origin).toBeNull();
  });

  it("indexes properties for search", async () => {
    const { results } = await json<{ results: SearchHit[] }>(api("/api/search?q=oficjalnego", { cookie: learner }));
    expect(results.map((r) => r.id)).toContain(ingId);
  });

  it("validates allergens and substitutes", async () => {
    expect((await api(`/api/ingredients/${ingId}/allergens`, { method: "PUT", cookie: owner, body: { allergens: [{ allergenId: "nope" }] } })).status).toBe(400);
    const ok = await api(`/api/ingredients/${ingId}/allergens`, {
      method: "PUT",
      cookie: owner,
      body: { allergens: [{ allergenId: "gluten", status: "unknown" }] },
    });
    expect(ok.status).toBe(200);
    expect((await api(`/api/ingredients/${ingId}/substitutes`, { cookie: owner, body: { substituteId: ingId } })).status).toBe(400);
  });

  it("refuses to delete a source that is in use", async () => {
    await api(`/api/ingredients/${ingId}`, { method: "PATCH", cookie: owner, body: { expectedVersion: 2, sourceId: aiSource } });
    const del = await api(`/api/sources/${aiSource}`, { method: "DELETE", cookie: owner });
    expect(del.status).toBe(409);
  });
});

describe("menu editing", () => {
  it("creates an item, replaces components and blocks learners", async () => {
    const [v] = (await json<{ versions: MenuVersion[] }>(api("/api/menu/versions", { cookie: owner }))).versions;
    const res = await api("/api/menu/items", {
      cookie: owner,
      body: { menuVersionId: v!.id, tier: "standard", kind: "nigiri", name: "Nigiri testowe", status: "unknown" },
    });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const put = await api(`/api/menu/items/${id}/components`, {
      method: "PUT",
      cookie: owner,
      body: { components: [{ label: "ryż", role: "component" }, { label: "łosoś" }] },
    });
    expect(put.status).toBe(200);
    expect(((await put.json()) as MenuItemDetail).components.map((c) => c.label)).toEqual(["ryż", "łosoś"]);
    expect((await api(`/api/menu/items/${id}`, { method: "DELETE", cookie: learner })).status).toBe(403);
  });
});

describe("private data: recipes, notes, private sources", () => {
  let recipeA = "";
  let recipeB = "";

  it("keeps recipes private to their owner", async () => {
    const res = await api("/api/recipes", {
      cookie: owner,
      body: { name: "Tajny sos dyniowy", method: "SEKRETNA-METODA 40 g cukru", description: "opis sosu", confidential: true },
    });
    expect(res.status).toBe(201);
    recipeA = ((await res.json()) as { id: string }).id;

    expect((await api(`/api/recipes/${recipeA}`, { cookie: learner })).status).toBe(404);
    expect((await json<{ recipes: unknown[] }>(api("/api/recipes", { cookie: learner }))).recipes).toHaveLength(0);
    expect((await api(`/api/recipes/${recipeA}`, { method: "PATCH", cookie: learner, body: { expectedVersion: 1, name: "x" } })).status).toBe(404);
    expect((await api(`/api/recipes/${recipeA}`, { method: "DELETE", cookie: learner })).status).toBe(404);
  });

  it("never indexes confidential recipe content and hides it from others' search", async () => {
    const mine = await json<{ results: SearchHit[] }>(api("/api/search?q=tajny", { cookie: owner }));
    expect(mine.results.map((r) => r.id)).toContain(recipeA);
    const theirs = await json<{ results: SearchHit[] }>(api("/api/search?q=tajny", { cookie: learner }));
    expect(theirs.results.map((r) => r.id)).not.toContain(recipeA);
    const method = await json<{ results: SearchHit[] }>(api("/api/search?q=SEKRETNA", { cookie: owner }));
    expect(method.results).toHaveLength(0);
  });

  it("prevents recipe component cycles", async () => {
    recipeB = ((await (await api("/api/recipes", { cookie: owner, body: { name: "Baza B" } })).json()) as { id: string }).id;
    const ab = await api(`/api/recipes/${recipeA}/lines`, { method: "PUT", cookie: owner, body: { ingredients: [{ label: "dynia", amount: 200, unit: "g" }], components: [{ childRecipeId: recipeB }] } });
    expect(ab.status).toBe(200);
    expect(((await ab.json()) as RecipeDetail).components[0]?.childName).toBe("Baza B");
    const ba = await api(`/api/recipes/${recipeB}/lines`, { method: "PUT", cookie: owner, body: { ingredients: [], components: [{ childRecipeId: recipeA }] } });
    expect(ba.status).toBe(400);
    const self = await api(`/api/recipes/${recipeA}/lines`, { method: "PUT", cookie: owner, body: { ingredients: [], components: [{ childRecipeId: recipeA }] } });
    expect(self.status).toBe(400);
  });

  it("keeps notes private and validates links", async () => {
    const res = await api("/api/notes", {
      cookie: owner,
      body: {
        kind: "work_question",
        title: "Dlaczego ryż twardnieje w lodówce",
        body: "retrogradacja?",
        links: [
          { targetType: "category", targetId: "ryz" },
          { targetType: "menu_item", targetId: "mi_jz26_krem_dyniowy" },
          { targetType: "recipe", targetId: recipeA },
        ],
      },
    });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };

    const note = await json<NoteRow>(api(`/api/notes/${id}`, { cookie: owner }));
    expect(note.links.map((l) => l.label).sort()).toEqual(["Krem dyniowy yellow curry", "Ryż i jego technologia", "Tajny sos dyniowy"]);

    expect((await api(`/api/notes/${id}`, { cookie: learner })).status).toBe(404);
    expect((await api(`/api/notes/${id}`, { method: "PATCH", cookie: learner, body: { title: "x" } })).status).toBe(404);
    expect((await api(`/api/notes/${id}`, { method: "DELETE", cookie: learner })).status).toBe(404);

    // A learner cannot link someone else's recipe.
    const foreign = await api("/api/notes", {
      cookie: learner,
      body: { kind: "observation", title: "x", links: [{ targetType: "recipe", targetId: recipeA }] },
    });
    expect(foreign.status).toBe(400);

    const search = await json<{ results: SearchHit[] }>(api("/api/search?q=retrogradacja", { cookie: learner }));
    expect(search.results).toHaveLength(0);
    const own = await json<{ results: SearchHit[] }>(api("/api/search?q=retrogradacja", { cookie: owner }));
    expect(own.results.map((r) => r.id)).toContain(id);

    const resolved = await api(`/api/notes/${id}`, { method: "PATCH", cookie: owner, body: { resolved: true } });
    expect(((await resolved.json()) as NoteRow).resolved).toBe(true);
  });

  it("keeps private sources private and only lets learners create private ones", async () => {
    expect((await api("/api/sources", { cookie: learner, body: { type: "web", title: "Publiczne", isPrivate: false } })).status).toBe(403);
    const res = await api("/api/sources", { cookie: learner, body: { type: "own_observation", title: "Moja obserwacja", isPrivate: true } });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const ownerList = await json<{ sources: SourceRow[] }>(api("/api/sources", { cookie: owner }));
    expect(ownerList.sources.map((s) => s.id)).not.toContain(id);
    // The owner cannot reference a source they cannot see.
    const r = await api("/api/recipes", { cookie: owner, body: { name: "Z cudzym źródłem", sourceId: id } });
    expect(r.status).toBe(400);
  });
});
