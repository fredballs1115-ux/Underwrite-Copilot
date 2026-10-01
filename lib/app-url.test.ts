import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_APP_URL, appUrl } from "./app-url";

// The emails' and the auth messages' links: one origin, never a relative
// link. `??` had kept an empty NEXT_PUBLIC_APP_URL, so every link an email
// carried read "/deals/…", and the three readers disagreed on the fallback.
describe("the site's own origin for the links it sends", () => {
  it("reads the setting as written, less a trailing slash", () => {
    expect(appUrl({ NEXT_PUBLIC_APP_URL: "https://underwritecopilot.com" })).toBe("https://underwritecopilot.com");
    expect(appUrl({ NEXT_PUBLIC_APP_URL: " https://underwritecopilot.com/ " })).toBe("https://underwritecopilot.com");
    expect(appUrl({ NEXT_PUBLIC_APP_URL: "http://localhost:3000//" })).toBe("http://localhost:3000");
  });

  it("treats a blank setting as unset, never as an empty origin", () => {
    for (const blank of [undefined, "", "   "]) {
      expect(appUrl({ NEXT_PUBLIC_APP_URL: blank }), String(blank)).toBe(DEFAULT_APP_URL);
    }
    expect(appUrl({})).toMatch(/^https:\/\//);
  });

  it("is the one reader the emails and the sign-in links use", () => {
    for (const file of ["lib/email.ts", "lib/digest.ts", "app/login/actions.ts"]) {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      expect(src, file).toMatch(/from "@\/lib\/app-url"/);
      expect(src, file).not.toMatch(/process\.env\.NEXT_PUBLIC_APP_URL/);
    }
  });
});
