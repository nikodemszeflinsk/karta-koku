/**
 * Folds Polish (and other Latin) text for matching: lower-case, strip combining
 * marks, and map letters that have no Unicode decomposition (ł, ø, ß…).
 * "Łosoś" -> "losos", "ŻÓŁTA" -> "zolta".
 */
export function foldText(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[łŁ]/g, "l")
    .replace(/[øØ]/g, "o")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
