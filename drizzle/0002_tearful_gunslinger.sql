CREATE TABLE `btc_strategy_profiles` (
	`user_id` char(36) NOT NULL,
	`active_rule_version_id` char(36),
	`sleeve_budget_usd` decimal(30,8),
	`cash_balance_usd` decimal(30,8) NOT NULL DEFAULT '0',
	`btc_quantity` decimal(38,18) NOT NULL DEFAULT '0',
	`model_allocation_pct` decimal(8,4) NOT NULL DEFAULT '0',
	`lifecycle_status` enum('CANDIDATE','SHADOW','VALIDATED','DEGRADED','REJECTED','PAUSED') NOT NULL DEFAULT 'CANDIDATE',
	`shadow_started_at` datetime(3),
	`last_model_change_at` datetime(3),
	`recovering_from_hard_exit` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `btc_strategy_profiles_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `market_candles` (
	`id` char(36) NOT NULL,
	`data_source_id` char(36) NOT NULL,
	`instrument` varchar(40) NOT NULL,
	`candle_interval` enum('1D','1H') NOT NULL,
	`open_price` decimal(30,8) NOT NULL,
	`high_price` decimal(30,8) NOT NULL,
	`low_price` decimal(30,8) NOT NULL,
	`close_price` decimal(30,8) NOT NULL,
	`volume` decimal(38,18) NOT NULL,
	`opened_at` datetime(3) NOT NULL,
	`closed_at` datetime(3) NOT NULL,
	`fetched_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`finalized` boolean NOT NULL DEFAULT true,
	`checksum` char(64) NOT NULL,
	CONSTRAINT `market_candles_id` PRIMARY KEY(`id`),
	CONSTRAINT `market_candles_source_instrument_interval_open_unique` UNIQUE(`data_source_id`,`instrument`,`candle_interval`,`opened_at`)
);
--> statement-breakpoint
CREATE TABLE `signal_acknowledgements` (
	`id` char(36) NOT NULL,
	`signal_id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`status` enum('EXECUTED','SKIPPED','EXPIRED') NOT NULL,
	`actual_price_usd` decimal(30,8),
	`actual_quantity_btc` decimal(38,18),
	`actual_fee_usd` decimal(30,8),
	`executed_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `signal_acknowledgements_id` PRIMARY KEY(`id`),
	CONSTRAINT `signal_acknowledgements_signal_unique` UNIQUE(`signal_id`)
);
--> statement-breakpoint
CREATE TABLE `strategy_validation_runs` (
	`id` char(36) NOT NULL,
	`rule_version_id` char(36) NOT NULL,
	`status` enum('RUNNING','PASSED','FAILED') NOT NULL,
	`dataset_started_on` date,
	`dataset_ended_on` date,
	`rule_hash` char(64) NOT NULL,
	`data_hash` char(64),
	`metrics` json NOT NULL,
	`failure_reasons` json NOT NULL,
	`started_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`completed_at` datetime(3),
	CONSTRAINT `strategy_validation_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `signal_rule_versions` ADD `lifecycle_status` enum('CANDIDATE','SHADOW','VALIDATED','DEGRADED','REJECTED','RETIRED') DEFAULT 'CANDIDATE' NOT NULL;--> statement-breakpoint
ALTER TABLE `signal_rule_versions` ADD `rule_hash` char(64);--> statement-breakpoint
ALTER TABLE `signal_rule_versions` ADD `validated_at` datetime(3);--> statement-breakpoint
ALTER TABLE `signals` ADD `mode` enum('RESEARCH','SHADOW','VALIDATED') DEFAULT 'RESEARCH' NOT NULL;--> statement-breakpoint
ALTER TABLE `signals` ADD `availability` enum('READY','HALTED') DEFAULT 'READY' NOT NULL;--> statement-breakpoint
ALTER TABLE `signals` ADD `agreement_pct` decimal(8,4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `signals` ADD `target_allocation_pct` decimal(8,4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `signals` ADD `delta_allocation_pct` decimal(8,4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `signals` ADD `recommended_usd` decimal(30,8) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `signals` ADD `recommended_btc` decimal(38,18) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `signals` ADD `hard_exit` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `signals` ADD `input_hash` char(64);--> statement-breakpoint
ALTER TABLE `btc_strategy_profiles` ADD CONSTRAINT `btc_strategy_profiles_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `btc_strategy_profiles` ADD CONSTRAINT `btc_profiles_rule_fk` FOREIGN KEY (`active_rule_version_id`) REFERENCES `signal_rule_versions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `market_candles` ADD CONSTRAINT `market_candles_data_source_id_data_sources_id_fk` FOREIGN KEY (`data_source_id`) REFERENCES `data_sources`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `signal_acknowledgements` ADD CONSTRAINT `signal_acknowledgements_signal_id_signals_id_fk` FOREIGN KEY (`signal_id`) REFERENCES `signals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `signal_acknowledgements` ADD CONSTRAINT `signal_acknowledgements_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `strategy_validation_runs` ADD CONSTRAINT `strategy_validation_rule_fk` FOREIGN KEY (`rule_version_id`) REFERENCES `signal_rule_versions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `btc_strategy_profiles_rule_idx` ON `btc_strategy_profiles` (`active_rule_version_id`);--> statement-breakpoint
CREATE INDEX `market_candles_instrument_interval_open_idx` ON `market_candles` (`instrument`,`candle_interval`,`opened_at`);--> statement-breakpoint
CREATE INDEX `signal_acknowledgements_user_created_idx` ON `signal_acknowledgements` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `strategy_validation_runs_rule_started_idx` ON `strategy_validation_runs` (`rule_version_id`,`started_at`);
