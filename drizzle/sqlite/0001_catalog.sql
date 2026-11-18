CREATE TABLE `artist` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort_name` text,
	`name_search` text NOT NULL,
	`discogs_id` text,
	`musicbrainz_id` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artist_discogs_id_unique` ON `artist` (`discogs_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `artist_musicbrainz_id_unique` ON `artist` (`musicbrainz_id`);--> statement-breakpoint
CREATE INDEX `artist_name_search_idx` ON `artist` (`name_search`);--> statement-breakpoint
CREATE TABLE `copy` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`release_id` text NOT NULL,
	`media_condition` text,
	`sleeve_condition` text,
	`price_minor` integer,
	`currency` text,
	`acquired_on` text,
	`source` text,
	`location_id` text,
	`notes` text,
	`rating` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`release_id`) REFERENCES `release`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`location_id`) REFERENCES `location`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `copy_user_idx` ON `copy` (`user_id`);--> statement-breakpoint
CREATE INDEX `copy_release_idx` ON `copy` (`release_id`);--> statement-breakpoint
CREATE INDEX `copy_location_idx` ON `copy` (`location_id`);--> statement-breakpoint
CREATE TABLE `copy_photo` (
	`copy_id` text NOT NULL,
	`image_id` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`copy_id`, `image_id`),
	FOREIGN KEY (`copy_id`) REFERENCES `copy`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`image_id`) REFERENCES `image`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `copy_tag` (
	`copy_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`copy_id`, `tag_id`),
	FOREIGN KEY (`copy_id`) REFERENCES `copy`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tag`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `copy_tag_tag_idx` ON `copy_tag` (`tag_id`);--> statement-breakpoint
CREATE TABLE `image` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`kind` text NOT NULL,
	`source_url` text,
	`path` text NOT NULL,
	`width` integer,
	`height` integer,
	`sha256` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `location` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `location_user_name_uidx` ON `location` (`user_id`,`name`);--> statement-breakpoint
CREATE TABLE `master` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`title_search` text NOT NULL,
	`year` integer,
	`genres` text NOT NULL,
	`styles` text NOT NULL,
	`cover_image_id` text,
	`discogs_master_id` text,
	`musicbrainz_release_group_id` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`cover_image_id`) REFERENCES `image`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `master_discogs_master_id_unique` ON `master` (`discogs_master_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `master_musicbrainz_release_group_id_unique` ON `master` (`musicbrainz_release_group_id`);--> statement-breakpoint
CREATE INDEX `master_title_search_idx` ON `master` (`title_search`);--> statement-breakpoint
CREATE TABLE `master_artist` (
	`master_id` text NOT NULL,
	`artist_id` text NOT NULL,
	`position` integer NOT NULL,
	`join_phrase` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`master_id`, `position`),
	FOREIGN KEY (`master_id`) REFERENCES `master`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artist_id`) REFERENCES `artist`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `master_artist_artist_idx` ON `master_artist` (`artist_id`);--> statement-breakpoint
CREATE TABLE `provider_cache` (
	`provider` text NOT NULL,
	`cache_key` text NOT NULL,
	`payload` text NOT NULL,
	`fetched_at` integer NOT NULL,
	PRIMARY KEY(`provider`, `cache_key`)
);
--> statement-breakpoint
CREATE TABLE `release` (
	`id` text PRIMARY KEY NOT NULL,
	`master_id` text NOT NULL,
	`title` text NOT NULL,
	`title_search` text NOT NULL,
	`format` text NOT NULL,
	`format_details` text NOT NULL,
	`format_summary` text NOT NULL,
	`label` text,
	`catalog_number` text,
	`catalog_number_norm` text,
	`country` text,
	`release_year` integer,
	`release_date` text,
	`cover_image_id` text,
	`tracklist` text NOT NULL,
	`notes` text,
	`data_source` text NOT NULL,
	`discogs_release_id` text,
	`musicbrainz_release_id` text,
	`created_by_user_id` text,
	`fetched_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`master_id`) REFERENCES `master`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cover_image_id`) REFERENCES `image`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `release_discogs_release_id_unique` ON `release` (`discogs_release_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `release_musicbrainz_release_id_unique` ON `release` (`musicbrainz_release_id`);--> statement-breakpoint
CREATE INDEX `release_master_idx` ON `release` (`master_id`);--> statement-breakpoint
CREATE INDEX `release_catno_norm_idx` ON `release` (`catalog_number_norm`);--> statement-breakpoint
CREATE TABLE `release_artist` (
	`release_id` text NOT NULL,
	`artist_id` text NOT NULL,
	`position` integer NOT NULL,
	`join_phrase` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`release_id`, `position`),
	FOREIGN KEY (`release_id`) REFERENCES `release`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artist_id`) REFERENCES `artist`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `release_artist_artist_idx` ON `release_artist` (`artist_id`);--> statement-breakpoint
CREATE TABLE `release_barcode` (
	`release_id` text NOT NULL,
	`barcode` text NOT NULL,
	`barcode_norm` text NOT NULL,
	PRIMARY KEY(`release_id`, `barcode_norm`),
	FOREIGN KEY (`release_id`) REFERENCES `release`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `release_barcode_norm_idx` ON `release_barcode` (`barcode_norm`);--> statement-breakpoint
CREATE TABLE `tag` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`name_norm` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tag_user_name_uidx` ON `tag` (`user_id`,`name_norm`);--> statement-breakpoint
CREATE TABLE `wishlist_item` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`master_id` text,
	`release_id` text,
	`priority` integer DEFAULT 2 NOT NULL,
	`max_price_minor` integer,
	`currency` text,
	`notes` text,
	`status` text DEFAULT 'wanted' NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`master_id`) REFERENCES `master`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`release_id`) REFERENCES `release`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "wishlist_one_target" CHECK(("wishlist_item"."master_id" IS NULL) <> ("wishlist_item"."release_id" IS NULL))
);
--> statement-breakpoint
CREATE INDEX `wishlist_user_idx` ON `wishlist_item` (`user_id`);--> statement-breakpoint
CREATE TABLE `wishlist_tag` (
	`wishlist_item_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`wishlist_item_id`, `tag_id`),
	FOREIGN KEY (`wishlist_item_id`) REFERENCES `wishlist_item`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tag`(`id`) ON UPDATE no action ON DELETE cascade
);
