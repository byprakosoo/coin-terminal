CREATE TABLE `spending_carryovers` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`report_month` char(7) NOT NULL,
	`amount_usd` decimal(30,8) NOT NULL,
	`direction` enum('INCOME','EXPENSE') NOT NULL,
	`status` enum('ACTIVE','DELETED') NOT NULL DEFAULT 'ACTIVE',
	`note` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `spending_carryovers_id` PRIMARY KEY(`id`),
	CONSTRAINT `spending_carryovers_user_month_unique` UNIQUE(`user_id`,`report_month`)
);
--> statement-breakpoint
ALTER TABLE `spending_carryovers` ADD CONSTRAINT `spending_carryovers_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;