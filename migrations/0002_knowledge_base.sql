CREATE TABLE `allergens` (
	`id` text PRIMARY KEY NOT NULL,
	`name_pl` text NOT NULL,
	`sort_order` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `content_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`version` integer NOT NULL,
	`snapshot` text NOT NULL,
	`changed_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`changed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_revisions_uq` ON `content_revisions` (`entity_type`,`entity_id`,`version`);--> statement-breakpoint
CREATE TABLE `ingredient_allergens` (
	`ingredient_id` text NOT NULL,
	`allergen_id` text NOT NULL,
	`status` text DEFAULT 'needs_verification' NOT NULL,
	`source_id` text,
	PRIMARY KEY(`ingredient_id`, `allergen_id`),
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`allergen_id`) REFERENCES `allergens`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `ingredient_properties` (
	`id` text PRIMARY KEY NOT NULL,
	`ingredient_id` text NOT NULL,
	`aspect` text NOT NULL,
	`content` text NOT NULL,
	`status` text DEFAULT 'needs_verification' NOT NULL,
	`source_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text,
	`updated_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ingredient_properties_ingredient_idx` ON `ingredient_properties` (`ingredient_id`,`aspect`);--> statement-breakpoint
CREATE TABLE `ingredient_substitutes` (
	`id` text PRIMARY KEY NOT NULL,
	`ingredient_id` text NOT NULL,
	`substitute_id` text NOT NULL,
	`context` text,
	`consequences` text,
	`status` text DEFAULT 'needs_verification' NOT NULL,
	`source_id` text,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`substitute_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ingredient_substitutes_uq` ON `ingredient_substitutes` (`ingredient_id`,`substitute_id`);--> statement-breakpoint
CREATE TABLE `ingredients` (
	`id` text PRIMARY KEY NOT NULL,
	`name_pl` text NOT NULL,
	`name_key` text NOT NULL,
	`name_original` text,
	`transliteration` text,
	`category_id` text,
	`origin` text,
	`description` text,
	`status` text DEFAULT 'needs_verification' NOT NULL,
	`source_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text,
	`updated_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `knowledge_categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ingredients_name_key_uq` ON `ingredients` (`name_key`);--> statement-breakpoint
CREATE INDEX `ingredients_category_idx` ON `ingredients` (`category_id`);--> statement-breakpoint
CREATE TABLE `menu_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`menu_version_id` text NOT NULL,
	`tier` text NOT NULL,
	`kind` text NOT NULL,
	FOREIGN KEY (`menu_version_id`) REFERENCES `menu_versions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `menu_categories_uq` ON `menu_categories` (`menu_version_id`,`tier`,`kind`);--> statement-breakpoint
CREATE TABLE `menu_item_allergens` (
	`menu_item_id` text NOT NULL,
	`allergen_id` text NOT NULL,
	`status` text DEFAULT 'needs_verification' NOT NULL,
	`source_id` text,
	PRIMARY KEY(`menu_item_id`, `allergen_id`),
	FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`allergen_id`) REFERENCES `allergens`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `menu_item_components` (
	`id` text PRIMARY KEY NOT NULL,
	`menu_item_id` text NOT NULL,
	`role` text DEFAULT 'ingredient' NOT NULL,
	`ingredient_id` text,
	`label` text NOT NULL,
	`status` text DEFAULT 'needs_verification' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `menu_item_components_item_idx` ON `menu_item_components` (`menu_item_id`);--> statement-breakpoint
CREATE INDEX `menu_item_components_ingredient_idx` ON `menu_item_components` (`ingredient_id`);--> statement-breakpoint
CREATE TABLE `menu_items` (
	`id` text PRIMARY KEY NOT NULL,
	`menu_category_id` text NOT NULL,
	`code` text,
	`name` text NOT NULL,
	`description` text,
	`technique` text,
	`texture` text,
	`flavor` text,
	`portion` text,
	`price_grosze` integer,
	`components_complete` integer DEFAULT false NOT NULL,
	`currency_status` text DEFAULT 'to_check' NOT NULL,
	`status` text DEFAULT 'needs_verification' NOT NULL,
	`source_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text,
	`updated_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`menu_category_id`) REFERENCES `menu_categories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `menu_items_category_idx` ON `menu_items` (`menu_category_id`);--> statement-breakpoint
CREATE TABLE `menu_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`valid_from` text,
	`valid_to` text,
	`is_current` integer DEFAULT false NOT NULL,
	`notes` text,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `note_links` (
	`id` text PRIMARY KEY NOT NULL,
	`note_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `note_links_uq` ON `note_links` (`note_id`,`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `note_links_target_idx` ON `note_links` (`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`resolved_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notes_owner_idx` ON `notes` (`owner_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `recipe_components` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_recipe_id` text NOT NULL,
	`child_recipe_id` text NOT NULL,
	`amount` real,
	`unit` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`parent_recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`child_recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipe_components_uq` ON `recipe_components` (`parent_recipe_id`,`child_recipe_id`);--> statement-breakpoint
CREATE TABLE `recipe_ingredients` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`ingredient_id` text,
	`label` text NOT NULL,
	`amount` real,
	`unit` text,
	`role` text DEFAULT 'base' NOT NULL,
	`note` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `recipe_ingredients_recipe_idx` ON `recipe_ingredients` (`recipe_id`);--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`yield_text` text,
	`method` text,
	`confidential` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'needs_verification' NOT NULL,
	`source_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `recipes_owner_idx` ON `recipes` (`owner_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`reference` text,
	`notes` text,
	`retrieved_at` text,
	`is_private` integer DEFAULT false NOT NULL,
	`owner_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `sources_owner_idx` ON `sources` (`owner_id`);--> statement-breakpoint
CREATE TABLE `techniques` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`category_id` text,
	`description` text,
	`status` text DEFAULT 'needs_verification' NOT NULL,
	`source_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text,
	`updated_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `knowledge_categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `techniques_name_key_uq` ON `techniques` (`name_key`);