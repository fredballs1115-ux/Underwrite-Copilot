import { describe, it, expect } from "vitest";
import { safeHttpUrl } from "./safe-url";

describe("safeHttpUrl — scheme allowlist", () => {
  it("passes http and https through", () => {
    expect(safeHttpUrl("https://example.com/a?b=1#p")).toBe("https://example.com/a?b=1#p");
    expect(safeHttpUrl("http://example.com")).toBe("http://example.com/");
  });
  it("drops javascript:, data:, vbscript:, file:", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeHttpUrl("vbscript:msgbox(1)")).toBeNull();
    expect(safeHttpUrl("file:///etc/passwd")).toBeNull();
  });
  it("drops scheme tricks (whitespace / case)", () => {
    expect(safeHttpUrl("  JAVASCRIPT:alert(1)")).toBeNull();
    expect(safeHttpUrl("JaVaScRiPt:alert(1)")).toBeNull();
  });
  it("drops relative paths, empty, and garbage", () => {
    expect(safeHttpUrl("/relative/path")).toBeNull();
    expect(safeHttpUrl("")).toBeNull();
    expect(safeHttpUrl(null)).toBeNull();
    expect(safeHttpUrl("not a url")).toBeNull();
  });
});
