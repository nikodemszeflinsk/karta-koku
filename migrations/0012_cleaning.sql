CREATE TABLE `cleaning_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text,
	`task_label` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`signed_name` text DEFAULT '' NOT NULL,
	`author_id` text,
	`done_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `cleaning_tasks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `cleaning_logs_done_idx` ON `cleaning_logs` (`done_at`);--> statement-breakpoint
CREATE TABLE `cleaning_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
