import { describe, expect, it } from "vitest";
import { foldText } from "../src/shared/text";
import { toFtsQuery } from "../src/worker/lib/search";

describe("foldText", () => {
  it("folds Polish letters including ł", () => {
    expect(foldText("Łosoś ŻÓŁTA pasta")).toBe("losos zolta pasta");
    expect(foldText("  Ryż   do  sushi ")).toBe("ryz do sushi");
  });
});

describe("toFtsQuery", () => {
  it("quotes every word as a prefix term and drops operators", () => {
    expect(toFtsQuery('łosoś" OR NEAR(*)')).toBe('"losos"* "or"* "near"*');
    expect(toFtsQuery("***")).toBeNull();
  });
});
