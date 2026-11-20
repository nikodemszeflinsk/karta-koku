CREATE TABLE `stock_sheet_extras` (
	`id` text PRIMARY KEY NOT NULL,
	`sheet_id` text NOT NULL,
	`text` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`sheet_id`) REFERENCES `stock_sheets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `stock_sheet_extras_sheet_idx` ON `stock_sheet_extras` (`sheet_id`);