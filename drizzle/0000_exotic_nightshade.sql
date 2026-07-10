CREATE TABLE `accounts` (
	`id` char(36) NOT NULL,
	`account_id` varchar(255) NOT NULL,
	`provider_id` varchar(120) NOT NULL,
	`user_id` char(36) NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` datetime(3),
	`refresh_token_expires_at` datetime(3),
	`scope` text,
	`password` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `accounts_provider_account_unique` UNIQUE(`provider_id`,`account_id`)
);
--> statement-breakpoint
CREATE TABLE `ai_conversations` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`title` varchar(255) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`deleted_at` datetime(3),
	CONSTRAINT `ai_conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ai_messages` (
	`id` char(36) NOT NULL,
	`conversation_id` char(36) NOT NULL,
	`role` enum('USER','ASSISTANT') NOT NULL,
	`content` text NOT NULL,
	`source_summary` json,
	`investment_related` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `ai_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ai_tool_calls` (
	`id` char(36) NOT NULL,
	`ai_message_id` char(36) NOT NULL,
	`tool_name` varchar(120) NOT NULL,
	`status` enum('STARTED','SUCCEEDED','FAILED','DENIED') NOT NULL,
	`request_summary` json NOT NULL,
	`result_summary` json,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `ai_tool_calls_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `alerts` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`token_flow_event_id` char(36),
	`alert_type` varchar(80) NOT NULL,
	`severity` enum('INFO','WARNING','HIGH_RISK') NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`status` enum('UNREAD','READ') NOT NULL DEFAULT 'UNREAD',
	`cooldown_key` varchar(255),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`read_at` datetime(3),
	CONSTRAINT `alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `api_rate_limits` (
	`rate_key` varchar(255) NOT NULL,
	`window_started_at` datetime(3) NOT NULL,
	`request_count` int NOT NULL DEFAULT 1,
	`expires_at` datetime(3) NOT NULL,
	CONSTRAINT `api_rate_limits_rate_key_window_started_at_pk` PRIMARY KEY(`rate_key`,`window_started_at`)
);
--> statement-breakpoint
CREATE TABLE `auth_rate_limits` (
	`id` char(36) NOT NULL,
	`rate_key` varchar(255) NOT NULL,
	`request_count` int NOT NULL,
	`last_request` bigint NOT NULL,
	CONSTRAINT `auth_rate_limits_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_rate_limits_key_unique` UNIQUE(`rate_key`)
);
--> statement-breakpoint
CREATE TABLE `data_sources` (
	`id` char(36) NOT NULL,
	`provider` varchar(80) NOT NULL,
	`source_url` varchar(1000) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `data_sources_id` PRIMARY KEY(`id`),
	CONSTRAINT `data_sources_provider_unique` UNIQUE(`provider`)
);
--> statement-breakpoint
CREATE TABLE `import_batches` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`source` enum('MONEY_LOVER','PORTFOLIO_CSV') NOT NULL,
	`status` enum('PREVIEW','CONFIRMED','FAILED','CANCELLED') NOT NULL DEFAULT 'PREVIEW',
	`file_name` varchar(255) NOT NULL,
	`checksum` char(64) NOT NULL,
	`mapping` json,
	`accepted_rows` int NOT NULL DEFAULT 0,
	`duplicate_rows` int NOT NULL DEFAULT 0,
	`invalid_rows` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`confirmed_at` datetime(3),
	CONSTRAINT `import_batches_id` PRIMARY KEY(`id`),
	CONSTRAINT `import_batches_user_checksum_unique` UNIQUE(`user_id`,`source`,`checksum`)
);
--> statement-breakpoint
CREATE TABLE `import_rows` (
	`id` char(36) NOT NULL,
	`batch_id` char(36) NOT NULL,
	`row_number` int NOT NULL,
	`status` enum('ACCEPTED','DUPLICATE','INVALID') NOT NULL,
	`fingerprint` char(64),
	`normalized` json,
	`issues` json NOT NULL,
	CONSTRAINT `import_rows_id` PRIMARY KEY(`id`),
	CONSTRAINT `import_rows_batch_row_unique` UNIQUE(`batch_id`,`row_number`)
);
--> statement-breakpoint
CREATE TABLE `job_runs` (
	`id` char(36) NOT NULL,
	`job_name` varchar(120) NOT NULL,
	`idempotency_key` varchar(255) NOT NULL,
	`status` enum('RUNNING','SUCCEEDED','FAILED') NOT NULL,
	`started_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`completed_at` datetime(3),
	`result_summary` json,
	`error_message` text,
	CONSTRAINT `job_runs_id` PRIMARY KEY(`id`),
	CONSTRAINT `job_runs_name_idempotency_unique` UNIQUE(`job_name`,`idempotency_key`)
);
--> statement-breakpoint
CREATE TABLE `market_snapshots` (
	`id` char(36) NOT NULL,
	`data_source_id` char(36) NOT NULL,
	`instrument` varchar(40) NOT NULL,
	`snapshot_type` enum('TICKER','DAILY_CANDLE','DEX_PAIR','FX') NOT NULL,
	`observed_at` datetime(3) NOT NULL,
	`fetched_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`freshness_status` enum('FRESH','DELAYED','STALE','MISSING') NOT NULL,
	`payload` json NOT NULL,
	`payload_hash` char(64) NOT NULL,
	CONSTRAINT `market_snapshots_id` PRIMARY KEY(`id`),
	CONSTRAINT `market_snapshots_source_hash_unique` UNIQUE(`data_source_id`,`snapshot_type`,`payload_hash`)
);
--> statement-breakpoint
CREATE TABLE `portfolio_transactions` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`import_batch_id` char(36),
	`asset_symbol` varchar(20) NOT NULL,
	`transaction_type` enum('BUY','SELL','TRANSFER_IN','TRANSFER_OUT','REWARD','AIRDROP','FEE') NOT NULL,
	`quantity` decimal(38,18) NOT NULL,
	`unit_price_usd` decimal(30,8) NOT NULL,
	`total_value_usd` decimal(30,8) NOT NULL,
	`fee_usd` decimal(30,8) NOT NULL DEFAULT '0',
	`venue` varchar(160) NOT NULL DEFAULT 'Manual',
	`note` text,
	`executed_at` datetime(3) NOT NULL,
	`fingerprint` char(64),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `portfolio_transactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `portfolio_transactions_user_fingerprint_unique` UNIQUE(`user_id`,`fingerprint`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` char(36) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`token` varchar(255) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`ip_address` varchar(64),
	`user_agent` text,
	`user_id` char(36) NOT NULL,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `sessions_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `signal_evidence` (
	`id` char(36) NOT NULL,
	`signal_id` char(36) NOT NULL,
	`market_snapshot_id` char(36),
	`group_name` varchar(120) NOT NULL,
	`rule_name` varchar(180) NOT NULL,
	`weight_pct` decimal(8,4) NOT NULL,
	`score` decimal(8,4) NOT NULL,
	`value` varchar(255) NOT NULL,
	`interpretation` text NOT NULL,
	`source_label` varchar(255) NOT NULL,
	`source_url` varchar(1000) NOT NULL,
	`observed_at` datetime(3) NOT NULL,
	`evidence_kind` enum('OBSERVED','CALCULATED','INFERRED','UNVERIFIED','STALE') NOT NULL,
	`details` json,
	CONSTRAINT `signal_evidence_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `signal_rule_versions` (
	`id` char(36) NOT NULL,
	`version` varchar(80) NOT NULL,
	`configuration` json NOT NULL,
	`active` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `signal_rule_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `signal_rule_versions_version_unique` UNIQUE(`version`)
);
--> statement-breakpoint
CREATE TABLE `signals` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`rule_version_id` char(36) NOT NULL,
	`instrument` varchar(40) NOT NULL,
	`action` enum('BUY','SELL','WATCH') NOT NULL,
	`composite_score` decimal(8,4) NOT NULL,
	`confidence` decimal(8,4) NOT NULL,
	`freshness_status` enum('FRESH','DELAYED','STALE','MISSING') NOT NULL,
	`summary` text NOT NULL,
	`price_usd` decimal(30,8) NOT NULL,
	`change_24h_pct` decimal(8,4) NOT NULL,
	`evaluated_at` datetime(3) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `signals_id` PRIMARY KEY(`id`),
	CONSTRAINT `signals_user_instrument_evaluated_unique` UNIQUE(`user_id`,`instrument`,`evaluated_at`)
);
--> statement-breakpoint
CREATE TABLE `spending_transactions` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`import_batch_id` char(36),
	`occurred_on` date NOT NULL,
	`amount` decimal(30,8) NOT NULL,
	`currency` enum('USD','IDR','EUR') NOT NULL,
	`direction` enum('INCOME','EXPENSE') NOT NULL,
	`category` varchar(160) NOT NULL DEFAULT 'Uncategorized',
	`account` varchar(160) NOT NULL DEFAULT 'Imported',
	`note` text,
	`fingerprint` char(64),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `spending_transactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `spending_transactions_user_fingerprint_unique` UNIQUE(`user_id`,`fingerprint`)
);
--> statement-breakpoint
CREATE TABLE `token_flow_event_wallets` (
	`token_flow_event_id` char(36) NOT NULL,
	`watchlist_wallet_id` char(36) NOT NULL,
	CONSTRAINT `token_flow_event_wallets_token_flow_event_id_watchlist_wallet_id_pk` PRIMARY KEY(`token_flow_event_id`,`watchlist_wallet_id`)
);
--> statement-breakpoint
CREATE TABLE `token_flow_events` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`chain` varchar(40) NOT NULL,
	`token_address` varchar(128) NOT NULL,
	`token_symbol` varchar(40) NOT NULL,
	`token_name` varchar(160) NOT NULL,
	`dex_pair` varchar(160) NOT NULL,
	`entry_status` enum('EARLY','CONFIRMED','EXTENDED','AVOID') NOT NULL,
	`smart_money_score` decimal(8,4) NOT NULL,
	`qualified_wallet_count` int NOT NULL,
	`net_buy_usd` decimal(30,8) NOT NULL,
	`price_change_since_first_buy` decimal(8,4) NOT NULL,
	`liquidity_usd` decimal(30,8) NOT NULL,
	`volume_24h_usd` decimal(30,8) NOT NULL,
	`first_detected_at` datetime(3) NOT NULL,
	`evaluated_at` datetime(3) NOT NULL,
	`risk_factors` json NOT NULL,
	`source_links` json NOT NULL,
	`evidence` json NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `token_flow_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `token_flow_events_user_token_evaluated_unique` UNIQUE(`user_id`,`chain`,`token_address`,`evaluated_at`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` char(36) NOT NULL,
	`name` varchar(160) NOT NULL,
	`email` varchar(320) NOT NULL,
	`email_verified` boolean NOT NULL DEFAULT false,
	`image` text,
	`display_currency` enum('USD','IDR','EUR') NOT NULL DEFAULT 'USD',
	`timezone` varchar(80) NOT NULL DEFAULT 'UTC',
	`disclaimer_accepted` boolean NOT NULL DEFAULT false,
	`onboarding_complete` boolean NOT NULL DEFAULT false,
	`workspace_seeded_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `verifications` (
	`id` char(36) NOT NULL,
	`identifier` varchar(255) NOT NULL,
	`value` text NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `verifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wallet_events` (
	`id` char(36) NOT NULL,
	`watchlist_wallet_id` char(36) NOT NULL,
	`chain` varchar(40) NOT NULL,
	`transaction_hash` varchar(128) NOT NULL,
	`event_type` enum('BUY','SELL','TRANSFER_IN','TRANSFER_OUT') NOT NULL,
	`token_address` varchar(128) NOT NULL,
	`token_symbol` varchar(40) NOT NULL,
	`token_quantity` decimal(38,18) NOT NULL,
	`value_usd` decimal(30,8) NOT NULL,
	`occurred_at` datetime(3) NOT NULL,
	`source_url` varchar(1000) NOT NULL,
	`raw_payload` json NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `wallet_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `wallet_events_wallet_tx_token_unique` UNIQUE(`watchlist_wallet_id`,`transaction_hash`,`token_address`)
);
--> statement-breakpoint
CREATE TABLE `watchlist_wallets` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`chain` enum('Bitcoin','Ethereum','Base','Arbitrum') NOT NULL,
	`address` varchar(128) NOT NULL,
	`label` varchar(160) NOT NULL,
	`classification` enum('USER_VERIFIED','PUBLICLY_ATTRIBUTED','HIGH_PERFORMANCE_PROXY','UNVERIFIED_WHALE','EXCLUDED') NOT NULL,
	`quality_score` decimal(8,4) NOT NULL DEFAULT '0',
	`win_rate_pct` decimal(8,4),
	`closed_positions` int,
	`median_holding_minutes` int,
	`enabled` boolean NOT NULL DEFAULT true,
	`last_checked_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `watchlist_wallets_id` PRIMARY KEY(`id`),
	CONSTRAINT `watchlist_wallets_user_chain_address_unique` UNIQUE(`user_id`,`chain`,`address`)
);
--> statement-breakpoint
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ai_conversations` ADD CONSTRAINT `ai_conversations_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ai_messages` ADD CONSTRAINT `ai_messages_conversation_id_ai_conversations_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `ai_conversations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ai_tool_calls` ADD CONSTRAINT `ai_tool_calls_ai_message_id_ai_messages_id_fk` FOREIGN KEY (`ai_message_id`) REFERENCES `ai_messages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `alerts` ADD CONSTRAINT `alerts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `alerts` ADD CONSTRAINT `alerts_token_flow_event_id_token_flow_events_id_fk` FOREIGN KEY (`token_flow_event_id`) REFERENCES `token_flow_events`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `import_batches` ADD CONSTRAINT `import_batches_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `import_rows` ADD CONSTRAINT `import_rows_batch_id_import_batches_id_fk` FOREIGN KEY (`batch_id`) REFERENCES `import_batches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `market_snapshots` ADD CONSTRAINT `market_snapshots_data_source_id_data_sources_id_fk` FOREIGN KEY (`data_source_id`) REFERENCES `data_sources`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `portfolio_transactions` ADD CONSTRAINT `portfolio_transactions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `portfolio_transactions` ADD CONSTRAINT `portfolio_transactions_import_batch_id_import_batches_id_fk` FOREIGN KEY (`import_batch_id`) REFERENCES `import_batches`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `signal_evidence` ADD CONSTRAINT `signal_evidence_signal_id_signals_id_fk` FOREIGN KEY (`signal_id`) REFERENCES `signals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `signal_evidence` ADD CONSTRAINT `signal_evidence_market_snapshot_id_market_snapshots_id_fk` FOREIGN KEY (`market_snapshot_id`) REFERENCES `market_snapshots`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `signals` ADD CONSTRAINT `signals_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `signals` ADD CONSTRAINT `signals_rule_version_id_signal_rule_versions_id_fk` FOREIGN KEY (`rule_version_id`) REFERENCES `signal_rule_versions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `spending_transactions` ADD CONSTRAINT `spending_transactions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `spending_transactions` ADD CONSTRAINT `spending_transactions_import_batch_id_import_batches_id_fk` FOREIGN KEY (`import_batch_id`) REFERENCES `import_batches`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `token_flow_event_wallets` ADD CONSTRAINT `token_flow_event_wallets_token_flow_event_id_token_flow_events_id_fk` FOREIGN KEY (`token_flow_event_id`) REFERENCES `token_flow_events`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `token_flow_event_wallets` ADD CONSTRAINT `token_flow_event_wallets_watchlist_wallet_id_watchlist_wallets_id_fk` FOREIGN KEY (`watchlist_wallet_id`) REFERENCES `watchlist_wallets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `token_flow_events` ADD CONSTRAINT `token_flow_events_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wallet_events` ADD CONSTRAINT `wallet_events_watchlist_wallet_id_watchlist_wallets_id_fk` FOREIGN KEY (`watchlist_wallet_id`) REFERENCES `watchlist_wallets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `watchlist_wallets` ADD CONSTRAINT `watchlist_wallets_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `accounts_user_id_idx` ON `accounts` (`user_id`);--> statement-breakpoint
CREATE INDEX `ai_conversations_user_updated_idx` ON `ai_conversations` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `ai_messages_conversation_created_idx` ON `ai_messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ai_tool_calls_message_idx` ON `ai_tool_calls` (`ai_message_id`);--> statement-breakpoint
CREATE INDEX `alerts_user_created_idx` ON `alerts` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `alerts_user_cooldown_idx` ON `alerts` (`user_id`,`cooldown_key`,`created_at`);--> statement-breakpoint
CREATE INDEX `api_rate_limits_expires_idx` ON `api_rate_limits` (`expires_at`);--> statement-breakpoint
CREATE INDEX `import_batches_user_created_idx` ON `import_batches` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `import_rows_batch_status_idx` ON `import_rows` (`batch_id`,`status`);--> statement-breakpoint
CREATE INDEX `market_snapshots_instrument_observed_idx` ON `market_snapshots` (`instrument`,`observed_at`);--> statement-breakpoint
CREATE INDEX `portfolio_transactions_user_executed_idx` ON `portfolio_transactions` (`user_id`,`executed_at`);--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `signal_evidence_signal_idx` ON `signal_evidence` (`signal_id`);--> statement-breakpoint
CREATE INDEX `signals_user_instrument_evaluated_idx` ON `signals` (`user_id`,`instrument`,`evaluated_at`);--> statement-breakpoint
CREATE INDEX `spending_transactions_user_date_idx` ON `spending_transactions` (`user_id`,`occurred_on`);--> statement-breakpoint
CREATE INDEX `token_flow_event_wallets_wallet_idx` ON `token_flow_event_wallets` (`watchlist_wallet_id`);--> statement-breakpoint
CREATE INDEX `token_flow_events_user_evaluated_idx` ON `token_flow_events` (`user_id`,`evaluated_at`);--> statement-breakpoint
CREATE INDEX `verifications_identifier_idx` ON `verifications` (`identifier`);--> statement-breakpoint
CREATE INDEX `wallet_events_wallet_occurred_idx` ON `wallet_events` (`watchlist_wallet_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `watchlist_wallets_user_enabled_idx` ON `watchlist_wallets` (`user_id`,`enabled`);