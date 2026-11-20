ALTER TABLE `pest_checks` ADD `signed_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `shift_handovers` ADD `signed_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `shift_handovers` ADD `acknowledged_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `temperature_logs` ADD `signed_name` text DEFAULT '' NOT NULL;