CREATE TABLE "scan_item" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"barcode" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"candidates" jsonb NOT NULL,
	"release_id" text,
	"copy_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scan_item" ADD CONSTRAINT "scan_item_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_item" ADD CONSTRAINT "scan_item_release_id_release_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."release"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_item" ADD CONSTRAINT "scan_item_copy_id_copy_id_fk" FOREIGN KEY ("copy_id") REFERENCES "public"."copy"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scan_item_user_status_idx" ON "scan_item" USING btree ("user_id","status");