/**
 * The storage layer, against a recording fake of the service-role client: a
 * path outside its scope never reaches the bucket — reads, writes and signed
 * URLs refuse it, the best-effort removals skip it — while the scope's own
 * paths go through unchanged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls: { op: string; args: unknown[] }[] = [];
type Listed = { data: { name: string }[] | null; error: { message: string } | null };
const EMPTY = (): Listed => ({ data: [], error: null });
/** What the bucket lists for a folder at an offset: its objects' names. */
const listing: { of: (folder: string, offset: number) => Listed } = { of: EMPTY };

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    storage: {
      from: () => ({
        upload: async (...args: unknown[]) => {
          calls.push({ op: "upload", args });
          return { error: null };
        },
        download: async (...args: unknown[]) => {
          calls.push({ op: "download", args });
          return { data: { arrayBuffer: async () => new TextEncoder().encode("%PDF-bytes").buffer }, error: null };
        },
        remove: async (...args: unknown[]) => {
          calls.push({ op: "remove", args });
          return { error: null };
        },
        createSignedUrl: async (...args: unknown[]) => {
          calls.push({ op: "sign", args });
          return { data: { signedUrl: `https://storage.example/${String(args[0])}?sig` }, error: null };
        },
        list: async (...args: unknown[]) => {
          calls.push({ op: "list", args });
          return listing.of(String(args[0]), (args[1] as { offset?: number } | undefined)?.offset ?? 0);
        },
      }),
    },
  }),
}));

import {
  StoragePathError,
  downloadDealFile,
  downloadOmPdf,
  listDealPictureFiles,
  omStoragePath,
  removeStorageFiles,
  removeSupplementFile,
  signedSupplementUrl,
  uploadOmPdf,
  uploadSupplement,
} from "./storage";

const DEAL = "22222222-2222-4222-8222-222222222222";
const USER = "11111111-1111-4111-8111-111111111111";
const MINE = omStoragePath(USER, DEAL);
const VICTIM = "33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444.pdf";
const scope = { kind: "deal", dealId: DEAL } as const;

let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  calls.length = 0;
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => warnSpy.mockRestore());

describe("a path outside its scope never reaches the bucket", () => {
  it("signing, downloading and uploading refuse it before any client call", async () => {
    expect(await signedSupplementUrl(VICTIM, scope)).toBeNull();
    await expect(downloadOmPdf(VICTIM, scope)).rejects.toBeInstanceOf(StoragePathError);
    await expect(downloadDealFile(VICTIM, scope)).rejects.toBeInstanceOf(StoragePathError);
    await expect(uploadOmPdf(VICTIM, Buffer.from("%PDF-x"), scope)).rejects.toBeInstanceOf(StoragePathError);
    await expect(uploadSupplement(VICTIM, Buffer.from("x"), "application/pdf", scope)).rejects.toBeInstanceOf(
      StoragePathError,
    );
    expect(calls).toEqual([]);
  });

  it("the best-effort removals skip it and log, and still remove the scope's own paths", async () => {
    await removeSupplementFile(VICTIM, scope);
    expect(calls).toEqual([]);
    await removeStorageFiles([VICTIM, MINE, `documents/${DEAL}/d1-roll.xlsx`], scope);
    expect(calls).toEqual([{ op: "remove", args: [[MINE, `documents/${DEAL}/d1-roll.xlsx`]] }]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(VICTIM));
  });

  it("a scope's own paths go through unchanged", async () => {
    await uploadOmPdf(MINE, Buffer.from("%PDF-mine"), scope);
    const buf = await downloadOmPdf(MINE, scope);
    const url = await signedSupplementUrl(MINE, scope);
    expect(buf.toString("latin1")).toBe("%PDF-bytes");
    expect(url).toBe(`https://storage.example/${MINE}?sig`);
    expect(calls.map((c) => c.op)).toEqual(["upload", "download", "sign"]);
    expect(calls[0].args[0]).toBe(MINE);
  });

  it("a branding scope reads the account's own logo and refuses a deal's OM", async () => {
    const logo = `${USER}/branding-logo-k3x9-ab12.png`;
    await downloadDealFile(logo, { kind: "branding", userId: USER, teamId: null });
    await expect(
      downloadDealFile(MINE, { kind: "branding", userId: USER, teamId: null }),
    ).rejects.toBeInstanceOf(StoragePathError);
    expect(calls).toEqual([{ op: "download", args: [logo] }]);
  });
});

describe("listDealPictureFiles — a deal's picture folders, for the deletion sweeps (research pass 39)", () => {
  afterEach(() => {
    listing.of = EMPTY;
  });

  it("lists both folders a page at a time, and answers only the layout's own files of this deal", async () => {
    const page = (n: number, stamp: string) => Array.from({ length: n }, (_, i) => ({ name: `${stamp}${i}-hero.jpg` }));
    listing.of = (folder, offset) => {
      if (folder === `photos/${DEAL}`) {
        if (offset === 0) return { data: [...page(999, "a"), { name: "notes.txt" }], error: null };
        return { data: [{ name: "b1-thumb.jpg" }, { name: "c1-card.jpg" }], error: null };
      }
      if (folder === `flood/${DEAL}`) return { data: [{ name: "f1.jpg" }, { name: "f2.png" }], error: null };
      return { data: [], error: null };
    };
    const files = await listDealPictureFiles(DEAL);
    expect(files).toHaveLength(999 + 2 + 1);
    expect(files).toContain(`photos/${DEAL}/a0-hero.jpg`);
    expect(files).toContain(`photos/${DEAL}/b1-thumb.jpg`);
    expect(files).toContain(`flood/${DEAL}/f1.jpg`);
    expect(files).not.toContain(`photos/${DEAL}/notes.txt`);
    expect(files).not.toContain(`flood/${DEAL}/f2.png`);
    expect(calls.filter((c) => c.op === "list").map((c) => [c.args[0], (c.args[1] as { offset: number }).offset])).toEqual([
      [`photos/${DEAL}`, 0],
      [`photos/${DEAL}`, 1000],
      [`flood/${DEAL}`, 0],
    ]);
  });

  it("lists nothing for an id the layout would never mint folders under", async () => {
    for (const id of ["../" + DEAL, `${DEAL}/x`, "", ".."]) expect(await listDealPictureFiles(id)).toEqual([]);
    expect(calls.filter((c) => c.op === "list")).toEqual([]);
  });

  it("ends a folder's listing at a page that fails, keeping what it read", async () => {
    listing.of = (folder) =>
      folder === `photos/${DEAL}` ? { data: null, error: { message: "down" } } : { data: [{ name: "f1.jpg" }], error: null };
    expect(await listDealPictureFiles(DEAL)).toEqual([`flood/${DEAL}/f1.jpg`]);
  });
});
