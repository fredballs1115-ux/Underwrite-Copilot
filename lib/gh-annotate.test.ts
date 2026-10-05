import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { annotation, missingSecrets, missingSecretsError } from "./gh-annotate";

describe("annotations — a pull's failures on the run's page, not only in its log", () => {
  it("writes the workflow command, escaping what the runner would misread", () => {
    expect(annotation("warning", "DGS10: HTTP 500")).toBe("::warning::DGS10: HTTP 500");
    // A percent is the start of an escape to the runner; a new line ends the command.
    expect(annotation("error", "a 3% move\nsecond line\r")).toBe("::error::a 3%25 move%0Asecond line%0D");
    // A title's colon and comma delimit the command's properties.
    expect(annotation("warning", "x", "Rates: FRED, BLS")).toBe("::warning title=Rates%3A FRED%2C BLS::x");
    expect(annotation("notice", "done")).toBe("::notice::done");
  });

  it("names the secrets that are unset or empty, and only those", () => {
    expect(missingSecrets({ A: "x", B: undefined, C: "", D: "y" })).toEqual(["B", "C"]);
    expect(missingSecrets({ A: "x" })).toEqual([]);
  });

  it("says which secret is missing, that nothing was written, and what to do", () => {
    expect(missingSecretsError("fetch-fmr", ["HUD_API_TOKEN"], "Add it.")).toBe(
      "::error title=fetch-fmr%3A missing secret::fetch-fmr did not run: HUD_API_TOKEN is not set, so nothing was fetched or written. Add it.",
    );
    expect(missingSecretsError("fetch-rates", ["FRED_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"], "Add them.")).toContain(
      "FRED_API_KEY, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set",
    );
  });

  it("every pull loads it under plain Node and fails loudly on a missing secret, and the BLS key stays optional", () => {
    for (const file of ["fetch-rates.mjs", "fetch-zori.mjs", "fetch-realtor.mjs", "fetch-hvs.mjs", "fetch-fmr.mjs"]) {
      const src = readFileSync(join("scripts", file), "utf8");
      expect(src, file).toContain('from "../lib/gh-annotate.ts"');
      expect(src, file).toContain("missingSecretsError(");
      expect(src, file).toMatch(/annotation\(\s*"warning"/);
    }
    // The news pull needs all three of its secrets, and says so the same way.
    expect(readFileSync(join("scripts", "daily-intel.mjs"), "utf8")).toContain("missingSecretsError(");
    const rates = readFileSync(join("scripts", "fetch-rates.mjs"), "utf8");
    const at = rates.indexOf("missingSecrets(");
    const required = rates.slice(at, rates.indexOf(");", at));
    expect(required).toContain("FRED_API_KEY");
    expect(required).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(required).not.toContain("BLS_API_KEY");
  });
});
