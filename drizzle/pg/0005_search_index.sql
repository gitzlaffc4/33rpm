-- Full-text search index (Phase 5): derived from the catalog and rebuildable at any time
-- (see src/db/search). `body` is already lowercased and diacritic-free.
CREATE TABLE "search_doc" (
	"release_id" text PRIMARY KEY NOT NULL REFERENCES "release"("id") ON DELETE CASCADE,
	"body" text NOT NULL,
	"tsv" tsvector GENERATED ALWAYS AS (to_tsvector('simple', "body")) STORED
);
--> statement-breakpoint
CREATE INDEX "search_doc_tsv_idx" ON "search_doc" USING gin ("tsv");
--> statement-breakpoint
-- Trigram matching for typos. pg_trgm is a trusted extension (PG 13+), but a restricted role
-- may still be unable to create it: search then works without typo tolerance.
DO $$
BEGIN
	CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN insufficient_privilege OR feature_not_supported OR undefined_file THEN
	RAISE NOTICE '33rpm: pg_trgm unavailable; fuzzy search disabled';
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
		CREATE INDEX IF NOT EXISTS "search_doc_body_trgm_idx" ON "search_doc" USING gin ("body" gin_trgm_ops);
	END IF;
END $$;
