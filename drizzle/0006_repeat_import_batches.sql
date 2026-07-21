CREATE INDEX `import_batches_user_checksum_idx` ON `import_batches` (`user_id`,`source`,`checksum`);
ALTER TABLE `import_batches` DROP INDEX `import_batches_user_checksum_unique`;
