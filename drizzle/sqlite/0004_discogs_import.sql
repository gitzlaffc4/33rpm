CREATE TABLE `import_job` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`progress` text NOT NULL,
	`report` text,
	`error` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `import_job_user_idx` ON `import_job` (`user_id`);--> statement-breakpoint
ALTER TABLE `copy` ADD `discogs_instance_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `copy_user_discogs_instance_uidx` ON `copy` (`user_id`,`discogs_instance_id`);