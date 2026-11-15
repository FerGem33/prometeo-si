import { describe, expect, it } from "vitest";
import { filesFromDrop, type DropEntry } from "./folderDrop";

const file = (name: string): DropEntry => ({
  isFile: true,
  isDirectory: false,
  name,
  file: (ok) => ok(new File(["x"], name)),
});

// Directory reader that hands its children out in batches of two, like Chrome's ~100-entry pages.
const dir = (name: string, children: DropEntry[]): DropEntry => ({
  isFile: false,
  isDirectory: true,
  name,
  createReader: () => {
    let i = 0;
    return { readEntries: (ok) => ok(children.slice(i, (i += 2))) };
  },
});

describe("filesFromDrop", () => {
  it("reads nested folders recursively and keeps only supported extensions", async () => {
    const tree = dir("lote", [file("a.csv"), file("notes.txt"), dir("sub", [file("b.PDF"), file("c.json"), file("d.tsv")]), file("e.png")]);
    const files = await filesFromDrop({ items: [{ webkitGetAsEntry: () => tree }], files: [] });
    expect(files.map((f) => f.name)).toEqual(["a.csv", "b.PDF", "c.json", "d.tsv"]);
  });

  it("falls back to dataTransfer.files without entry support", async () => {
    const f = new File(["x"], "plain.csv");
    expect(await filesFromDrop({ files: [f] })).toEqual([f]);
  });
});
