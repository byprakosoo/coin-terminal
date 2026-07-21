ALTER TABLE `import_batches` ADD `report_month` char(7);--> statement-breakpoint
ALTER TABLE `spending_transactions` ADD `report_month` char(7);--> statement-breakpoint
UPDATE `spending_transactions` SET `report_month` = DATE_FORMAT(`occurred_on`, '%Y-%m');--> statement-breakpoint
ALTER TABLE `spending_transactions` MODIFY COLUMN `report_month` char(7) NOT NULL;--> statement-breakpoint
CREATE INDEX `spending_transactions_user_report_month_idx` ON `spending_transactions` (`user_id`,`report_month`);
