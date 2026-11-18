CREATE TABLE `scan_item` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`barcode` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`candidates` text NOT NULL,
	`release_id` text,
	`copy_id` text,
	`error` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`release_id`) REFERENCES `release`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`copy_id`) REFERENCES `copy`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `scan_item_user_status_idx` ON `scan_item` (`user_id`,`status`);