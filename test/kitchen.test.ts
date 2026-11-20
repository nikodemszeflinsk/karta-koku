import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import type { HandoverRow, KitchenSummary, StockResponse, StockSheetHistory, TemperatureRow, PestRow } from "../src/shared/kitchen";
import { orderQty, parseStockImport, warsawDate, warsawDayStart } from "../src/shared/kitchen";
import { api, createUserWithRole, loginCookie, OWNER, setupOwner } from "./helpers";

let owner = "";
let learner = "";
const json = async <T>(r: Response | Promise<Response>) => (await (await r).json()) as T;

beforeAll(async () => {
  await setupOwner();
  owner = await loginCookie(OWNER.email, OWNER.password);
  await createUserWithRole("k-learner@example.test", "learner password 123", "learner");
  learner = await loginCookie("k-learner@example.test", "learner password 123");
});

describe("helpers", () => {
  it("computes order quantity from par level, with manual override", () => {
    expect(orderQty({ parQty: 10 }, { qtyHave: 3.5, qtyOrder: null })).toBe(6.5);
    expect(orderQty({ parQty: 10 }, { qtyHave: 12, qtyOrder: null })).toBe(0);
    expect(orderQty({ parQty: 10 }, { qtyHave: 3, qtyOrder: 2 })).toBe(2);
    expect(orderQty({ parQty: null }, { qtyHave: 3, qtyOrder: null })).toBe(0);
    expect(orderQty({ parQty: 5 }, undefined)).toBe(0);
  });

  it("parses pasted product lines", () => {
    expect(parseStockImport("Łosoś; kg; 6,5; Ryby\n\n# komentarz\nNori\tszt.\t200\nImbir")).toEqual([
      { name: "Łosoś", unit: "kg", parQty: 6.5, groupName: "Ryby" },
      { name: "Nori", unit: "szt.", parQty: 200, groupName: "" },
      { name: "Imbir", unit: "szt.", parQty: null, groupName: "" },
    ]);
  });

  it("finds Warsaw midnight across DST", () => {
    expect(warsawDayStart(new Date("2026-07-01T10:00:00Z")).toISOString()).toBe("2026-06-30T22:00:00.000Z");
    expect(warsawDayStart(new Date("2026-12-01T23:30:00Z")).toISOString()).toBe("2026-12-01T23:00:00.000Z");
    expect(warsawDate(new Date("2026-12-01T23:30:00Z"))).toBe("2026-12-02");
  });
});

describe("stock lists", () => {
  let salmon = "";
  let nori = "";

  it("lets only managers edit the catalog", async () => {
    expect((await api("/api/kitchen/stock/wholesale/items", { cookie: learner, body: { name: "Łosoś" } })).status).toBe(403);
    const r = await api("/api/kitchen/stock/wholesale/items", { cookie: owner, body: { name: "Łosoś", unit: "kg", parQty: 6, groupName: "Ryby" } });
    expect(r.status).toBe(201);
    salmon = (await json<{ id: string }>(r)).id;
    expect((await api("/api/kitchen/stock/wholesale/items", { cookie: owner, body: { name: "ŁOSOŚ" } })).status).toBe(400);
    const imp = await json<{ added: number; skipped: number }>(api("/api/kitchen/stock/wholesale/import", { cookie: owner, body: { text: "Nori; szt.; 100; Suche\nłosoś; kg; 3" } }));
    expect(imp).toEqual({ added: 1, skipped: 1 });
  });

  it("autosaves quantities and computes what to order", async () => {
    const s = await json<StockResponse>(api("/api/kitchen/stock/wholesale", { cookie: learner }));
    expect(s.sheetId).toBeNull();
    expect(s.items.map((i) => [i.groupName, i.name])).toEqual([["Ryby", "Łosoś"], ["Suche", "Nori"]]);
    nori = s.items.find((i) => i.name === "Nori")!.id;
    expect((await api(`/api/kitchen/stock/wholesale/lines/${salmon}`, { method: "PUT", cookie: learner, body: { qtyHave: 2 } })).status).toBe(200);
    expect((await api(`/api/kitchen/stock/wholesale/lines/${nori}`, { method: "PUT", cookie: learner, body: { qtyHave: 150 } })).status).toBe(200);
    // Wrong list for the item.
    expect((await api(`/api/kitchen/stock/shopping/lines/${nori}`, { method: "PUT", cookie: learner, body: { qtyOrder: 1 } })).status).toBe(404);
    const sum = await json<KitchenSummary>(api("/api/kitchen/summary", { cookie: learner }));
    expect(sum.wholesale).toEqual({ items: 2, toOrder: 1 });
  });

  it("closes the sheet into history and starts fresh", async () => {
    const closed = await json<{ lines: { name: string; qty: number }[] }>(api("/api/kitchen/stock/wholesale/close", { cookie: learner, body: {} }));
    expect(closed.lines.map((l) => [l.name, l.qty])).toEqual([["Łosoś", 4]]);
    const s = await json<StockResponse>(api("/api/kitchen/stock/wholesale", { cookie: learner }));
    expect(s.sheetId).toBeNull();
    expect((await api("/api/kitchen/stock/wholesale/close", { cookie: learner, body: {} })).status).toBe(409);
    const h = await json<{ sheets: StockSheetHistory[] }>(api("/api/kitchen/stock/wholesale/history", { cookie: owner }));
    expect(h.sheets).toHaveLength(1);
    expect(h.sheets[0]!.lines[0]).toMatchObject({ name: "Łosoś", qty: 4, parQty: 6, qtyHave: 2 });
  });

  it("keeps history when an item is removed", async () => {
    expect((await api(`/api/kitchen/stock/items/${salmon}`, { method: "DELETE", cookie: owner })).status).toBe(200);
    const s = await json<StockResponse>(api("/api/kitchen/stock/wholesale", { cookie: owner }));
    expect(s.items.map((i) => i.name)).toEqual(["Nori"]);
    const h = await json<{ sheets: StockSheetHistory[] }>(api("/api/kitchen/stock/wholesale/history", { cookie: owner }));
    expect(h.sheets[0]!.lines[0]!.name).toBe("Łosoś");
    // Name can be reused after removal.
    expect((await api("/api/kitchen/stock/wholesale/items", { cookie: owner, body: { name: "Łosoś", unit: "kg" } })).status).toBe(201);
  });
});

describe("shopping descriptions", () => {
  it("saves a description per line and keeps it in the closed list", async () => {
    const id = (await json<{ id: string }>(api("/api/kitchen/stock/shopping/items", { cookie: owner, body: { name: "Cytryny", unit: "szt." } }))).id;
    const mint = (await json<{ id: string }>(api("/api/kitchen/stock/shopping/items", { cookie: owner, body: { name: "Mięta" } }))).id;
    expect((await api(`/api/kitchen/stock/shopping/lines/${id}`, { method: "PUT", cookie: learner, body: { qtyOrder: 10, note: "dojrzałe, bez woskowania" } })).status).toBe(200);
    // A description alone also puts the item on the list.
    expect((await api(`/api/kitchen/stock/shopping/lines/${mint}`, { method: "PUT", cookie: learner, body: { note: "jeśli będzie świeża" } })).status).toBe(200);
    const s = await json<StockResponse>(api("/api/kitchen/stock/shopping", { cookie: learner }));
    expect(s.lines.find((l) => l.itemId === id)).toMatchObject({ qtyOrder: 10, note: "dojrzałe, bez woskowania" });
    expect((await json<KitchenSummary>(api("/api/kitchen/summary", { cookie: learner }))).shopping.toBuy).toBe(2);
    const closed = await json<{ lines: { name: string; qty: number; note?: string }[] }>(api("/api/kitchen/stock/shopping/close", { cookie: learner, body: {} }));
    expect(closed.lines).toEqual([
      expect.objectContaining({ name: "Cytryny", qty: 10, note: "dojrzałe, bez woskowania" }),
      expect.objectContaining({ name: "Mięta", qty: 0, note: "jeśli będzie świeża" }),
    ]);
  });
});

describe("free-text unit 'opis'", () => {
  it("orders by description instead of a number", async () => {
    const id = (await json<{ id: string }>(api("/api/kitchen/stock/wholesale/items", { cookie: owner, body: { name: "Dekoracje sezonowe", unit: "opis", parQty: 5 } }))).id;
    expect((await api(`/api/kitchen/stock/wholesale/lines/${id}`, { method: "PUT", cookie: learner, body: { qtyHave: 1, note: "2 opakowania liści shiso" } })).status).toBe(200);
    const closed = await json<{ lines: { name: string; qty: number; note?: string }[] }>(api("/api/kitchen/stock/wholesale/close", { cookie: learner, body: {} }));
    expect(closed.lines.find((l) => l.name === "Dekoracje sezonowe")).toMatchObject({ qty: 0, note: "2 opakowania liści shiso" });
  });
});

describe("shift handover", () => {
  let id = "";
  it("has a default checklist and records a handover with failure defaulting to 'Brak'", async () => {
    const { checks } = await json<{ checks: { label: string }[] }>(api("/api/kitchen/handovers/checks", { cookie: learner }));
    expect(checks.length).toBeGreaterThan(3);
    const bad = await api("/api/kitchen/handovers", {
      cookie: learner,
      body: { signedName: "Ola", shiftDate: "2026-11-20", shift: "morning", prep: [], shortages: [], hasFailure: true, failureNote: "" },
    });
    expect(bad.status).toBe(400);
    const r = await api("/api/kitchen/handovers", {
      cookie: learner,
      body: {
        signedName: "Ola", shiftDate: "2026-11-20",
        shift: "morning",
        prep: checks.map((c, i) => ({ label: c.label, done: i > 0 })),
        prepNotes: "Brakuje pół partii ryżu",
        shortages: [{ menuItemId: null, name: "Futomaki tempura" }],
      },
    });
    expect(r.status).toBe(201);
    id = (await json<{ id: string }>(r)).id;
    const { handovers } = await json<{ handovers: HandoverRow[] }>(api("/api/kitchen/handovers", { cookie: owner }));
    expect(handovers[0]).toMatchObject({ id, hasFailure: false, failureNote: "Brak", shortages: [{ name: "Futomaki tempura" }], acknowledgedAt: null });
  });

  it("is acknowledged by someone else, once", async () => {
    expect((await api(`/api/kitchen/handovers/${id}/ack`, { cookie: learner, body: { name: "Kuba" } })).status).toBe(409);
    expect((await api(`/api/kitchen/handovers/${id}/ack`, { cookie: owner, body: { name: "Kuba" } })).status).toBe(200);
    expect((await api(`/api/kitchen/handovers/${id}/ack`, { cookie: owner, body: { name: "Kuba" } })).status).toBe(409);
    const sum = await json<KitchenSummary>(api("/api/kitchen/summary", { cookie: learner }));
    expect(sum.handover.last).toMatchObject({ acknowledged: true, shortages: 1, hasFailure: false });
  });

  it("accepts the simple form: no shift, items to replenish, shortages as text", async () => {
    const r = await api("/api/kitchen/handovers", {
      cookie: learner,
      body: { signedName: "Ola", shiftDate: "2026-11-21", prep: [{ label: "Ryż", done: false }, { label: "Nori", done: false }], shortages: [], shortagesNote: "Brak węgorza", hasFailure: false },
    });
    expect(r.status).toBe(201);
    const { handovers } = await json<{ handovers: HandoverRow[] }>(api("/api/kitchen/handovers", { cookie: owner }));
    expect(handovers[0]).toMatchObject({ authorName: "Ola", shiftDate: "2026-11-21", shortagesNote: "Brak węgorza", failureNote: "Brak", prep: [{ label: "Ryż" }, { label: "Nori" }] });
    expect(["morning", "evening"]).toContain(handovers[0]!.shift);
    const sum = await json<KitchenSummary>(api("/api/kitchen/summary", { cookie: learner }));
    expect(sum.handover.last).toMatchObject({ shortages: 1, acknowledged: false });
  });

  it("only managers edit the checklist", async () => {
    expect((await api("/api/kitchen/handovers/checks", { method: "PUT", cookie: learner, body: { labels: ["x"] } })).status).toBe(403);
    expect((await api("/api/kitchen/handovers/checks", { method: "PUT", cookie: owner, body: { labels: ["Ryż", "Ryby"] } })).status).toBe(200);
    const { checks } = await json<{ checks: { label: string }[] }>(api("/api/kitchen/handovers/checks", { cookie: learner }));
    expect(checks.map((c) => c.label)).toEqual(["Ryż", "Ryby"]);
  });
});

describe("HACCP", () => {
  let fridge = "";
  let freezer = "";
  it("manages cold units (managers only)", async () => {
    expect((await api("/api/kitchen/haccp/units", { cookie: learner, body: { name: "Lodówka 1", kind: "fridge", minC: 0, maxC: 4 } })).status).toBe(403);
    expect((await api("/api/kitchen/haccp/units", { cookie: owner, body: { name: "Zła", kind: "fridge", minC: 5, maxC: 1 } })).status).toBe(400);
    fridge = (await json<{ id: string }>(api("/api/kitchen/haccp/units", { cookie: owner, body: { name: "Lodówka ryby", kind: "fridge", minC: 0, maxC: 4 } }))).id;
    freezer = (await json<{ id: string }>(api("/api/kitchen/haccp/units", { cookie: owner, body: { name: "Mroźnia", kind: "freezer", minC: -25, maxC: -18 } }))).id;
  });

  it("requires a corrective action for out-of-range readings", async () => {
    const bad = await api("/api/kitchen/haccp/entries", { cookie: learner, body: { signedName: "Ola", readings: [{ unitId: fridge, tempC: 7 }], pest: null } });
    expect(bad.status).toBe(400);
    const ok = await api("/api/kitchen/haccp/entries", {
      cookie: learner,
      body: {
        signedName: "Ola",
        readings: [
          { unitId: fridge, tempC: 7, correctiveAction: "Przeniesiono rybę, wezwano serwis" },
          { unitId: freezer, tempC: -20 },
        ],
        pest: { found: false },
      },
    });
    expect(ok.status).toBe(201);
    expect(await json(ok)).toEqual({ saved: 2, outOfRange: 1 });
    expect((await api("/api/kitchen/haccp/entries", { cookie: learner, body: { signedName: "Ola", readings: [], pest: { found: true } } })).status).toBe(400);
  });

  it("keeps the limits in force with each record, even after the unit changes", async () => {
    expect((await api(`/api/kitchen/haccp/units/${fridge}`, { method: "PATCH", cookie: owner, body: { maxC: 8 } })).status).toBe(200);
    const log = await json<{ temperatures: TemperatureRow[]; pests: PestRow[] }>(api("/api/kitchen/haccp/log", { cookie: learner }));
    const f = log.temperatures.find((t) => t.unitId === fridge)!;
    expect(f).toMatchObject({ tempC: 7, maxC: 4, inRange: false, correctiveAction: "Przeniesiono rybę, wezwano serwis", authorName: expect.any(String) });
    expect(log.pests).toHaveLength(1);
    expect(log.pests[0]!.found).toBe(false);
    const sum = await json<KitchenSummary>(api("/api/kitchen/summary", { cookie: learner }));
    expect(sum.haccp).toMatchObject({ units: 2, measuredToday: 2, pestCheckedToday: true, outOfRangeToday: 1 });
  });

  it("requires a name and shows it as the author", async () => {
    expect((await api("/api/kitchen/haccp/entries", { cookie: learner, body: { signedName: " ", readings: [], pest: { found: false } } })).status).toBe(400);
    const log = await json<{ temperatures: TemperatureRow[] }>(api("/api/kitchen/haccp/log", { cookie: owner }));
    expect(log.temperatures.every((t) => t.authorName === "Ola")).toBe(true);
  });

  it("records cleaning against a plan managed by managers", async () => {
    expect((await api("/api/kitchen/haccp/cleaning-tasks", { method: "PUT", cookie: learner, body: { tasks: [{ label: "Podłoga", frequency: "daily" }] } })).status).toBe(403);
    expect((await api("/api/kitchen/haccp/cleaning-tasks", { method: "PUT", cookie: owner, body: { tasks: [{ label: "Podłoga", frequency: "twice_daily" }, { label: "Deski", frequency: "daily" }, { label: "Lodówki", frequency: "biweekly" }] } })).status).toBe(200);
    const { tasks } = await json<{ tasks: { id: string; label: string }[] }>(api("/api/kitchen/haccp/cleaning-tasks", { cookie: learner }));
    expect(tasks.map((t) => t.label)).toEqual(["Podłoga", "Deski", "Lodówki"]);
    expect(tasks.every((t) => (t as { due?: boolean }).due === true)).toBe(true);
    expect((await api("/api/kitchen/haccp/cleaning", { cookie: learner, body: { signedName: "Ola", taskIds: [] } })).status).toBe(400);
    const r = await api("/api/kitchen/haccp/cleaning", { cookie: learner, body: { signedName: "Ola", taskIds: [tasks[0]!.id, tasks[1]!.id], notes: "Po serwisie" } });
    expect(await json(r)).toEqual({ saved: 2 });
    // Renaming the plan keeps unchanged tasks and the history labels.
    expect((await api("/api/kitchen/haccp/cleaning-tasks", { method: "PUT", cookie: owner, body: { tasks: [{ label: "Podłoga", frequency: "twice_daily" }, { label: "Okap", frequency: "weekly" }] } })).status).toBe(200);
    const log = await json<{ cleaning: { taskLabel: string; authorName: string; notes: string }[] }>(api("/api/kitchen/haccp/log", { cookie: owner }));
    expect(log.cleaning.map((x) => x.taskLabel).sort()).toEqual(["Deski", "Podłoga"]);
    expect(log.cleaning[0]).toMatchObject({ authorName: "Ola", notes: "Po serwisie" });
    const sum = await json<KitchenSummary>(api("/api/kitchen/summary", { cookie: learner }));
    // Podłoga needs 2× a day (done once → still due); Okap was never done → due.
    expect(sum.haccp).toMatchObject({ cleaningTasks: 2, cleaningDue: 2 });
    const after = await json<{ tasks: { label: string; due: boolean; doneInPeriod: number; required: number; frequency: string }[] }>(api("/api/kitchen/haccp/cleaning-tasks", { cookie: learner }));
    expect(after.tasks[0]).toMatchObject({ label: "Podłoga", frequency: "twice_daily", doneInPeriod: 1, required: 2, due: true });
    const floor = (await json<{ tasks: { id: string }[] }>(api("/api/kitchen/haccp/cleaning-tasks", { cookie: learner }))).tasks[0]!.id;
    await api("/api/kitchen/haccp/cleaning", { cookie: learner, body: { signedName: "Ola", taskIds: [floor] } });
    const done = await json<{ tasks: { label: string; due: boolean }[] }>(api("/api/kitchen/haccp/cleaning-tasks", { cookie: learner }));
    expect(done.tasks.find((t) => t.label === "Podłoga")!.due).toBe(false);
  });

  it("has no way to edit or delete records", async () => {
    const id = (await env.DB.prepare("SELECT id FROM temperature_logs LIMIT 1").first<{ id: string }>())!.id;
    expect((await api(`/api/kitchen/haccp/entries/${id}`, { method: "DELETE", cookie: owner })).status).toBe(404);
    expect((await api(`/api/kitchen/haccp/units/${freezer}`, { method: "DELETE", cookie: owner })).status).toBe(200);
    const log = await json<{ temperatures: TemperatureRow[] }>(api("/api/kitchen/haccp/log", { cookie: owner }));
    expect(log.temperatures).toHaveLength(2);
  });

  it("requires a session", async () => {
    expect((await api("/api/kitchen/summary")).status).toBe(401);
  });
});
