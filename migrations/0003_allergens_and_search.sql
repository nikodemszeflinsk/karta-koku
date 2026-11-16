-- The 14 allergens listed in Annex II of EU Regulation 1169/2011 (Polish names).
INSERT INTO allergens (id, name_pl, sort_order) VALUES
  ('gluten', 'Zboża zawierające gluten', 1),
  ('crustaceans', 'Skorupiaki', 2),
  ('eggs', 'Jaja', 3),
  ('fish', 'Ryby', 4),
  ('peanuts', 'Orzeszki ziemne (arachidowe)', 5),
  ('soy', 'Soja', 6),
  ('milk', 'Mleko (w tym laktoza)', 7),
  ('nuts', 'Orzechy', 8),
  ('celery', 'Seler', 9),
  ('mustard', 'Gorczyca', 10),
  ('sesame', 'Nasiona sezamu', 11),
  ('sulphites', 'Dwutlenek siarki i siarczyny', 12),
  ('lupin', 'Łubin', 13),
  ('molluscs', 'Mięczaki', 14);
--> statement-breakpoint
-- Full-text search across knowledge. owner_id is NULL for shared content and set for
-- private content (notes, recipes). `folded` holds foldText(title + body) from the app,
-- because unicode61 cannot fold letters without a decomposition (ł -> l).
CREATE VIRTUAL TABLE search_index USING fts5(
  entity_type UNINDEXED,
  entity_id UNINDEXED,
  owner_id UNINDEXED,
  title,
  body,
  folded,
  tokenize = 'unicode61 remove_diacritics 2'
);
