CREATE TABLE `portfolio_recap_snapshots` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`as_of_date` date NOT NULL,
	`sequence` int NOT NULL,
	`bank_idr` decimal(30,8) NOT NULL DEFAULT '0',
	`rdpu_idr` decimal(30,8) NOT NULL DEFAULT '0',
	`ihsg_idr` decimal(30,8) NOT NULL DEFAULT '0',
	`sp500_idr` decimal(30,8) NOT NULL DEFAULT '0',
	`btc_idr` decimal(30,8) NOT NULL DEFAULT '0',
	`eth_idr` decimal(30,8) NOT NULL DEFAULT '0',
	`altcoin_idr` decimal(30,8) NOT NULL DEFAULT '0',
	`gold_idr` decimal(30,8) NOT NULL DEFAULT '0',
	`idr_per_usd` decimal(30,8),
	`source` enum('MANUAL','HYBRID_PREFILL','XLSX_IMPORT') NOT NULL DEFAULT 'MANUAL',
	`prefill_metadata` json,
	`note` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `portfolio_recap_snapshots_id` PRIMARY KEY(`id`),
	CONSTRAINT `portfolio_recap_snapshots_user_date_sequence_unique` UNIQUE(`user_id`,`as_of_date`,`sequence`)
);
ALTER TABLE `portfolio_recap_snapshots` ADD CONSTRAINT `portfolio_recap_snapshots_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `portfolio_recap_snapshots_user_date_idx` ON `portfolio_recap_snapshots` (`user_id`,`as_of_date`);--> statement-breakpoint
