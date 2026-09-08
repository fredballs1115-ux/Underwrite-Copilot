/**
 * The storage layer, against a recording fake of the service-role client: a
 * path outside its scope never reaches the bucket — reads, writes and signed
 * URLs refuse it, the best-effort removals skip it — while the scope's own
 * paths go through unchanged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls: { op: string; args: unknown[] }[] = [];

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
      }),
    },
  }),
}));

import {
  StoragePathError,
  downloadDealFile,
  downloadOmPdf,
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
