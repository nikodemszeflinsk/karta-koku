"""Generates migrations/0004_koku_public_materials.sql from public KOKU materials.

Data is transcribed verbatim from the PDFs in materials/koku/ (retrieved 2026-11-16
from links on kokusushi.pl). Everything is imported with status 'needs_verification'
and components_complete = 0: the public materials list only what is printed on the
card, never full recipes. Allergens are NOT imported: in the sources they are
coloured dots in images, and transcribing them by eye is too error-prone for safety
information. Run: python3 scripts/build-koku-import.py
"""

import re
import unicodedata
from pathlib import Path


def fold(t):
    t = unicodedata.normalize("NFKD", t)
    t = "".join(ch for ch in t if not unicodedata.combining(ch))
    t = t.replace("ł", "l").replace("Ł", "L").replace("ø", "o").replace("Ø", "O").replace("ß", "ss")
    return re.sub(r"\s+", " ", t.lower()).strip()

RETRIEVED = "2026-11-16"
MENU_VERSION = "mv_koku_public_2026_11"

SOURCES = [
    ("src_koku_wkladka_jz_2026", "KOKU Sushi — wkładka jesień–zima 2026 (składniki i ceny)",
     "https://drive.google.com/file/d/1cZpKinmno3iZ6YBlbb3rTd_GxUtEhVQJ/view (link z linktr.ee/menusezonowe)",
     "materials/koku/05-wkladka-jesien-zima.pdf. Oferta na wynos i w dostawie, ograniczona czasowo."),
    ("src_koku_alergeny_jz_2026", "KOKU Sushi — alergeny wkładki jesień–zima 2026",
     "https://drive.google.com/file/d/1aCO2mE3HJd17R7dYGoAg05_PbIYnBf7r/view (link z linktr.ee/menusezonowe)",
     "materials/koku/06-alergeny-wkladka-jesien-zima.pdf. Alergeny jako kolorowe znaczniki — nie zaimportowano automatycznie."),
    ("src_koku_premium_2025_08", "KOKU Sushi — alergeny sushi premium (od 19.08.2025, wybrane lokale)",
     "https://drive.google.com/file/d/1u9iRYKXFHu9MS_8X8uL3I5DPMJIwAusz/view (link z linktr.ee/kokusushi_alergeny)",
     "materials/koku/02-menu-premium-od-2025-08-19.jpg. Zawiera nazwy 12 pozycji premium; alergeny jako kolorowe znaczniki."),
    ("src_koku_standard_2025_08", "KOKU Sushi — alergeny karty standardowej (od 19.08.2025)",
     "https://drive.google.com/file/d/1peDaHcUBATeR7UgCWDoLs9DzMTlp2wK-/view (link z linktr.ee/kokusushi_alergeny)",
     "materials/koku/01-menu-standard-od-2025-08-19.jpg. Tylko numery pozycji 1–131 bez nazw — pozycji nie zaimportowano."),
    ("src_koku_promo_2025_12", "KOKU Sushi — alergeny zestawów promocyjnych (grudzień 2025)",
     "https://drive.google.com/file/d/1ds4wfoeM8Yn8wONu0xheITxyvJWbXQpO/view (link z linktr.ee/kokusushi_alergeny)",
     "materials/koku/03-zestawy-promocyjne.pdf. Prawdopodobnie nieaktualne."),
]

# (id, tier, kind, code, name, portion, price_zl, currency, source, components)
ITEMS = [
    # --- Seasonal insert, autumn–winter 2026 (current) ---
    ("mi_jz26_krem_dyniowy", "seasonal", "soups", None, "Krem dyniowy yellow curry", "330 g", 29.00, "current", "src_koku_wkladka_jz_2026",
     ["karmazyn", "dynia", "mleko kokosowe", "żółta pasta curry", "sos rybny", "chrust z makaronu ryżowego", "chilli", "szczypior", "sezam"]),
    ("mi_jz26_futomaki_losos_miso", "seasonal", "futomaki", None, "Futomaki z opalanym łososiem w klonowej glazurze miso", "6 szt.", 31.00, "current", "src_koku_wkladka_jz_2026",
     ["ogórek", "tykwa", "jabłko w tempurze", "serek", "majonez", "sos dyniowy"]),
    ("mi_jz26_uramaki_wegorz", "seasonal", "uramaki", None, "Uramaki z tatarem z węgorza w oliwie truflowej", "8 szt.", 49.00, "current", "src_koku_wkladka_jz_2026",
     ["boczniaki w tempurze", "serek", "ogórek", "awokado", "sos teriyaki", "masago arare", "chilli", "szczypior", "por", "sezam"]),
    ("mi_jz26_burger_kaczka", "seasonal", "hot_dishes", None, "Burger z kaczką hoisin i konfiturą yuzu", None, 43.00, "current", "src_koku_wkladka_jz_2026",
     ["ryż", "ogórek", "sałata", "panko", "sos teriyaki"]),
    ("mi_jz26_herbata_korzenna", "seasonal", "drinks", None, "Herbata korzenna", "280 ml", 23.00, "current", "src_koku_wkladka_jz_2026",
     ["czarna herbata", "winter spice", "yuzu", "limonka", "goździki", "cynamon", "wiśnie", "rozmaryn"]),
    ("mi_jz26_herbata_jablko_yuzu", "seasonal", "drinks", None, "Rozgrzewająca zielona herbata z prażonym jabłkiem i yuzu", "280 ml", 23.00, "current", "src_koku_wkladka_jz_2026",
     ["zielone jabłko", "cynamon", "limonka", "goździki", "mięta"]),
    ("mi_jz26_grzane_wino", "seasonal", "drinks", None, "Grzane wino", "290 ml", 34.00, "current", "src_koku_wkladka_jz_2026",
     ["wino Vinho Verde", "yuzu", "winter spice", "goździki", "cynamon", "pomarańcze"]),
    ("mi_jz26_grzane_piwo", "seasonal", "drinks", None, "Grzane piwo z zielonym jabłkiem i cynamonem", "410 ml", 31.00, "current", "src_koku_wkladka_jz_2026",
     ["piwo Lech Premium", "goździki", "pomarańcze", "limonka"]),
    ("mi_jz26_apple_pie_matcha", "seasonal", "drinks", None, "Apple pie matcha", "300 ml", 21.00, "current", "src_koku_wkladka_jz_2026",
     ["mleko", "zielone jabłko", "cynamon", "prażone jabłko", "mięta"]),
    # --- Sides served with sets (stated in both the seasonal allergen sheet and the promo sheet) ---
    ("mi_warzywka", "standard", "sides", None, "Warzywka do zestawów", None, None, "current", "src_koku_alergeny_jz_2026",
     ["ogórek świeży", "rzodkiew", "imbir marynowany biały", "imbir różowy", "wasabi"]),
]

PREMIUM = [
    ("1", "Green roll", "other"),
    ("2", "Uramaki z opalanym łososiem teriyaki i węgorzem w tempurze", "uramaki"),
    ("3", "Chrupiące uramaki łosoś teriyaki", "uramaki"),
    ("4", "Chrupiące uramaki z kurczakiem i opalanym cheddarem", "uramaki"),
    ("5", "Uramaki kimchi z pikantnym tatarem z łososia", "uramaki"),
    ("6", "Uramaki potrójny łosoś", "uramaki"),
    ("7", "Volcano roll", "other"),
    ("8", "Dragon roll z krewetkami, tuńczykiem i łososiem", "other"),
    ("9", "Dragon roll z krewetkami w tempurze i mango", "other"),
    ("10", "Dragon roll z węgorzem w tempurze i węgorzem kabayaki", "other"),
    ("11", "Uramaki rainbow", "uramaki"),
    ("12", "Uramaki korean pulled beef", "uramaki"),
]
for code, name, kind in PREMIUM:
    ITEMS.append((f"mi_premium_{code}", "premium", kind, code, name, None, None, "current", "src_koku_premium_2025_08", []))

PROMO = [
    ("Hosomaki z ogórkiem", "hosomaki"),
    ("Hosomaki z rzodkwią", "hosomaki"),
    ("Hosomaki z mango", "hosomaki"),
    ("Hosomaki z surimi", "hosomaki"),
    ("Spring rolls", "starters"),
    ("Uramaki z łososiem i awokado", "uramaki"),
    ("Uramaki z łososiem w tempurze i mango", "uramaki"),
    ("Uramaki z tuńczykiem i serkiem", "uramaki"),
    ("Uramaki z sałatką surimi, awokado i zielonym masago", "uramaki"),
    ("Uramaki z łososiem opalanym spicy mango", "uramaki"),
    ("Uramaki kremowe mango", "uramaki"),
    ("Uramaki z sałatką z surimi i łososiem", "uramaki"),
    ("Uramaki z polędwiczką z kurczaka w sezamie kimchi", "uramaki"),
    ("Uramaki z karmazynem w tempurze i masago arare", "uramaki"),
    ("Uramaki z polędwiczką z kurczaka i sosem crunchy cheddar", "uramaki"),
]
for i, (name, kind) in enumerate(PROMO, 1):
    ITEMS.append((f"mi_promo_2025_12_{i:02d}", "promo", kind, None, name, None, None, "to_check", "src_koku_promo_2025_12", []))

TIER_LABEL = {"standard": "karta standardowa", "premium": "karta premium", "seasonal": "wkładka sezonowa", "promo": "promocje"}


def q(v):
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


out = [
    "-- GENERATED by scripts/build-koku-import.py — do not edit by hand.",
    "-- Public KOKU materials (retrieved 2026-11-16). All rows: status needs_verification.",
]
for sid, title, ref, notes in SOURCES:
    out.append(
        f"INSERT INTO sources (id, type, title, reference, notes, retrieved_at, is_private) VALUES "
        f"({q(sid)}, 'official_material', {q(title)}, {q(ref)}, {q(notes)}, {q(RETRIEVED)}, 0);"
    )
out.append(
    f"INSERT INTO menu_versions (id, label, valid_from, is_current, notes) VALUES ({q(MENU_VERSION)}, "
    f"'Materiały publiczne KOKU (pobrane 16.11.2026)', NULL, 1, "
    f"'Zestawienie z publicznych materiałów KOKU. Karta standardowa w źródłach ma tylko numery pozycji — wymaga uzupełnienia. Każdą pozycję sprawdź z kartą w lokalu.');"
)

cats = sorted({(t, k) for _, t, k, *_ in ITEMS})
for tier, kind in cats:
    out.append(
        f"INSERT INTO menu_categories (id, menu_version_id, tier, kind) VALUES "
        f"({q(f'mc_{MENU_VERSION}_{tier}_{kind}')}, {q(MENU_VERSION)}, {q(tier)}, {q(kind)});"
    )

for item_id, tier, kind, code, name, portion, price, currency, src, comps in ITEMS:
    cat = f"mc_{MENU_VERSION}_{tier}_{kind}"
    price_gr = None if price is None else round(price * 100)
    out.append(
        "INSERT INTO menu_items (id, menu_category_id, code, name, portion, price_grosze, components_complete, currency_status, status, source_id) VALUES "
        f"({q(item_id)}, {q(cat)}, {q(code)}, {q(name)}, {q(portion)}, {q(price_gr)}, 0, {q(currency)}, 'needs_verification', {q(src)});"
    )
    for i, label in enumerate(comps):
        out.append(
            "INSERT INTO menu_item_components (id, menu_item_id, role, label, status, sort_order) VALUES "
            f"({q(f'{item_id}_c{i:02d}')}, {q(item_id)}, 'ingredient', {q(label)}, 'needs_verification', {i});"
        )
    body = " ".join([TIER_LABEL[tier], ", ".join(comps)]).strip()
    out.append(
        "INSERT INTO search_index (entity_type, entity_id, owner_id, title, body, folded) VALUES "
        f"('menu_item', {q(item_id)}, NULL, {q(name)}, {q(body)}, {q(fold(name + ' ' + body))});"
    )

for sid, title, _, notes in SOURCES:
    out.append(
        "INSERT INTO search_index (entity_type, entity_id, owner_id, title, body, folded) VALUES "
        f"('source', {q(sid)}, NULL, {q(title)}, {q(notes)}, {q(fold(title + ' ' + notes))});"
    )

sql = "\n--> statement-breakpoint\n".join(out[2:])
Path("migrations/0004_koku_public_materials.sql").write_text("\n".join(out[:2]) + "\n" + sql + "\n", encoding="utf-8")
print(f"{len(ITEMS)} menu items, {len(SOURCES)} sources")
