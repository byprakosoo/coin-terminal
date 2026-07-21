CREATE TABLE `annual_recap_settings` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`year` int NOT NULL,
	`monthly_salary_idr` decimal(30,8),
	`closing_snapshot_id` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `annual_recap_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `annual_recap_settings_user_year_unique` UNIQUE(`user_id`,`year`)
);
--> statement-breakpoint
CREATE TABLE `gold_transactions` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`transaction_type` enum('BUY','SELL') NOT NULL,
	`occurred_on` date NOT NULL,
	`gold_type` varchar(120) NOT NULL,
	`grams` decimal(38,18) NOT NULL,
	`unit_price_idr` decimal(30,8) NOT NULL,
	`venue` varchar(160),
	`note` text,
	`fingerprint` char(64),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `gold_transactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `gold_transactions_user_fingerprint_unique` UNIQUE(`user_id`,`fingerprint`)
);
--> statement-breakpoint
CREATE TABLE `gold_valuations` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`as_of_date` date NOT NULL,
	`price_per_gram_idr` decimal(30,8) NOT NULL,
	`source` enum('MANUAL','XLSX_IMPORT') NOT NULL DEFAULT 'MANUAL',
	`note` text,
	`fingerprint` char(64),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `gold_valuations_id` PRIMARY KEY(`id`),
	CONSTRAINT `gold_valuations_user_fingerprint_unique` UNIQUE(`user_id`,`fingerprint`)
);
--> statement-breakpoint
ALTER TABLE `annual_recap_settings` ADD CONSTRAINT `annual_recap_settings_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `annual_recap_settings` ADD CONSTRAINT `annual_recap_settings_closing_snapshot_fk` FOREIGN KEY (`closing_snapshot_id`) REFERENCES `portfolio_recap_snapshots`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gold_transactions` ADD CONSTRAINT `gold_transactions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gold_valuations` ADD CONSTRAINT `gold_valuations_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `annual_recap_settings_closing_snapshot_idx` ON `annual_recap_settings` (`closing_snapshot_id`);--> statement-breakpoint
CREATE INDEX `gold_transactions_user_date_idx` ON `gold_transactions` (`user_id`,`occurred_on`);--> statement-breakpoint
CREATE INDEX `gold_valuations_user_date_idx` ON `gold_valuations` (`user_id`,`as_of_date`);
