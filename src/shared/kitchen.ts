import { z } from "zod";

/* Kitchen operations: shopping list, wholesale order, shift handover, HACCP log. */

export const STOCK_LISTS = ["shopping", "wholesale"] as const;
export type StockList = (typeof STOCK_LISTS)[number];
export const STOCK_LIST_LABELS: Record<StockList, string> = { shopping: "Lista zakupów", wholesale: "Zamówienie z hurtowni" };

export const SHIFTS = ["morning", "evening"] as const;
export type Shift = (typeof SHIFTS)[number];
export const SHIFT_LABELS: Record<Shift, string> = { morning: "Zmiana poranna", evening: "Zmiana wieczorna" };

export const COLD_UNIT_KINDS = ["fridge", "freezer"] as const;
export type ColdUnitKind = (typeof COLD_UNIT_KINDS)[number];
export const COLD_UNIT_LABELS: Record<ColdUnitKind, string> = { fridge: "Lodówka / chłodnia", freezer: "Zamrażarka / mroźnia" };
/** Starting ranges only — the owner sets the real limits from the restaurant's HACCP plan. */
export const DEFAULT_RANGES: Record<ColdUnitKind, { minC: number; maxC: number }> = {
  fridge: { minC: 0, maxC: 4 },
  freezer: { minC: -25, maxC: -18 },
};

/** Unit meaning "no number — type a free-text description instead". */
export const TEXT_UNIT = "opis";
export const isTextUnit = (unit: string) => unit.trim().toLowerCase() === TEXT_UNIT;
export const UNIT_SUGGESTIONS = ["szt.", "kg", "g", "l", "opak.", "karton", "worek", "butelka", TEXT_UNIT];

const qty = z.number().min(0).max(100000).nullable();
const name = z.string().trim().min(1, "Podaj nazwę").max(120);

export const stockItemInputSchema = z.object({
  name,
  unit: z.string().trim().max(20).default("szt."),
  groupName: z.string().trim().max(60).default(""),
  parQty: qty.optional().default(null),
});
export const stockItemUpdateSchema = stockItemInputSchema.partial().extend({ sortOrder: z.number().int().min(0).max(100000).optional() });
export const stockImportSchema = z.object({ text: z.string().max(50000) });
export const stockLineSchema = z.object({ qtyHave: qty.optional(), qtyOrder: qty.optional(), note: z.string().trim().max(300).optional() });

export const handoverInputSchema = z
  .object({
    shiftDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Nieprawidłowa data"),
    shift: z.enum(SHIFTS),
    prep: z.array(z.object({ label: z.string().trim().min(1).max(120), done: z.boolean() })).max(60),
    prepNotes: z.string().trim().max(4000).default(""),
    shortages: z.array(z.object({ menuItemId: z.string().max(100).nullable(), name: z.string().trim().min(1).max(160) })).max(200),
    shortagesNote: z.string().trim().max(4000).default(""),
    hasFailure: z.boolean().default(false),
    failureNote: z.string().trim().max(4000).default(""),
  })
  .refine((v) => !v.hasFailure || v.failureNote.length > 0, { path: ["failureNote"], message: "Opisz awarię" });
export const handoverChecksSchema = z.object({ labels: z.array(z.string().trim().min(1).max(120)).max(60) });

export const coldUnitInputSchema = z
  .object({ name, kind: z.enum(COLD_UNIT_KINDS), minC: z.number().min(-60).max(30), maxC: z.number().min(-60).max(30) })
  .refine((v) => v.minC <= v.maxC, { path: ["maxC"], message: "Górna granica musi być ≥ dolnej" });
export const coldUnitUpdateSchema = z.object({
  name: name.optional(),
  kind: z.enum(COLD_UNIT_KINDS).optional(),
  minC: z.number().min(-60).max(30).optional(),
  maxC: z.number().min(-60).max(30).optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
});
export const haccpEntrySchema = z.object({
  readings: z
    .array(z.object({ unitId: z.string().max(100), tempC: z.number().min(-60).max(60), correctiveAction: z.string().trim().max(2000).default("") }))
    .max(100),
  pest: z.object({ found: z.boolean(), notes: z.string().trim().max(2000).default(""), action: z.string().trim().max(2000).default("") }).nullable(),
});

export interface StockItem {
  id: string;
  name: string;
  unit: string;
  groupName: string;
  parQty: number | null;
  sortOrder: number;
}
export interface StockLine {
  itemId: string;
  qtyHave: number | null;
  qtyOrder: number | null;
  note: string;
}
export interface StockSheetSummaryLine {
  name: string;
  unit: string;
  groupName: string;
  qtyHave: number | null;
  parQty: number | null;
  qty: number;
  /** Absent in sheets closed before descriptions existed. */
  note?: string;
}
export interface StockSheetHistory {
  id: string;
  closedAt: string;
  closedByName: string | null;
  lines: StockSheetSummaryLine[];
}
export interface StockResponse {
  list: StockList;
  items: StockItem[];
  sheetId: string | null;
  updatedAt: string | null;
  lines: StockLine[];
}

export interface HandoverRow {
  id: string;
  shiftDate: string;
  shift: Shift;
  authorName: string | null;
  authorId: string | null;
  prep: { label: string; done: boolean }[];
  prepNotes: string;
  shortages: { menuItemId: string | null; name: string }[];
  shortagesNote: string;
  hasFailure: boolean;
  failureNote: string;
  acknowledgedByName: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
}

export interface ColdUnit {
  id: string;
  name: string;
  kind: ColdUnitKind;
  minC: number;
  maxC: number;
  sortOrder: number;
}
export interface TemperatureRow {
  id: string;
  unitId: string;
  unitName: string;
  tempC: number;
  minC: number;
  maxC: number;
  inRange: boolean;
  correctiveAction: string;
  measuredAt: string;
  authorName: string | null;
}
export interface PestRow {
  id: string;
  found: boolean;
  notes: string;
  action: string;
  checkedAt: string;
  authorName: string | null;
}

export interface KitchenSummary {
  shopping: { items: number; toBuy: number };
  wholesale: { items: number; toOrder: number };
  handover: { last: { shiftDate: string; shift: Shift; hasFailure: boolean; shortages: number; acknowledged: boolean } | null };
  haccp: { units: number; measuredToday: number; pestCheckedToday: boolean; outOfRangeToday: number };
}

/** Quantity to order on the wholesale sheet: manual override, else par − stock (never negative). */
export function orderQty(item: Pick<StockItem, "parQty">, line: Pick<StockLine, "qtyHave" | "qtyOrder"> | undefined): number {
  if (line?.qtyOrder != null) return line.qtyOrder;
  if (item.parQty == null || line?.qtyHave == null) return 0;
  return Math.max(0, Math.round((item.parQty - line.qtyHave) * 1000) / 1000);
}

/** Midnight in Europe/Warsaw for the day containing `d`, as a UTC instant. */
export function warsawDayStart(d: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const wallAsUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  const offset = wallAsUtc - Math.floor(d.getTime() / 1000) * 1000;
  return new Date(Date.UTC(g("year"), g("month") - 1, g("day")) - offset);
}

/** YYYY-MM-DD in Europe/Warsaw. */
export function warsawDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Parses pasted product lines: "nazwa; jednostka; ile powinno być; grupa" (only the name is required). */
export function parseStockImport(text: string): { name: string; unit: string; parQty: number | null; groupName: string }[] {
  const out: { name: string; unit: string; parQty: number | null; groupName: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [n = "", u = "", p = "", g = ""] = line.split(/[;\t]/).map((s) => s.trim());
    if (!n) continue;
    const par = p ? Number(p.replace(",", ".")) : NaN;
    out.push({ name: n.slice(0, 120), unit: (u || "szt.").slice(0, 20), parQty: Number.isFinite(par) && par >= 0 ? par : null, groupName: g.slice(0, 60) });
  }
  return out;
}
