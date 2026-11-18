-- Full-text search index (Phase 5): derived from the catalog and rebuildable at any time
-- (see src/db/search). FTS5 with diacritic folding and prefix indexes for as-you-type search.
CREATE VIRTUAL TABLE `search_doc` USING fts5(
	`release_id` UNINDEXED,
	`body`,
	tokenize = 'unicode61 remove_diacritics 2',
	prefix = '2 3 4'
);
