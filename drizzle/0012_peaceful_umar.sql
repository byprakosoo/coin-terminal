CREATE TABLE `portfolio_btc_balances` (
	`user_id` char(36) NOT NULL,
	`quantity` decimal(20,8) NOT NULL DEFAULT '0',
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `portfolio_btc_balances_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
ALTER TABLE `portfolio_btc_balances` ADD CONSTRAINT `portfolio_btc_balances_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;