CREATE TABLE `ai_model_configs` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`label` varchar(120) NOT NULL,
	`provider` enum('OPENAI','ANTHROPIC','KIMI','OPENAI_COMPATIBLE') NOT NULL,
	`model` varchar(180) NOT NULL,
	`endpoint_url` varchar(500) NOT NULL,
	`api_key_ciphertext` text NOT NULL,
	`api_key_hint` varchar(12) NOT NULL,
	`active` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `ai_model_configs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `ai_model_configs` ADD CONSTRAINT `ai_model_configs_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ai_model_configs_user_updated_idx` ON `ai_model_configs` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `ai_model_configs_user_active_idx` ON `ai_model_configs` (`user_id`,`active`);