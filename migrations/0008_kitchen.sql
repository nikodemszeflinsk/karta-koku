CREATE TABLE `cold_units` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`min_c` real NOT NULL,
	`max_c` real NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `handover_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pest_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`found` integer DEFAULT false NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`action` text DEFAULT '' NOT NULL,
	`author_id` text,
	`checked_at` integer NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `pest_checks_checked_idx` ON `pest_checks` (`checked_at`);--> statement-breakpoint
CREATE TABLE `shift_handovers` (
	`id` text PRIMARY KEY NOT NULL,
	`shift_date` text NOT NULL,
	`shift` text NOT NULL,
	`author_id` text,
	`prep` text NOT NULL,
	`prep_notes` text DEFAULT '' NOT NULL,
	`shortages` text NOT NULL,
	`shortages_note` text DEFAULT '' NOT NULL,
	`has_failure` integer DEFAULT false NOT NULL,
	`failure_note` text DEFAULT '' NOT NULL,
	`acknowledged_by` text,
	`acknowledged_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`acknowledged_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `shift_handovers_created_idx` ON `shift_handovers` (`created_at`);--> statement-breakpoint
CREATE TABLE `stock_items` (
	`id` text PRIMARY KEY NOT NULL,
	`list` text NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`unit` text DEFAULT 'szt.' NOT NULL,
	`group_name` text DEFAULT '' NOT NULL,
	`par_qty` real,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stock_items_list_name_uq` ON `stock_items` (`list`,`name_key`) WHERE active = 1;--> statement-breakpoint
CREATE TABLE `stock_sheet_lines` (
	`sheet_id` text NOT NULL,
	`item_id` text NOT NULL,
	`qty_have` real,
	`qty_order` real,
	`updated_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`sheet_id`, `item_id`),
	FOREIGN KEY (`sheet_id`) REFERENCES `stock_sheets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `stock_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `stock_sheets` (
	`id` text PRIMARY KEY NOT NULL,
	`list` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_by` text,
	`closed_by` text,
	`closed_at` integer,
	`summary` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`closed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stock_sheets_open_uq` ON `stock_sheets` (`list`) WHERE status = 'open';--> statement-breakpoint
CREATE INDEX `stock_sheets_list_idx` ON `stock_sheets` (`list`,`closed_at`);--> statement-breakpoint
CREATE TABLE `temperature_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`unit_id` text NOT NULL,
	`temp_c` real NOT NULL,
	`min_c` real NOT NULL,
	`max_c` real NOT NULL,
	`in_range` integer NOT NULL,
	`corrective_action` text DEFAULT '' NOT NULL,
	`author_id` text,
	`measured_at` integer NOT NULL,
	FOREIGN KEY (`unit_id`) REFERENCES `cold_units`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `temperature_logs_measured_idx` ON `temperature_logs` (`measured_at`);--> statement-breakpoint
CREATE INDEX `temperature_logs_unit_idx` ON `temperature_logs` (`unit_id`,`measured_at`);--> statement-breakpoint
-- Default "przygotowanie do serwisu" checklist (generic; the owner edits it in the app).
INSERT INTO `handover_checks` (`id`, `label`, `sort_order`) VALUES
  ('hc_ryz', 'Ryż ugotowany, zaprawiony, w temperaturze roboczej', 1),
  ('hc_ryby', 'Ryby i owoce morza porcjowane, w chłodzeniu', 2),
  ('hc_warzywa', 'Warzywa i dodatki pokrojone', 3),
  ('hc_sosy', 'Sosy i posypki uzupełnione', 4),
  ('hc_nori', 'Nori i opakowania uzupełnione', 5),
  ('hc_etykiety', 'Pojemniki opisane (data, godzina), FIFO sprawdzone', 6),
  ('hc_czystosc', 'Stanowisko i deski czyste, noże naostrzone', 7);
