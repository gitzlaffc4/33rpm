CREATE TABLE "artist" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_name" text,
	"name_search" text NOT NULL,
	"discogs_id" text,
	"musicbrainz_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artist_discogs_id_unique" UNIQUE("discogs_id"),
	CONSTRAINT "artist_musicbrainz_id_unique" UNIQUE("musicbrainz_id")
);
--> statement-breakpoint
CREATE TABLE "copy" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"release_id" text NOT NULL,
	"media_condition" text,
	"sleeve_condition" text,
	"price_minor" integer,
	"currency" text,
	"acquired_on" text,
	"source" text,
	"location_id" text,
	"notes" text,
	"rating" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "copy_photo" (
	"copy_id" text NOT NULL,
	"image_id" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "copy_photo_copy_id_image_id_pk" PRIMARY KEY("copy_id","image_id")
);
--> statement-breakpoint
CREATE TABLE "copy_tag" (
	"copy_id" text NOT NULL,
	"tag_id" text NOT NULL,
	CONSTRAINT "copy_tag_copy_id_tag_id_pk" PRIMARY KEY("copy_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "image" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"kind" text NOT NULL,
	"source_url" text,
	"path" text NOT NULL,
	"width" integer,
	"height" integer,
	"sha256" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "master" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"title_search" text NOT NULL,
	"year" integer,
	"genres" jsonb NOT NULL,
	"styles" jsonb NOT NULL,
	"cover_image_id" text,
	"discogs_master_id" text,
	"musicbrainz_release_group_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "master_discogs_master_id_unique" UNIQUE("discogs_master_id"),
	CONSTRAINT "master_musicbrainz_release_group_id_unique" UNIQUE("musicbrainz_release_group_id")
);
--> statement-breakpoint
CREATE TABLE "master_artist" (
	"master_id" text NOT NULL,
	"artist_id" text NOT NULL,
	"position" integer NOT NULL,
	"join_phrase" text DEFAULT '' NOT NULL,
	CONSTRAINT "master_artist_master_id_position_pk" PRIMARY KEY("master_id","position")
);
--> statement-breakpoint
CREATE TABLE "provider_cache" (
	"provider" text NOT NULL,
	"cache_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "provider_cache_provider_cache_key_pk" PRIMARY KEY("provider","cache_key")
);
--> statement-breakpoint
CREATE TABLE "release" (
	"id" text PRIMARY KEY NOT NULL,
	"master_id" text NOT NULL,
	"title" text NOT NULL,
	"title_search" text NOT NULL,
	"format" text NOT NULL,
	"format_details" jsonb NOT NULL,
	"format_summary" text NOT NULL,
	"label" text,
	"catalog_number" text,
	"catalog_number_norm" text,
	"country" text,
	"release_year" integer,
	"release_date" text,
	"cover_image_id" text,
	"tracklist" jsonb NOT NULL,
	"notes" text,
	"data_source" text NOT NULL,
	"discogs_release_id" text,
	"musicbrainz_release_id" text,
	"created_by_user_id" text,
	"fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "release_discogs_release_id_unique" UNIQUE("discogs_release_id"),
	CONSTRAINT "release_musicbrainz_release_id_unique" UNIQUE("musicbrainz_release_id")
);
--> statement-breakpoint
CREATE TABLE "release_artist" (
	"release_id" text NOT NULL,
	"artist_id" text NOT NULL,
	"position" integer NOT NULL,
	"join_phrase" text DEFAULT '' NOT NULL,
	CONSTRAINT "release_artist_release_id_position_pk" PRIMARY KEY("release_id","position")
);
--> statement-breakpoint
CREATE TABLE "release_barcode" (
	"release_id" text NOT NULL,
	"barcode" text NOT NULL,
	"barcode_norm" text NOT NULL,
	CONSTRAINT "release_barcode_release_id_barcode_norm_pk" PRIMARY KEY("release_id","barcode_norm")
);
--> statement-breakpoint
CREATE TABLE "tag" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"name_norm" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wishlist_item" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"master_id" text,
	"release_id" text,
	"priority" integer DEFAULT 2 NOT NULL,
	"max_price_minor" integer,
	"currency" text,
	"notes" text,
	"status" text DEFAULT 'wanted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wishlist_one_target" CHECK (("wishlist_item"."master_id" IS NULL) <> ("wishlist_item"."release_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "wishlist_tag" (
	"wishlist_item_id" text NOT NULL,
	"tag_id" text NOT NULL,
	CONSTRAINT "wishlist_tag_wishlist_item_id_tag_id_pk" PRIMARY KEY("wishlist_item_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "copy" ADD CONSTRAINT "copy_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copy" ADD CONSTRAINT "copy_release_id_release_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."release"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copy" ADD CONSTRAINT "copy_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copy_photo" ADD CONSTRAINT "copy_photo_copy_id_copy_id_fk" FOREIGN KEY ("copy_id") REFERENCES "public"."copy"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copy_photo" ADD CONSTRAINT "copy_photo_image_id_image_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."image"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copy_tag" ADD CONSTRAINT "copy_tag_copy_id_copy_id_fk" FOREIGN KEY ("copy_id") REFERENCES "public"."copy"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copy_tag" ADD CONSTRAINT "copy_tag_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image" ADD CONSTRAINT "image_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location" ADD CONSTRAINT "location_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master" ADD CONSTRAINT "master_cover_image_id_image_id_fk" FOREIGN KEY ("cover_image_id") REFERENCES "public"."image"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_artist" ADD CONSTRAINT "master_artist_master_id_master_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."master"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_artist" ADD CONSTRAINT "master_artist_artist_id_artist_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artist"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release" ADD CONSTRAINT "release_master_id_master_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."master"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release" ADD CONSTRAINT "release_cover_image_id_image_id_fk" FOREIGN KEY ("cover_image_id") REFERENCES "public"."image"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release" ADD CONSTRAINT "release_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_artist" ADD CONSTRAINT "release_artist_release_id_release_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."release"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_artist" ADD CONSTRAINT "release_artist_artist_id_artist_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artist"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_barcode" ADD CONSTRAINT "release_barcode_release_id_release_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."release"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_item" ADD CONSTRAINT "wishlist_item_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_item" ADD CONSTRAINT "wishlist_item_master_id_master_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."master"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_item" ADD CONSTRAINT "wishlist_item_release_id_release_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."release"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_tag" ADD CONSTRAINT "wishlist_tag_wishlist_item_id_wishlist_item_id_fk" FOREIGN KEY ("wishlist_item_id") REFERENCES "public"."wishlist_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_tag" ADD CONSTRAINT "wishlist_tag_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artist_name_search_idx" ON "artist" USING btree ("name_search");--> statement-breakpoint
CREATE INDEX "copy_user_idx" ON "copy" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "copy_release_idx" ON "copy" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX "copy_location_idx" ON "copy" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "copy_tag_tag_idx" ON "copy_tag" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "location_user_name_uidx" ON "location" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "master_title_search_idx" ON "master" USING btree ("title_search");--> statement-breakpoint
CREATE INDEX "master_artist_artist_idx" ON "master_artist" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX "release_master_idx" ON "release" USING btree ("master_id");--> statement-breakpoint
CREATE INDEX "release_catno_norm_idx" ON "release" USING btree ("catalog_number_norm");--> statement-breakpoint
CREATE INDEX "release_artist_artist_idx" ON "release_artist" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX "release_barcode_norm_idx" ON "release_barcode" USING btree ("barcode_norm");--> statement-breakpoint
CREATE UNIQUE INDEX "tag_user_name_uidx" ON "tag" USING btree ("user_id","name_norm");--> statement-breakpoint
CREATE INDEX "wishlist_user_idx" ON "wishlist_item" USING btree ("user_id");