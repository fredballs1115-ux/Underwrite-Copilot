import { describe, expect, it } from "vitest";
import { isShortTermRental, statesFlagOrFranchise } from "./short-term-rental";
import { documentProfileOf } from "./broker-mail";

describe("a short-term rental is told from a hotel by what the memorandum states (audit C11, M4)", () => {
  it("a hotel field that only says there is none states nothing", () => {
    // The audit's probes.
    expect(statesFlagOrFranchise({ brand: "None (independent)" })).toBe(false);
    expect(statesFlagOrFranchise({ franchise: "No franchise agreement" })).toBe(false);
    expect(isShortTermRental("Short-term rental portfolio", { brand: "None (independent)", franchise: "" })).toBe(true);
    expect(isShortTermRental("Vacation rentals", { brand: "", franchise: "No franchise agreement" })).toBe(true);
    // Each other way of saying none.
    for (const brand of ["Unbranded", "Not flagged", "Non-branded", "N/A — independent", "Independent", "Independent (no flag)", "no brand"]) {
      expect(statesFlagOrFranchise({ brand }), brand).toBe(false);
    }
    for (const franchise of ["None", "Not applicable", "No franchise", "Non-franchised", "N/A", "—"]) {
      expect(statesFlagOrFranchise({ franchise }), franchise).toBe(false);
    }
  });

  it("a manager's name is no flag", () => {
    expect(statesFlagOrFranchise({ brand: "Managed by Vacasa" })).toBe(false);
    expect(statesFlagOrFranchise({ brand: "Operated by Evolve" })).toBe(false);
    expect(statesFlagOrFranchise({ brand: "Vacasa", management: "Vacasa" })).toBe(false);
    expect(isShortTermRental("Vacation rentals (Airbnb)", { brand: "Managed by Vacasa", franchise: "" })).toBe(true);
  });

  it("a real flag or franchise is still a hotel's", () => {
    expect(statesFlagOrFranchise({ brand: "Courtyard by Marriott" })).toBe(true);
    expect(statesFlagOrFranchise({ brand: "Hilton Garden Inn", management: "Aimbridge" })).toBe(true);
    expect(statesFlagOrFranchise({ brand: "", franchise: "Franchise agreement with Hilton through 2034" })).toBe(true);
    expect(isShortTermRental("Short-term rental portfolio", { brand: "Courtyard by Marriott", franchise: "" })).toBe(false);
  });

  it("short-term and vacation rentals named outright win over a resort or the class's hospitality label; a hotel, a motel or an inn does not lose", () => {
    expect(isShortTermRental("Short-term rental resort")).toBe(true);
    expect(isShortTermRental("Hospitality / short-term rental portfolio")).toBe(true);
    expect(isShortTermRental("Vacation rental lodging")).toBe(true);
    expect(isShortTermRental("Hotel with short-term rental units")).toBe(false);
    expect(isShortTermRental("Motel and vacation rentals")).toBe(false);
    expect(isShortTermRental("Inn and vacation rentals")).toBe(false);
    // The label alone, a bare STR and a resort with no rentals named stay a hotel's.
    expect(isShortTermRental("Hospitality / STR")).toBe(false);
    expect(isShortTermRental("STR")).toBe(false);
    expect(isShortTermRental("Beach resort")).toBe(false);
    // The document request reads the same.
    expect(documentProfileOf("hospitality_str", "Short-term rental resort")).toBe("rental");
    expect(documentProfileOf("hospitality_str", "Hospitality / short-term rental portfolio", { brand: "None (independent)", franchise: "No franchise agreement" })).toBe(
      "rental",
    );
  });
});
