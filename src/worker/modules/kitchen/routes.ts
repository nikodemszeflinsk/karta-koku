import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import {
  coldUnitInputSchema,
  coldUnitUpdateSchema,
  haccpEntrySchema,
  handoverChecksSchema,
  handoverInputSchema,
  isTextUnit,
  orderQty,
  parseStockImport,
  STOCK_LISTS,
  stockImportSchema,
  stockItemInputSchema,
  stockItemUpdateSchema,
  stockLineSchema,
  warsawDayStart,
  type ColdUnit,
  type HandoverRow,
  type KitchenSummary,
  type PestRow,
  type StockItem,
  type StockList,
  type StockResponse,
  type StockSheetHistory,
  type StockSheetSummaryLine,
  type TemperatureRow,
} from "../../../shared/kitchen";
import { GUEST_USER_ID } from "../../../shared/roles";
import { foldText } from "../../../shared/text";
import type { Db } from "../../db/client";
import { coldUnits, handoverChecks, pestChecks, shiftHandovers, stockItems, stockSheetLines, stockSheets, temperatureLogs, users } from "../../db/schema";
import { writeAudit } from "../../lib/audit";
import { HttpError } from "../../lib/errors";
import { iso, notFound, validation } from "../../lib/knowledge";
import { validationHook } from "../../lib/validation";
import { requireAuth, requireRole } from "../../middleware/session";
import type { AppEnv } from "../../types";

/*
 * Every signed-in team member can fill in lists, handovers and HACCP records.
 * Catalogs (products, par levels, fridges, checklist) are managed by owner/admin/trainer.
 * HACCP and handover records are append-only (no edit/delete endpoints).
 */
const requireManager = requireRole("admin", "trainer");

const listParam = z.object({ list: z.enum(STOCK_LISTS) });

async function userNames(db: Db, ids: (string | null)[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (uniq.length === 0) return new Map();
  const rows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, uniq));
  return new Map(rows.map((r) => [r.id, r.name]));
}

async function activeItems(db: Db, list: StockList): Promise<StockItem[]> {
  return db
    .select({ id: stockItems.id, name: stockItems.name, unit: stockItems.unit, groupName: stockItems.groupName, parQty: stockItems.parQty, sortOrder: stockItems.sortOrder })
    .from(stockItems)
    .where(and(eq(stockItems.list, list), eq(stockItems.active, true)))
    .orderBy(asc(stockItems.groupName), asc(stockItems.sortOrder), asc(stockItems.name));
}

async function openSheet(db: Db, list: StockList) {
  const [s] = await db.select().from(stockSheets).where(and(eq(stockSheets.list, list), eq(stockSheets.status, "open")));
  return s ?? null;
}

async function ensureOpenSheet(db: Db, list: StockList, userId: string) {
  const existing = await openSheet(db, list);
  if (existing) return existing;
  // The partial unique index keeps this race-safe: a concurrent insert is ignored.
  await db.insert(stockSheets).values({ id: crypto.randomUUID(), list, createdBy: userId }).onConflictDoNothing();
  return (await openSheet(db, list))!;
}

function lineQty(list: StockList, item: StockItem, line: { qtyHave: number | null; qtyOrder: number | null } | undefined): number {
  if (isTextUnit(item.unit)) return 0;
  return list === "wholesale" ? orderQty(item, line) : (line?.qtyOrder ?? 0);
}

/** A line belongs on the outgoing list when it has a quantity or a description (unit "opis" = free text). */
function isPending(list: StockList, item: StockItem, line: { qtyHave: number | null; qtyOrder: number | null; note: string } | undefined): boolean {
  return lineQty(list, item, line) > 0 || Boolean(line?.note);
}

async function computeSummaryLines(db: Db, list: StockList, sheetId: string): Promise<StockSheetSummaryLine[]> {
  const items = await activeItems(db, list);
  const lines = await db.select().from(stockSheetLines).where(eq(stockSheetLines.sheetId, sheetId));
  const byItem = new Map(lines.map((l) => [l.itemId, l]));
  return items
    .map((it) => {
      const l = byItem.get(it.id);
      return { line: l, out: { name: it.name, unit: it.unit, groupName: it.groupName, qtyHave: l?.qtyHave ?? null, parQty: it.parQty, qty: lineQty(list, it, l), note: l?.note ?? "" }, item: it };
    })
    .filter((x) => isPending(list, x.item, x.line))
    .map((x) => x.out);
}

const stockRoutes = new Hono<AppEnv>()
  .get("/:list", zValidator("param", listParam, validationHook), async (c) => {
    const { list } = c.req.valid("param");
    const db = c.var.db;
    const items = await activeItems(db, list);
    const sheet = await openSheet(db, list);
    const lines = sheet
      ? await db
          .select({ itemId: stockSheetLines.itemId, qtyHave: stockSheetLines.qtyHave, qtyOrder: stockSheetLines.qtyOrder, note: stockSheetLines.note })
          .from(stockSheetLines).where(eq(stockSheetLines.sheetId, sheet.id))
      : [];
    return c.json({ list, items, sheetId: sheet?.id ?? null, updatedAt: sheet ? iso(sheet.updatedAt) : null, lines } satisfies StockResponse);
  })
  .put("/:list/lines/:itemId", zValidator("param", listParam.extend({ itemId: z.string().max(100) }), validationHook), zValidator("json", stockLineSchema, validationHook), async (c) => {
    const { list, itemId } = c.req.valid("param");
    const body = c.req.valid("json");
    const db = c.var.db;
    const userId = c.var.user!.id;
    const [item] = await db.select({ id: stockItems.id }).from(stockItems).where(and(eq(stockItems.id, itemId), eq(stockItems.list, list), eq(stockItems.active, true)));
    if (!item) notFound("Nie znaleziono pozycji.");
    const sheet = await ensureOpenSheet(db, list, userId);
    const set = { ...(body.qtyHave !== undefined && { qtyHave: body.qtyHave }), ...(body.qtyOrder !== undefined && { qtyOrder: body.qtyOrder }), ...(body.note !== undefined && { note: body.note }), updatedBy: userId, updatedAt: new Date() };
    await db.batch([
      db
        .insert(stockSheetLines)
        .values({ sheetId: sheet.id, itemId, qtyHave: body.qtyHave ?? null, qtyOrder: body.qtyOrder ?? null, note: body.note ?? "", updatedBy: userId })
        .onConflictDoUpdate({ target: [stockSheetLines.sheetId, stockSheetLines.itemId], set }),
      db.update(stockSheets).set({ updatedAt: new Date() }).where(eq(stockSheets.id, sheet.id)),
    ]);
    return c.json({ ok: true, sheetId: sheet.id });
  })
  .post("/:list/close", zValidator("param", listParam, validationHook), async (c) => {
    const { list } = c.req.valid("param");
    const db = c.var.db;
    const userId = c.var.user!.id;
    const sheet = await openSheet(db, list);
    if (!sheet) throw new HttpError(409, "nothing_to_close", "Lista jest pusta — nie ma czego zamykać.");
    const lines = await computeSummaryLines(db, list, sheet.id);
    await db.update(stockSheets).set({ status: "closed", closedBy: userId, closedAt: new Date(), summary: lines, updatedAt: new Date() }).where(eq(stockSheets.id, sheet.id));
    await writeAudit(db, { actorId: userId, action: "kitchen.stock.close", entityType: "stock_sheet", entityId: sheet.id, metadata: { list, lines: lines.length } });
    return c.json({ id: sheet.id, lines });
  })
  .get("/:list/history", zValidator("param", listParam, validationHook), async (c) => {
    const { list } = c.req.valid("param");
    const db = c.var.db;
    const rows = await db
      .select()
      .from(stockSheets)
      .where(and(eq(stockSheets.list, list), eq(stockSheets.status, "closed")))
      .orderBy(desc(stockSheets.closedAt))
      .limit(30);
    const names = await userNames(db, rows.map((r) => r.closedBy));
    const sheets: StockSheetHistory[] = rows.map((r) => ({
      id: r.id,
      closedAt: iso(r.closedAt),
      closedByName: r.closedBy ? (names.get(r.closedBy) ?? null) : null,
      lines: (r.summary ?? []) as StockSheetSummaryLine[],
    }));
    return c.json({ sheets });
  })
  // ---- catalog management ----
  .post("/:list/items", requireManager, zValidator("param", listParam, validationHook), zValidator("json", stockItemInputSchema, validationHook), async (c) => {
    const { list } = c.req.valid("param");
    const input = c.req.valid("json");
    const db = c.var.db;
    const id = crypto.randomUUID();
    const [max] = await db.select({ m: sql<number>`coalesce(max(${stockItems.sortOrder}), 0)` }).from(stockItems).where(eq(stockItems.list, list));
    const res = await db
      .insert(stockItems)
      .values({ id, list, ...input, nameKey: foldText(input.name), sortOrder: (max?.m ?? 0) + 1 })
      .onConflictDoNothing()
      .returning({ id: stockItems.id });
    if (res.length === 0) validation("name", "Taka pozycja już jest na liście");
    return c.json({ id }, 201);
  })
  .post("/:list/import", requireManager, zValidator("param", listParam, validationHook), zValidator("json", stockImportSchema, validationHook), async (c) => {
    const { list } = c.req.valid("param");
    const parsed = parseStockImport(c.req.valid("json").text);
    if (parsed.length === 0) validation("text", "Nie znaleziono żadnych pozycji");
    if (parsed.length > 500) validation("text", "Maksymalnie 500 pozycji naraz");
    const db = c.var.db;
    const [max] = await db.select({ m: sql<number>`coalesce(max(${stockItems.sortOrder}), 0)` }).from(stockItems).where(eq(stockItems.list, list));
    const base = max?.m ?? 0;
    const res = await db.batch(
      parsed.map((p, i) =>
        db
          .insert(stockItems)
          .values({ id: crypto.randomUUID(), list, ...p, nameKey: foldText(p.name), sortOrder: base + i + 1 })
          .onConflictDoNothing()
          .returning({ id: stockItems.id }),
      ) as [never, ...never[]],
    );
    const added = (res as unknown as { id: string }[][]).filter((r) => r.length > 0).length;
    await writeAudit(db, { actorId: c.var.user!.id, action: "kitchen.stock.import", metadata: { list, added, skipped: parsed.length - added } });
    return c.json({ added, skipped: parsed.length - added });
  })
  .patch("/items/:id", requireManager, zValidator("json", stockItemUpdateSchema, validationHook), async (c) => {
    const input = c.req.valid("json");
    const db = c.var.db;
    const [old] = await db.select().from(stockItems).where(and(eq(stockItems.id, c.req.param("id")), eq(stockItems.active, true)));
    if (!old) notFound("Nie znaleziono pozycji.");
    if (input.name) {
      const key = foldText(input.name);
      const [dup] = await db
        .select({ id: stockItems.id })
        .from(stockItems)
        .where(and(eq(stockItems.list, old.list), eq(stockItems.nameKey, key), eq(stockItems.active, true)));
      if (dup && dup.id !== old.id) validation("name", "Taka pozycja już jest na liście");
    }
    await db
      .update(stockItems)
      .set({ ...input, ...(input.name && { nameKey: foldText(input.name) }), updatedAt: new Date() })
      .where(eq(stockItems.id, old.id));
    return c.json({ ok: true });
  })
  .delete("/items/:id", requireManager, async (c) => {
    const res = await c.var.db
      .update(stockItems)
      .set({ active: false, updatedAt: new Date() })
      .where(and(eq(stockItems.id, c.req.param("id")), eq(stockItems.active, true)))
      .returning({ id: stockItems.id });
    if (res.length === 0) notFound("Nie znaleziono pozycji.");
    return c.json({ ok: true });
  });

async function loadHandovers(db: Db, limit: number): Promise<HandoverRow[]> {
  const rows = await db.select().from(shiftHandovers).orderBy(desc(shiftHandovers.createdAt)).limit(limit);
  const names = await userNames(db, rows.flatMap((r) => [r.authorId, r.acknowledgedBy]));
  return rows.map((r) => ({
    id: r.id,
    shiftDate: r.shiftDate,
    shift: r.shift,
    authorId: r.authorId,
    authorName: r.authorId ? (names.get(r.authorId) ?? null) : null,
    prep: r.prep,
    prepNotes: r.prepNotes,
    shortages: r.shortages,
    shortagesNote: r.shortagesNote,
    hasFailure: r.hasFailure,
    failureNote: r.failureNote,
    acknowledgedByName: r.acknowledgedBy ? (names.get(r.acknowledgedBy) ?? null) : null,
    acknowledgedAt: r.acknowledgedAt ? iso(r.acknowledgedAt) : null,
    createdAt: iso(r.createdAt),
  }));
}

const handoverRoutes = new Hono<AppEnv>()
  .get("/checks", async (c) => {
    const rows = await c.var.db.select({ id: handoverChecks.id, label: handoverChecks.label }).from(handoverChecks).orderBy(asc(handoverChecks.sortOrder));
    return c.json({ checks: rows });
  })
  .put("/checks", requireManager, zValidator("json", handoverChecksSchema, validationHook), async (c) => {
    const { labels } = c.req.valid("json");
    const db = c.var.db;
    await db.batch([
      db.delete(handoverChecks),
      ...labels.map((label, i) => db.insert(handoverChecks).values({ id: crypto.randomUUID(), label, sortOrder: i + 1 })),
    ]);
    return c.json({ ok: true });
  })
  .get("/", zValidator("query", z.object({ limit: z.coerce.number().int().min(1).max(100).default(30) }), validationHook), async (c) => {
    return c.json({ handovers: await loadHandovers(c.var.db, c.req.valid("query").limit) });
  })
  .post("/", zValidator("json", handoverInputSchema, validationHook), async (c) => {
    const input = c.req.valid("json");
    const id = crypto.randomUUID();
    const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", hour: "numeric", hourCycle: "h23" }).format(new Date()));
    await c.var.db.insert(shiftHandovers).values({
      id,
      ...input,
      shift: input.shift ?? (hour < 16 ? "morning" : "evening"),
      failureNote: input.hasFailure ? input.failureNote : "Brak",
      authorId: c.var.user!.id,
    });
    return c.json({ id }, 201);
  })
  .post("/:id/ack", async (c) => {
    const db = c.var.db;
    const userId = c.var.user!.id;
    const [h] = await db.select().from(shiftHandovers).where(eq(shiftHandovers.id, c.req.param("id")));
    if (!h) notFound("Nie znaleziono protokołu.");
    if (h.authorId === userId && userId !== GUEST_USER_ID) throw new HttpError(409, "own_handover", "Protokół potwierdza osoba przejmująca zmianę.");
    if (h.acknowledgedAt) throw new HttpError(409, "already_acknowledged", "Zmiana została już przejęta.");
    await db.update(shiftHandovers).set({ acknowledgedBy: userId, acknowledgedAt: new Date() }).where(eq(shiftHandovers.id, h.id));
    return c.json({ ok: true });
  });

const rangeQuery = z.object({ from: z.iso.datetime().optional(), to: z.iso.datetime().optional() });

const haccpRoutes = new Hono<AppEnv>()
  .get("/units", async (c) => {
    const units: ColdUnit[] = await c.var.db
      .select({ id: coldUnits.id, name: coldUnits.name, kind: coldUnits.kind, minC: coldUnits.minC, maxC: coldUnits.maxC, sortOrder: coldUnits.sortOrder })
      .from(coldUnits)
      .where(eq(coldUnits.active, true))
      .orderBy(asc(coldUnits.sortOrder), asc(coldUnits.name));
    return c.json({ units });
  })
  .post("/units", requireManager, zValidator("json", coldUnitInputSchema, validationHook), async (c) => {
    const db = c.var.db;
    const id = crypto.randomUUID();
    const [max] = await db.select({ m: sql<number>`coalesce(max(${coldUnits.sortOrder}), 0)` }).from(coldUnits);
    await db.insert(coldUnits).values({ id, ...c.req.valid("json"), sortOrder: (max?.m ?? 0) + 1 });
    await writeAudit(db, { actorId: c.var.user!.id, action: "kitchen.haccp.unit_create", entityType: "cold_unit", entityId: id });
    return c.json({ id }, 201);
  })
  .patch("/units/:id", requireManager, zValidator("json", coldUnitUpdateSchema, validationHook), async (c) => {
    const input = c.req.valid("json");
    const db = c.var.db;
    const [old] = await db.select().from(coldUnits).where(and(eq(coldUnits.id, c.req.param("id")), eq(coldUnits.active, true)));
    if (!old) notFound("Nie znaleziono urządzenia.");
    if ((input.minC ?? old.minC) > (input.maxC ?? old.maxC)) validation("maxC", "Górna granica musi być ≥ dolnej");
    await db.update(coldUnits).set({ ...input, updatedAt: new Date() }).where(eq(coldUnits.id, old.id));
    // Limit changes matter for inspections: keep a trace.
    await writeAudit(db, { actorId: c.var.user!.id, action: "kitchen.haccp.unit_update", entityType: "cold_unit", entityId: old.id, metadata: { ...input } });
    return c.json({ ok: true });
  })
  .delete("/units/:id", requireManager, async (c) => {
    // Deactivate only: past readings keep referring to the unit.
    const res = await c.var.db
      .update(coldUnits)
      .set({ active: false, updatedAt: new Date() })
      .where(and(eq(coldUnits.id, c.req.param("id")), eq(coldUnits.active, true)))
      .returning({ id: coldUnits.id });
    if (res.length === 0) notFound("Nie znaleziono urządzenia.");
    await writeAudit(c.var.db, { actorId: c.var.user!.id, action: "kitchen.haccp.unit_remove", entityType: "cold_unit", entityId: res[0]!.id });
    return c.json({ ok: true });
  })
  .post("/entries", zValidator("json", haccpEntrySchema, validationHook), async (c) => {
    const { readings, pest } = c.req.valid("json");
    if (readings.length === 0 && !pest) validation("readings", "Wpisz co najmniej jeden pomiar");
    const db = c.var.db;
    const userId = c.var.user!.id;
    const now = new Date();
    const ids = [...new Set(readings.map((r) => r.unitId))];
    if (ids.length !== readings.length) validation("readings", "Każde urządzenie można podać tylko raz");
    const units = ids.length ? await db.select().from(coldUnits).where(and(inArray(coldUnits.id, ids), eq(coldUnits.active, true))) : [];
    const byId = new Map(units.map((u) => [u.id, u]));
    const rows = readings.map((r, i) => {
      const u = byId.get(r.unitId);
      if (!u) validation(`readings.${i}.unitId`, "Nieznane urządzenie");
      const inRange = r.tempC >= u.minC && r.tempC <= u.maxC;
      if (!inRange && !r.correctiveAction) validation(`readings.${i}.correctiveAction`, `${u.name}: temperatura poza zakresem — wpisz działanie korygujące`);
      return { id: crypto.randomUUID(), unitId: u.id, tempC: r.tempC, minC: u.minC, maxC: u.maxC, inRange, correctiveAction: r.correctiveAction, authorId: userId, measuredAt: now };
    });
    if (pest?.found && !pest.notes) validation("pest.notes", "Opisz, co i gdzie zauważono");
    await db.batch([
      ...rows.map((r) => db.insert(temperatureLogs).values(r)),
      ...(pest ? [db.insert(pestChecks).values({ id: crypto.randomUUID(), found: pest.found, notes: pest.notes, action: pest.action, authorId: userId, checkedAt: now })] : []),
    ] as [never, ...never[]]);
    return c.json({ saved: rows.length, outOfRange: rows.filter((r) => !r.inRange).length }, 201);
  })
  .get("/log", zValidator("query", rangeQuery, validationHook), async (c) => {
    const q = c.req.valid("query");
    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ? new Date(q.from) : new Date(to.getTime() - 31 * 86400_000);
    if (to.getTime() - from.getTime() > 400 * 86400_000) validation("from", "Maksymalnie ok. 13 miesięcy naraz");
    const db = c.var.db;
    const temps = await db
      .select({ t: temperatureLogs, unitName: coldUnits.name })
      .from(temperatureLogs)
      .innerJoin(coldUnits, eq(coldUnits.id, temperatureLogs.unitId))
      .where(and(gte(temperatureLogs.measuredAt, from), lt(temperatureLogs.measuredAt, to)))
      .orderBy(desc(temperatureLogs.measuredAt), asc(coldUnits.sortOrder))
      .limit(5000);
    const pests = await db
      .select()
      .from(pestChecks)
      .where(and(gte(pestChecks.checkedAt, from), lt(pestChecks.checkedAt, to)))
      .orderBy(desc(pestChecks.checkedAt))
      .limit(2000);
    const names = await userNames(db, [...temps.map((r) => r.t.authorId), ...pests.map((p) => p.authorId)]);
    const temperatures: TemperatureRow[] = temps.map(({ t, unitName }) => ({
      id: t.id,
      unitId: t.unitId,
      unitName,
      tempC: t.tempC,
      minC: t.minC,
      maxC: t.maxC,
      inRange: t.inRange,
      correctiveAction: t.correctiveAction,
      measuredAt: iso(t.measuredAt),
      authorName: t.authorId ? (names.get(t.authorId) ?? null) : null,
    }));
    const pestRows: PestRow[] = pests.map((p) => ({
      id: p.id,
      found: p.found,
      notes: p.notes,
      action: p.action,
      checkedAt: iso(p.checkedAt),
      authorName: p.authorId ? (names.get(p.authorId) ?? null) : null,
    }));
    return c.json({ from: from.toISOString(), to: to.toISOString(), temperatures, pests: pestRows });
  });

export const kitchenRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get("/summary", async (c) => {
    const db = c.var.db;
    const dayStart = warsawDayStart();
    const stock = async (list: StockList) => {
      const items = await activeItems(db, list);
      const sheet = await openSheet(db, list);
      const lines = sheet ? await db.select().from(stockSheetLines).where(eq(stockSheetLines.sheetId, sheet.id)) : [];
      const byItem = new Map(lines.map((l) => [l.itemId, l]));
      return { items: items.length, pending: items.filter((it) => isPending(list, it, byItem.get(it.id))).length };
    };
    const [shopping, wholesale, [last], [units], measured, [pest]] = await Promise.all([
      stock("shopping"),
      stock("wholesale"),
      db.select().from(shiftHandovers).orderBy(desc(shiftHandovers.createdAt)).limit(1),
      db.select({ n: sql<number>`count(*)` }).from(coldUnits).where(eq(coldUnits.active, true)),
      db
        .select({ unitId: temperatureLogs.unitId, bad: sql<number>`sum(case when ${temperatureLogs.inRange} then 0 else 1 end)` })
        .from(temperatureLogs)
        .innerJoin(coldUnits, and(eq(coldUnits.id, temperatureLogs.unitId), eq(coldUnits.active, true)))
        .where(gte(temperatureLogs.measuredAt, dayStart))
        .groupBy(temperatureLogs.unitId),
      db.select({ id: pestChecks.id }).from(pestChecks).where(gte(pestChecks.checkedAt, dayStart)).limit(1),
    ]);
    const summary: KitchenSummary = {
      shopping: { items: shopping.items, toBuy: shopping.pending },
      wholesale: { items: wholesale.items, toOrder: wholesale.pending },
      handover: {
        last: last
          ? { shiftDate: last.shiftDate, shift: last.shift, hasFailure: last.hasFailure, shortages: last.shortages.length + (last.shortagesNote ? 1 : 0), acknowledged: last.acknowledgedAt !== null }
          : null,
      },
      haccp: {
        units: units?.n ?? 0,
        measuredToday: measured.length,
        pestCheckedToday: Boolean(pest),
        outOfRangeToday: measured.reduce((s, m) => s + (Number(m.bad) > 0 ? 1 : 0), 0),
      },
    };
    return c.json(summary);
  })
  .route("/stock", stockRoutes)
  .route("/handovers", handoverRoutes)
  .route("/haccp", haccpRoutes);
