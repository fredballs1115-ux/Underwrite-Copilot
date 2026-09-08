/**
 * The bucket's path grammar: every shape the app mints is accepted for its
 * own scope and refused for any other — the property that keeps a path read
 * off a user-writable column from reaching another user's object.
 */
import { describe, expect, it } from "vitest";
import {
  BRANDING_LOGO_RE,
  StoragePathError,
  brandingLogoPath,
  classifyDealPath,
  documentPath,
  isBrandingPath,
  isScopedPath,
  modelTmpPath,
  omStoragePath,
  safeFileName,
  scopedPath,
  supplementPath,
} from "./storage-paths";

const USER = "11111111-1111-4111-8111-111111111111";
const DEAL = "22222222-2222-4222-8222-222222222222";
const OTHER_USER = "33333333-3333-4333-8333-333333333333";
const OTHER_DEAL = "44444444-4444-4444-8444-444444444444";
const TEAM = "55555555-5555-4555-8555-555555555555";

describe("the minted shapes are their own deal's", () => {
  it("classifies each of a deal's objects", () => {
    expect(classifyDealPath(omStoragePath(USER, DEAL), DEAL)).toBe("om");
    expect(classifyDealPath(modelTmpPath(omStoragePath(USER, DEAL)), DEAL)).toBe("model-tmp");
    expect(classifyDealPath(documentPath(DEAL, "doc1", "Rent Roll (Q3).xlsx"), DEAL)).toBe("document");
    expect(classifyDealPath(supplementPath(DEAL, "s1", "notes.pdf"), DEAL)).toBe("supplement");
  });

  it("refuses another deal's objects, whichever folder they sit in", () => {
    expect(classifyDealPath(omStoragePath(OTHER_USER, OTHER_DEAL), DEAL)).toBeNull();
    expect(classifyDealPath(omStoragePath(USER, OTHER_DEAL), DEAL)).toBeNull();
    expect(classifyDealPath(modelTmpPath(omStoragePath(OTHER_USER, OTHER_DEAL)), DEAL)).toBeNull();
    expect(classifyDealPath(documentPath(OTHER_DEAL, "doc1", "x.xlsx"), DEAL)).toBeNull();
    expect(classifyDealPath(supplementPath(OTHER_DEAL, "s1", "x.pdf"), DEAL)).toBeNull();
    // A logo is not a deal object, and a deal id as folder is not the layout.
    expect(classifyDealPath(brandingLogoPath(USER, "abc-def", "png"), DEAL)).toBeNull();
    expect(classifyDealPath(`${DEAL}/${DEAL}.pdf.model-tmp`, DEAL)).toBeNull();
  });

  it("refuses traversal, empty segments, control characters and odd roots", () => {
    for (const p of [
      `../${DEAL}.pdf`,
      `${USER}/../${DEAL}.pdf`,
      `/${USER}/${DEAL}.pdf`,
      `${USER}//${DEAL}.pdf`,
      `documents/${DEAL}/`,
      `documents/${DEAL}/a/b`,
      `attachments/${DEAL}/x.pdf`,
      `${USER}/${DEAL}.pdf\n`,
      `${USER}\\${DEAL}.pdf`,
      "",
    ]) {
      expect(classifyDealPath(p, DEAL)).toBeNull();
    }
    expect(classifyDealPath(omStoragePath(USER, DEAL), "")).toBeNull();
    expect(classifyDealPath(omStoragePath(USER, DEAL), "../x")).toBeNull();
  });

  it("the file name is reduced to path-safe characters", () => {
    expect(safeFileName("Rent Roll (Q3) — final.xlsx")).toBe("Rent_Roll_Q3_final.xlsx");
    expect(safeFileName("../../etc/passwd")).toBe("etc_passwd");
    expect(safeFileName("", "bov.pdf")).toBe("bov.pdf");
    expect(safeFileName("x".repeat(200)).length).toBe(80);
  });
});

describe("scopes", () => {
  it("a deal scope accepts the deal's own objects and can be narrowed to one kind", () => {
    const om = omStoragePath(USER, DEAL);
    expect(scopedPath(om, { kind: "deal", dealId: DEAL })).toBe(om);
    expect(isScopedPath(om, { kind: "deal", dealId: DEAL, only: ["om"] })).toBe(true);
    expect(isScopedPath(om, { kind: "deal", dealId: DEAL, only: ["model-tmp"] })).toBe(false);
    expect(isScopedPath(modelTmpPath(om), { kind: "deal", dealId: DEAL, only: ["model-tmp"] })).toBe(true);
  });

  it("a foreign path throws a StoragePathError with a sentence, not a stack", () => {
    let caught: unknown;
    try {
      scopedPath(omStoragePath(OTHER_USER, OTHER_DEAL), { kind: "deal", dealId: DEAL });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(StoragePathError);
    expect((caught as Error).message).toMatch(/upload it again/);
    expect((caught as StoragePathError).path).toBe(omStoragePath(OTHER_USER, OTHER_DEAL));
  });

  it("a branding scope accepts the account's or its team's logo and nothing else", () => {
    const mine = brandingLogoPath(USER, "k3x9-ab12", "png");
    const teams = brandingLogoPath(TEAM, "k3x9-ab12", "jpg");
    expect(isBrandingPath(mine, { userId: USER })).toBe(true);
    expect(isBrandingPath(teams, { userId: USER, teamId: TEAM })).toBe(true);
    expect(isBrandingPath(teams, { userId: USER, teamId: null })).toBe(false);
    expect(isBrandingPath(brandingLogoPath(OTHER_USER, "k3x9-ab12", "png"), { userId: USER, teamId: TEAM })).toBe(false);
    // A deal's OM is never a logo, even in the account's own folder.
    expect(isBrandingPath(omStoragePath(USER, DEAL), { userId: USER })).toBe(false);
    expect(isScopedPath(omStoragePath(OTHER_USER, OTHER_DEAL), { kind: "branding", userId: USER })).toBe(false);
  });

  it("the id-free logo shape lets a parser drop a forged logoPath before any scope is known", () => {
    expect(BRANDING_LOGO_RE.test(brandingLogoPath(USER, "k3x9-ab12", "png"))).toBe(true);
    expect(BRANDING_LOGO_RE.test(omStoragePath(OTHER_USER, OTHER_DEAL))).toBe(false);
    expect(BRANDING_LOGO_RE.test(`documents/${OTHER_DEAL}/x-rent-roll.xlsx`)).toBe(false);
  });
});
