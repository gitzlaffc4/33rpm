import { describe, expect, it } from "vitest";

import { csvCell, detectDelimiter, parseCsv, toCsv } from "@/lib/csv";

describe("csv", () => {
  it("parses quotes, escaped quotes, embedded newlines, CRLF and a BOM", () => {
    const text =
      '﻿Artist,Title,Notes\r\n"Mac, Fleetwood",Rumours,"Says ""hi""\nline 2"\r\nX,Y,\r\n';
    expect(parseCsv(text)).toEqual([
      ["Artist", "Title", "Notes"],
      ["Mac, Fleetwood", "Rumours", 'Says "hi"\nline 2'],
      ["X", "Y", ""],
    ]);
  });
  it("detects semicolons and tabs", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(parseCsv("a\tb\n1\t2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
  it("writes safe cells and round-trips", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell(12)).toBe("12");
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"');
    const out = toCsv(["a", "b"], [["x,y", null]]);
    expect(parseCsv(out)).toEqual([
      ["a", "b"],
      ["x,y", ""],
    ]);
  });
});
