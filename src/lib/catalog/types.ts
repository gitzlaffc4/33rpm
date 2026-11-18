/** Catalog types shared by the schema, providers and UI. */

export type Format = "vinyl" | "cd" | "cassette" | "other";

export type Track = {
  /** e.g. "A1", "1", "2-3" */
  position: string;
  title: string;
  /** e.g. "4:12" */
  duration?: string;
};
