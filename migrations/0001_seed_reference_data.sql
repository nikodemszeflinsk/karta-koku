-- Reference data: roles, the 17 Academy categories, the 4 career levels and their
-- competencies. Content comes verbatim from the project specification; no culinary
-- facts are asserted here. Thresholds are initial values the owner can tune later.

INSERT INTO roles (key, name, rank) VALUES
  ('owner', 'Właściciel', 100),
  ('admin', 'Administrator', 80),
  ('trainer', 'Trener', 50),
  ('learner', 'Uczestnik', 10);
--> statement-breakpoint
INSERT INTO knowledge_categories (id, slug, name, sort_order) VALUES
  ('cat_ryz', 'ryz', 'Ryż i jego technologia', 1),
  ('cat_nori', 'nori-algi', 'Nori i produkty z alg', 2),
  ('cat_ryby', 'ryby-owoce-morza', 'Ryby i owoce morza', 3),
  ('cat_mieso', 'miesa-drob', 'Mięsa i produkty drobiowe', 4),
  ('cat_warzywa', 'warzywa-owoce', 'Warzywa i owoce', 5),
  ('cat_ciasta', 'ciasta-pierozki-dim-sum', 'Ciasta, pierożki i dim sum', 6),
  ('cat_skrobie', 'skrobie-maki-zagestniki', 'Skrobie, mąki i zagęstniki', 7),
  ('cat_sosy', 'sosy-dressingi-marynaty', 'Sosy, dressingi i marynaty', 8),
  ('cat_posypki', 'posypki-przyprawy-dodatki', 'Posypki, przyprawy i dodatki', 9),
  ('cat_panierki', 'panierki-smazenie', 'Panierki i produkty smażone', 10),
  ('cat_termiczna', 'obrobka-termiczna', 'Techniki obróbki termicznej', 11),
  ('cat_fermentacja', 'fermentacja-konserwowanie', 'Fermentacja, marynowanie i konserwowanie', 12),
  ('cat_tekstury', 'tekstury-wlasciwosci', 'Tekstury i właściwości produktów', 13),
  ('cat_higiena', 'higiena-bezpieczenstwo', 'Higiena, bezpieczeństwo i przechowywanie', 14),
  ('cat_organizacja', 'organizacja-mise-en-place', 'Organizacja produkcji i mise en place', 15),
  ('cat_jakosc', 'kontrola-jakosci', 'Kontrola jakości', 16),
  ('cat_koku', 'karta-koku', 'Karta KOKU', 17);
--> statement-breakpoint
INSERT INTO levels (id, key, name, description, sort_order, mastery_threshold, min_evidence) VALUES
  ('lvl_advanced_cook', 'advanced_cook', 'Kucharz zaawansowany', 'Rozumienie surowców, technologii, procesów i jakości produktu.', 1, 75, 5),
  ('lvl_chef', 'chef', 'Chef', 'Standaryzacja, powtarzalność, organizacja stanowiska i szkolenie innych.', 2, 75, 5),
  ('lvl_sous_chef', 'sous_chef', 'Sous chef', 'Planowanie produkcji, zarządzanie zmianą, zamówienia, straty i food cost.', 3, 80, 6),
  ('lvl_head_chef', 'head_chef', 'Head chef', 'Zarządzanie kuchnią, rentownością, menu i zespołem.', 4, 80, 6);
--> statement-breakpoint
INSERT INTO competencies (id, level_id, key, name, sort_order) VALUES
  ('cmp_ac_raw_materials', 'lvl_advanced_cook', 'ac_raw_materials', 'Skład i właściwości surowców', 1),
  ('cmp_ac_technology', 'lvl_advanced_cook', 'ac_technology', 'Technologia przygotowania', 2),
  ('cmp_ac_processes', 'lvl_advanced_cook', 'ac_processes', 'Procesy obróbki', 3),
  ('cmp_ac_textures', 'lvl_advanced_cook', 'ac_textures', 'Tekstury', 4),
  ('cmp_ac_production_errors', 'lvl_advanced_cook', 'ac_production_errors', 'Błędy produkcyjne', 5),
  ('cmp_ac_quality', 'lvl_advanced_cook', 'ac_quality', 'Kontrola jakości', 6),
  ('cmp_ch_standardization', 'lvl_chef', 'ch_standardization', 'Standaryzacja receptur', 1),
  ('cmp_ch_repeatability', 'lvl_chef', 'ch_repeatability', 'Powtarzalność', 2),
  ('cmp_ch_station', 'lvl_chef', 'ch_station', 'Organizacja stanowiska', 3),
  ('cmp_ch_training', 'lvl_chef', 'ch_training', 'Szkolenie innych', 4),
  ('cmp_ch_product_control', 'lvl_chef', 'ch_product_control', 'Kontrola produktu', 5),
  ('cmp_sc_production_planning', 'lvl_sous_chef', 'sc_production_planning', 'Planowanie produkcji', 1),
  ('cmp_sc_shift_management', 'lvl_sous_chef', 'sc_shift_management', 'Zarządzanie zmianą', 2),
  ('cmp_sc_team_quality', 'lvl_sous_chef', 'sc_team_quality', 'Kontrola jakości zespołu', 3),
  ('cmp_sc_ordering', 'lvl_sous_chef', 'sc_ordering', 'Zamówienia', 4),
  ('cmp_sc_waste', 'lvl_sous_chef', 'sc_waste', 'Straty', 5),
  ('cmp_sc_food_cost', 'lvl_sous_chef', 'sc_food_cost', 'Food cost', 6),
  ('cmp_hc_kitchen_management', 'lvl_head_chef', 'hc_kitchen_management', 'Zarządzanie kuchnią', 1),
  ('cmp_hc_profitability', 'lvl_head_chef', 'hc_profitability', 'Rentowność', 2),
  ('cmp_hc_work_organization', 'lvl_head_chef', 'hc_work_organization', 'Organizacja pracy', 3),
  ('cmp_hc_menu_development', 'lvl_head_chef', 'hc_menu_development', 'Rozwój menu', 4),
  ('cmp_hc_standardization', 'lvl_head_chef', 'hc_standardization', 'Standaryzacja', 5),
  ('cmp_hc_team_management', 'lvl_head_chef', 'hc_team_management', 'Zarządzanie zespołem', 6);
