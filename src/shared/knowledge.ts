import { z } from "zod";

// Keep these lists in sync with src/worker/db/schema.ts (asserted in tests).
export const VERIFICATION_STATUSES = ["confirmed", "general_knowledge", "needs_verification", "unknown"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
export const STATUS_LABELS: Record<VerificationStatus, string> = {
  confirmed: "Potwierdzone",
  general_knowledge: "Wiedza ogólna",
  needs_verification: "Do weryfikacji",
  unknown: "Brak informacji",
};
export const STATUS_HINTS: Record<VerificationStatus, string> = {
  confirmed: "Potwierdzone materiałem użytkownika lub oficjalnym materiałem — wymaga źródła.",
  general_knowledge: "Ogólna wiedza kulinarna, nie dotyczy konkretnej receptury lokalu.",
  needs_verification: "Informacja niepewna, do sprawdzenia.",
  unknown: "Brak informacji.",
};

export const SOURCE_TYPES = ["user_material", "official_material", "literature", "web", "own_observation", "ai_draft"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  user_material: "Materiał użytkownika",
  official_material: "Materiał oficjalny (KOKU)",
  literature: "Literatura",
  web: "Strona internetowa",
  own_observation: "Własna obserwacja",
  ai_draft: "Szkic AI",
};
/** Source types that can back a "confirmed" status. */
export const CONFIRMING_SOURCE_TYPES: readonly SourceType[] = ["user_material", "official_material"];

export const INGREDIENT_ASPECTS = [
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
] as const;
export type IngredientAspect = (typeof INGREDIENT_ASPECTS)[number];
export const ASPECT_LABELS: Record<IngredientAspect, string> = {
  composition: "Skład i charakterystyka",
  physical: "Właściwości fizyczne",
  chemical: "Właściwości chemiczne",
  taste_aroma: "Smak i aromat",
  texture: "Tekstura",
  usage: "Zastosowanie kulinarne",
  heating: "Zachowanie podczas podgrzewania",
  cooling: "Zachowanie podczas chłodzenia",
  structure_effect: "Wpływ na strukturę potrawy",
  common_errors: "Typowe błędy",
  storage: "Przechowywanie",
};

export const MENU_TIERS = ["standard", "premium", "seasonal", "promo"] as const;
export type MenuTier = (typeof MENU_TIERS)[number];
export const TIER_LABELS: Record<MenuTier, string> = {
  standard: "Karta standardowa",
  premium: "Karta premium",
  seasonal: "Wkładki sezonowe",
  promo: "Promocje",
};

export const MENU_KINDS = [
  "futomaki",
  "uramaki",
  "hosomaki",
  "nigiri",
  "sashimi",
  "sets",
  "starters",
  "soups",
  "hot_dishes",
  "desserts",
  "drinks",
  "sides",
  "other",
] as const;
export type MenuKind = (typeof MENU_KINDS)[number];
export const KIND_LABELS: Record<MenuKind, string> = {
  futomaki: "Futomaki",
  uramaki: "Uramaki",
  hosomaki: "Hosomaki",
  nigiri: "Nigiri",
  sashimi: "Sashimi",
  sets: "Zestawy",
  starters: "Przystawki",
  soups: "Zupy",
  hot_dishes: "Dania ciepłe",
  desserts: "Desery",
  drinks: "Napoje",
  sides: "Dodatki",
  other: "Inne rolki i pozycje",
};

export const CURRENCY_STATUSES = ["current", "to_check", "withdrawn"] as const;
export type CurrencyStatus = (typeof CURRENCY_STATUSES)[number];
export const CURRENCY_LABELS: Record<CurrencyStatus, string> = {
  current: "Aktualne",
  to_check: "Aktualność do sprawdzenia",
  withdrawn: "Wycofane",
};

export const COMPONENT_ROLES = ["ingredient", "component", "sauce", "topping", "garnish"] as const;
export type ComponentRole = (typeof COMPONENT_ROLES)[number];
export const COMPONENT_ROLE_LABELS: Record<ComponentRole, string> = {
  ingredient: "Składnik",
  component: "Komponent",
  sauce: "Sos",
  topping: "Posypka",
  garnish: "Dekoracja",
};

export const RECIPE_LINE_ROLES = ["base", "sauce", "topping", "garnish", "other"] as const;
export type RecipeLineRole = (typeof RECIPE_LINE_ROLES)[number];
export const RECIPE_LINE_ROLE_LABELS: Record<RecipeLineRole, string> = {
  base: "Baza",
  sauce: "Sos",
  topping: "Posypka",
  garnish: "Dekoracja",
  other: "Inne",
};

export const NOTE_KINDS = ["work_question", "unknown_ingredient", "observation", "recipe_fragment", "to_clarify", "problem"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];
export const NOTE_KIND_LABELS: Record<NoteKind, string> = {
  work_question: "Trudne pytanie z pracy",
  unknown_ingredient: "Nieznany składnik",
  observation: "Własna obserwacja",
  recipe_fragment: "Fragment receptury",
  to_clarify: "Do wyjaśnienia",
  problem: "Błąd / problem technologiczny",
};

export const NOTE_TARGETS = ["ingredient", "menu_item", "technique", "category", "recipe"] as const;
export type NoteTarget = (typeof NOTE_TARGETS)[number];
export const NOTE_TARGET_LABELS: Record<NoteTarget, string> = {
  ingredient: "Składnik",
  menu_item: "Danie",
  technique: "Technika",
  category: "Kategoria",
  recipe: "Receptura",
};

export const SEARCH_TYPES = ["ingredient", "technique", "menu_item", "recipe", "note", "source", "lesson", "question"] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

// ---------------------------------------------------------------------------
// Input schemas (validated on the server, reused by forms)
// ---------------------------------------------------------------------------

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === "" ? null : v));
const id = z.string().min(1).max(100);

const provenance = {
  status: z.enum(VERIFICATION_STATUSES).default("needs_verification"),
  sourceId: id.nullable().optional(),
};

export const sourceInputSchema = z.object({
  type: z.enum(SOURCE_TYPES),
  title: z.string().trim().min(2, "Tytuł: min. 2 znaki").max(200),
  reference: optText(500),
  notes: optText(2000),
  retrievedAt: z.iso.date().nullable().optional(),
  isPrivate: z.boolean().default(false),
});

export const ingredientInputSchema = z.object({
  namePl: z.string().trim().min(1, "Podaj nazwę").max(120),
  nameOriginal: optText(120),
  transliteration: optText(120),
  categorySlug: z.string().max(60).nullable().optional(),
  origin: optText(300),
  description: optText(5000),
  ...provenance,
});
export const ingredientUpdateSchema = ingredientInputSchema.partial().extend({ expectedVersion: z.number().int().positive() });

export const propertyInputSchema = z.object({
  aspect: z.enum(INGREDIENT_ASPECTS),
  content: z.string().trim().min(1, "Wpisz treść").max(5000),
  ...provenance,
});
export const propertyUpdateSchema = propertyInputSchema.partial().extend({ expectedVersion: z.number().int().positive() });

export const substituteInputSchema = z.object({
  substituteId: id,
  context: optText(1000),
  consequences: optText(3000),
  ...provenance,
});

export const allergenSetSchema = z.object({
  allergens: z
    .array(z.object({ allergenId: z.string().max(40), ...provenance }))
    .max(14),
});

export const techniqueInputSchema = z.object({
  name: z.string().trim().min(1, "Podaj nazwę").max(120),
  categorySlug: z.string().max(60).nullable().optional(),
  description: optText(5000),
  ...provenance,
});
export const techniqueUpdateSchema = techniqueInputSchema.partial().extend({ expectedVersion: z.number().int().positive() });

export const menuVersionInputSchema = z.object({
  label: z.string().trim().min(2).max(120),
  validFrom: z.iso.date().nullable().optional(),
  validTo: z.iso.date().nullable().optional(),
  isCurrent: z.boolean().default(false),
  notes: optText(2000),
});

export const menuItemInputSchema = z.object({
  menuVersionId: id,
  tier: z.enum(MENU_TIERS),
  kind: z.enum(MENU_KINDS),
  code: optText(20),
  name: z.string().trim().min(1, "Podaj nazwę").max(160),
  description: optText(3000),
  technique: optText(3000),
  texture: optText(1000),
  flavor: optText(1000),
  portion: optText(40),
  priceGrosze: z.number().int().min(0).max(1_000_000).nullable().optional(),
  componentsComplete: z.boolean().default(false),
  currencyStatus: z.enum(CURRENCY_STATUSES).default("to_check"),
  ...provenance,
});
export const menuItemUpdateSchema = menuItemInputSchema
  .omit({ menuVersionId: true })
  .partial()
  .extend({ expectedVersion: z.number().int().positive() });

export const menuComponentsSchema = z.object({
  components: z
    .array(
      z.object({
        role: z.enum(COMPONENT_ROLES).default("ingredient"),
        label: z.string().trim().min(1).max(160),
        ingredientId: id.nullable().optional(),
        status: z.enum(VERIFICATION_STATUSES).default("needs_verification"),
      }),
    )
    .max(60),
});

export const recipeInputSchema = z.object({
  name: z.string().trim().min(1, "Podaj nazwę").max(160),
  description: optText(3000),
  yieldText: optText(120),
  method: optText(20000),
  confidential: z.boolean().default(true),
  ...provenance,
});
export const recipeUpdateSchema = recipeInputSchema.partial().extend({ expectedVersion: z.number().int().positive() });

export const recipeLinesSchema = z.object({
  ingredients: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(160),
        ingredientId: id.nullable().optional(),
        amount: z.number().positive().max(1_000_000).nullable().optional(),
        unit: optText(20),
        role: z.enum(RECIPE_LINE_ROLES).default("base"),
        note: optText(300),
      }),
    )
    .max(100),
  components: z
    .array(
      z.object({
        childRecipeId: id,
        amount: z.number().positive().max(1_000_000).nullable().optional(),
        unit: optText(20),
      }),
    )
    .max(30),
});

const noteLinkSchema = z.object({ targetType: z.enum(NOTE_TARGETS), targetId: id });
export const noteInputSchema = z.object({
  kind: z.enum(NOTE_KINDS),
  title: z.string().trim().min(1, "Podaj tytuł").max(200),
  body: z.string().max(20000).default(""),
  resolved: z.boolean().default(false),
  links: z.array(noteLinkSchema).max(20).default([]),
});
export const noteUpdateSchema = noteInputSchema.partial();

export const searchQuerySchema = z.object({
  q: z.string().trim().min(2, "Wpisz min. 2 znaki").max(100),
  types: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").filter((t): t is SearchType => (SEARCH_TYPES as readonly string[]).includes(t)) : [])),
});

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

export interface Provenance {
  status: VerificationStatus;
  source: SourceSummary | null;
}
export interface SourceSummary {
  id: string;
  type: SourceType;
  title: string;
}
export interface SourceRow extends SourceSummary {
  reference: string | null;
  notes: string | null;
  retrievedAt: string | null;
  isPrivate: boolean;
  isMine: boolean;
  usageCount: number;
}
export interface IngredientListItem {
  id: string;
  namePl: string;
  nameOriginal: string | null;
  categorySlug: string | null;
  categoryName: string | null;
  status: VerificationStatus;
  propertyCount: number;
}
export interface IngredientProperty extends Provenance {
  id: string;
  aspect: IngredientAspect;
  content: string;
  version: number;
  updatedAt: string;
}
export interface IngredientDetail extends Provenance {
  id: string;
  namePl: string;
  nameOriginal: string | null;
  transliteration: string | null;
  categorySlug: string | null;
  categoryName: string | null;
  origin: string | null;
  description: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  properties: IngredientProperty[];
  allergens: (Provenance & { allergenId: string; name: string })[];
  substitutes: (Provenance & { id: string; substituteId: string; substituteName: string; context: string | null; consequences: string | null })[];
  usedIn: { menuItemId: string; name: string; tier: MenuTier }[];
}
export interface TechniqueRow extends Provenance {
  id: string;
  name: string;
  categorySlug: string | null;
  categoryName: string | null;
  description: string | null;
  version: number;
}
export interface Allergen {
  id: string;
  namePl: string;
}
export interface MenuVersion {
  id: string;
  label: string;
  validFrom: string | null;
  validTo: string | null;
  isCurrent: boolean;
  notes: string | null;
  itemCount: number;
}
export interface MenuItemSummary {
  id: string;
  tier: MenuTier;
  kind: MenuKind;
  code: string | null;
  name: string;
  portion: string | null;
  priceGrosze: number | null;
  status: VerificationStatus;
  currencyStatus: CurrencyStatus;
  componentsComplete: boolean;
  componentLabels: string[];
}
export interface MenuItemDetail extends Omit<MenuItemSummary, "componentLabels">, Provenance {
  menuVersionId: string;
  menuVersionLabel: string;
  description: string | null;
  technique: string | null;
  texture: string | null;
  flavor: string | null;
  version: number;
  updatedAt: string;
  components: { id: string; role: ComponentRole; label: string; ingredientId: string | null; ingredientName: string | null; status: VerificationStatus }[];
  allergens: (Provenance & { allergenId: string; name: string })[];
}
export interface RecipeSummary {
  id: string;
  name: string;
  confidential: boolean;
  status: VerificationStatus;
  updatedAt: string;
}
export interface RecipeDetail extends Provenance {
  id: string;
  name: string;
  description: string | null;
  yieldText: string | null;
  method: string | null;
  confidential: boolean;
  version: number;
  updatedAt: string;
  ingredients: { id: string; label: string; ingredientId: string | null; ingredientName: string | null; amount: number | null; unit: string | null; role: RecipeLineRole; note: string | null }[];
  components: { id: string; childRecipeId: string; childName: string; amount: number | null; unit: string | null }[];
}
export interface NoteRow {
  id: string;
  kind: NoteKind;
  title: string;
  body: string;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
  links: { targetType: NoteTarget; targetId: string; label: string }[];
}
export interface SearchHit {
  type: SearchType;
  id: string;
  title: string;
  snippet: string;
}
export interface Revision {
  version: number;
  changedAt: string;
  changedBy: string | null;
  snapshot: Record<string, unknown>;
}
