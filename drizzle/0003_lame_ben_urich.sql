ALTER TABLE `signals` ADD CONSTRAINT `signals_user_instrument_rule_evaluated_unique` UNIQUE(`user_id`,`instrument`,`rule_version_id`,`evaluated_at`);--> statement-breakpoint
ALTER TABLE `signals` DROP INDEX `signals_user_instrument_evaluated_unique`;
