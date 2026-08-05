CREATE TABLE `ai_oauth_device_logins` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`provider` enum('OPENAI_CODEX') NOT NULL,
	`device_auth_id` varchar(255) NOT NULL,
	`user_code` varchar(80) NOT NULL,
	`status` enum('PENDING','COMPLETED','FAILED','EXPIRED') NOT NULL DEFAULT 'PENDING',
	`expires_at` datetime(3) NOT NULL,
	`completed_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `ai_oauth_device_logins_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `ai_model_configs` MODIFY COLUMN `provider` enum('OPENAI','OPENAI_CODEX','ANTHROPIC','KIMI','OPENAI_COMPATIBLE') NOT NULL;--> statement-breakpoint
ALTER TABLE `ai_oauth_device_logins` ADD CONSTRAINT `ai_oauth_device_logins_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ai_oauth_device_logins_user_created_idx` ON `ai_oauth_device_logins` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ai_oauth_device_logins_status_expires_idx` ON `ai_oauth_device_logins` (`status`,`expires_at`);