# Performance

Measured with `npm run bench -- <empty-database-url> 2500`, which fills a throwaway database
with 2,500 releases + copies (10-track tracklists, barcodes, tags, locations, wishlist items)
and times the queries behind each screen (median of 5 runs after a warm-up).

Reference run: Intel Xeon @ 2.30 GHz × 4 (cloud VM), Node 22, PostgreSQL 17 on the same host.

| Query (2,500 copies)              | SQLite   | PostgreSQL |
| --------------------------------- | -------: | ---------: |
| Library: all albums (artist sort) | 35.5 ms  | 52.9 ms    |
| Library: format + decade filter   | 4.1 ms   | 6.2 ms     |
| Library: genre filter             | 16.8 ms  | 26.2 ms    |
| Library: text filter              | 11.4 ms  | 18.6 ms    |
| Search index: two-word prefix     | 0.1 ms   | 23.3 ms    |
| Search index: catalog number      | 0.2 ms   | 23.2 ms    |
| Album page                        | 0.6 ms   | 3.8 ms     |
| Wishlist                          | 2.1 ms   | 4.4 ms     |
| Stats                             | 11.5 ms  | 14.3 ms    |
| Export collection (all rows)      | 50.4 ms  | 78.8 ms    |

Everything a page needs stays well under 100 ms. A Raspberry Pi 5 is roughly 2–3× slower per
core than this VM, which still keeps every screen under ~150 ms.

**Raspberry Pi 5 check:** run the same command on the Pi (SQLite and, if you use it,
PostgreSQL) and add a column here:

```bash
docker exec -it 33rpm node dist/bench.js file:/tmp/bench.db 2500
```
