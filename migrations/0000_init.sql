CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `accounts_user_id_idx` ON `accounts` (`user_id`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`metadata` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_logs_created_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_actor_idx` ON `audit_logs` (`actor_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `competencies` (
	`id` text PRIMARY KEY NOT NULL,
	`level_id` text NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`sort_order` integer NOT NULL,
	FOREIGN KEY (`level_id`) REFERENCES `levels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `competencies_key_unique` ON `competencies` (`key`);--> statement-breakpoint
CREATE INDEX `competencies_level_idx` ON `competencies` (`level_id`);--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`role_key` text NOT NULL,
	`location_id` text,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`accepted_user_id` text,
	`revoked_at` integer,
	`invited_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`role_key`) REFERENCES `roles`(`key`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`accepted_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_token_hash_unique` ON `invitations` (`token_hash`);--> statement-breakpoint
CREATE INDEX `invitations_email_idx` ON `invitations` (`email`);--> statement-breakpoint
CREATE TABLE `knowledge_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`parent_id` text,
	`sort_order` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `knowledge_categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_categories_slug_unique` ON `knowledge_categories` (`slug`);--> statement-breakpoint
CREATE INDEX `knowledge_categories_parent_idx` ON `knowledge_categories` (`parent_id`);--> statement-breakpoint
CREATE TABLE `levels` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`sort_order` integer NOT NULL,
	`mastery_threshold` integer NOT NULL,
	`min_evidence` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `levels_key_unique` ON `levels` (`key`);--> statement-breakpoint
CREATE TABLE `locations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`city` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`location_id` text,
	`role_key` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`created_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_key`) REFERENCES `roles`(`key`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_user_location_uq` ON `memberships` (`user_id`,`location_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_user_global_uq` ON `memberships` (`user_id`) WHERE location_id IS NULL;--> statement-breakpoint
CREATE INDEX `memberships_location_idx` ON `memberships` (`location_id`);--> statement-breakpoint
CREATE TABLE `passkeys` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`public_key` text NOT NULL,
	`user_id` text NOT NULL,
	`credential_id` text NOT NULL,
	`counter` integer NOT NULL,
	`device_type` text NOT NULL,
	`backed_up` integer NOT NULL,
	`transports` text,
	`created_at` integer,
	`aaguid` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `passkeys_user_id_idx` ON `passkeys` (`user_id`);--> statement-breakpoint
CREATE INDEX `passkeys_credential_id_idx` ON `passkeys` (`credential_id`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`count` integer NOT NULL,
	`last_request` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rate_limits_key_unique` ON `rate_limits` (`key`);--> statement-breakpoint
CREATE TABLE `roles` (
	`key` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`rank` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `user_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`display_name` text,
	`position` text,
	`target_level_id` text,
	`theme` text DEFAULT 'system' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_level_id`) REFERENCES `levels`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verifications_identifier_idx` ON `verifications` (`identifier`);