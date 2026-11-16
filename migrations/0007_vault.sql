CREATE TABLE `vault_chunks` (
	`item_id` text NOT NULL,
	`idx` integer NOT NULL,
	`data` blob NOT NULL,
	PRIMARY KEY(`item_id`, `idx`),
	FOREIGN KEY (`item_id`) REFERENCES `vault_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `vault_items` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`meta_ciphertext` text NOT NULL,
	`meta_iv` text NOT NULL,
	`content_iv` text NOT NULL,
	`size` integer NOT NULL,
	`chunks` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `vault_items_owner_idx` ON `vault_items` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `vault_keys` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`kdf` text NOT NULL,
	`wrapped_dek` text NOT NULL,
	`wrapped_dek_iv` text NOT NULL,
	`recovery_wrapped_dek` text NOT NULL,
	`recovery_wrapped_dek_iv` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
