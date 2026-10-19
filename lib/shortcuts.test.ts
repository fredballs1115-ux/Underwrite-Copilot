import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {}, back: () => {} }),
  usePathname: () => "/deals",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../app/(app)/deals/actions", () => {
  const noop = async () => {};
  return { createDeal: noop, createDealFromBatch: noop, createManualDeal: noop, createSampleDeal: noop, setStage: noop };
});

import {
  PIPELINE_ORDER_MAX,
  SHORTCUTS,
  SHORTCUT_SEARCH,
  dealStepOf,
  isTypingTarget,
  KEYS_PASS_ATTR,
  neighbourIn,
  opensShortcuts,
  orderJson,
  pipelineKeyAction,
  pipelineOrderKey,
  readOrder,
  shortcutsStandDown,
  stepFrom,
  type KeyLike,
} from "./shortcuts";
import { ShortcutsSheetBody } from "@/app/(app)/shortcuts-sheet";
import { CommandPalette } from "@/app/(app)/command-palette";
import { Pipeline, type DealCard } from "@/app/(app)/deals/pipeline";
import { ToastProvider } from "@/app/(app)/toaster";
import { dealAllowance } from "./deal-allowance";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

/** An element as the guard reads it: its tag, whether it is editable, and
 *  whether it sits inside a dialog. */
function el(tagName: string, opts: { editable?: boolean; inDialog?: boolean } = {}) {
  return {
    tagName,
    isContentEditable: !!opts.editable,
    closest: (sel: string) => (opts.inDialog && sel.includes('role="dialog"') ? {} : null),
  };
}

function key(k: string, over: Partial<KeyLike> = {}): KeyLike {
  return { key: k, metaKey: false, ctrlKey: false, altKey: false, isComposing: false, defaultPrevented: false, target: el("BODY"), ...over };
}

describe("the keys stand down where a reader is typing or a dialog is open", () => {
  it("fires on the page itself, Shift included (\"?\" is Shift and \"/\")", () => {
    expect(shortcutsStandDown(key("j"))).toBe(false);
    expect(shortcutsStandDown(key("?"))).toBe(false);
    expect(shortcutsStandDown(key("j", { target: el("A") }))).toBe(false);
    expect(shortcutsStandDown(key("j", { target: null }))).toBe(false);
  });

  it("stands down in every field a reader types into", () => {
    for (const t of [el("INPUT"), el("TEXTAREA"), el("SELECT"), el("DIV", { editable: true }), el("input")]) {
      expect(isTypingTarget(t)).toBe(true);
      expect(shortcutsStandDown(key("j", { target: t }))).toBe(true);
      // Escape too: it is how a browser cancels autofill, and a search box
      // clears on it — the new-deal form must not close under it.
      expect(pipelineKeyAction(key("Escape", { target: t }), { canNew: true })).toBeNull();
    }
    expect(isTypingTarget(el("BUTTON"))).toBe(false);
  });

  it("goes on working from an input marked to pass the keys — the pipeline's select-mode checkbox — so Escape leaves the mode from it", () => {
    const marked = (type: string) => ({ ...el("INPUT"), type, hasAttribute: (n: string) => n === KEYS_PASS_ATTR });
    for (const type of ["checkbox", "radio", "CHECKBOX", "submit", "button", "reset"]) {
      const t = marked(type);
      expect(isTypingTarget(t), type).toBe(false);
      expect(pipelineKeyAction(key("Escape", { target: t }), { canNew: true }), type).toBe("escape");
      expect(pipelineKeyAction(key("j", { target: t }), { canNew: true }), type).toBe("next");
    }
    // A text field of any kind still stands the keys down, marked or not.
    for (const type of ["text", "search", "email", "number", "date", ""]) {
      expect(isTypingTarget({ ...el("INPUT"), type }), type).toBe(true);
      expect(isTypingTarget(marked(type)), type).toBe(true);
    }
    // The select-mode checkbox carries the mark.
    expect(readFileSync("app/(app)/deals/pipeline-select.tsx", "utf8")).toMatch(/type="checkbox"\s+data-keys-pass\b/);
    expect(KEYS_PASS_ATTR).toBe("data-keys-pass");
    // The pipeline leaves select mode on the pipeline's Escape.
    const pipeline = readFileSync("app/(app)/deals/pipeline.tsx", "utf8");
    expect(pipeline).toMatch(/onEscape: \(\) => \{\s*setShowForm\(false\);\s*if \(select\.on\) select\.leave\(\);/);
  });

  it("stands down on any other checkbox or radio: the letter of intent's \"Financing contingency\" keeps \"]\" from leaving the page and its draft", () => {
    for (const type of ["checkbox", "radio", "submit", "button"]) {
      const plain = { ...el("INPUT"), type, hasAttribute: () => false };
      expect(isTypingTarget(plain), type).toBe(true);
      expect(isTypingTarget({ ...el("INPUT"), type }), type).toBe(true);
      expect(shortcutsStandDown(key("]", { target: plain })), type).toBe(true);
    }
  });

  it("stands down inside a dialog, and with a modal open wherever the focus is", () => {
    expect(shortcutsStandDown(key("j", { target: el("BUTTON", { inDialog: true }) }))).toBe(true);
    expect(shortcutsStandDown(key("j"), { modalOpen: true })).toBe(true);
    expect(opensShortcuts(key("?"), { modalOpen: true })).toBe(false);
    expect(dealStepOf(key("]"), { modalOpen: true })).toBeNull();
  });

  it("stands down with ⌘, Ctrl or Alt held, while composing, and once another handler took the key", () => {
    for (const over of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }, { isComposing: true }, { defaultPrevented: true }]) {
      expect(shortcutsStandDown(key("k", over))).toBe(true);
      expect(pipelineKeyAction(key("k", over), { canNew: true })).toBeNull();
      expect(dealStepOf(key("[", over))).toBeNull();
      expect(opensShortcuts(key("?", over))).toBe(false);
    }
  });
});

describe("what each key does", () => {
  it("on the pipeline", () => {
    const act = (k: string, canNew = true) => pipelineKeyAction(key(k), { canNew });
    expect(act("Escape")).toBe("escape");
    expect(act("/")).toBe("search");
    expect(act("n")).toBe("new");
    // At the free plan's limit the form cannot open.
    expect(act("n", false)).toBeNull();
    expect(act("j")).toBe("next");
    expect(act("k")).toBe("previous");
    expect(act("J")).toBeNull();
    expect(act("x")).toBeNull();
  });

  it("on a deal, and anywhere", () => {
    expect(dealStepOf(key("]"))).toBe(1);
    expect(dealStepOf(key("["))).toBe(-1);
    expect(dealStepOf(key("j"))).toBeNull();
    expect(opensShortcuts(key("?"))).toBe(true);
    expect(opensShortcuts(key("/"))).toBe(false);
  });

  it("every shortcut the sheet lists is one a listener answers", () => {
    for (const s of SHORTCUTS) {
      const k = s.keys.join("");
      if (s.where === "pipeline" && k !== "Enter") {
        // Enter is the focused link's own; Esc is the key named Escape.
        expect(pipelineKeyAction(key(k === "Esc" ? "Escape" : k), { canNew: true }), k).not.toBeNull();
      }
      if (s.where === "deal") expect(dealStepOf(key(k)), k).not.toBeNull();
    }
    expect(SHORTCUT_SEARCH).toContain("next deal");
  });
});

describe("stepping through the deals shown", () => {
  it("starts at the first, moves one along, and holds at either end", () => {
    expect(stepFrom(-1, 4, 1)).toBe(0);
    expect(stepFrom(-1, 4, -1)).toBe(0);
    expect(stepFrom(0, 4, 1)).toBe(1);
    expect(stepFrom(3, 4, 1)).toBe(3);
    expect(stepFrom(0, 4, -1)).toBe(0);
    expect(stepFrom(2, 4, -1)).toBe(1);
    expect(stepFrom(0, 0, 1)).toBeNull();
    // A focus on a deal no longer shown starts again at the first.
    expect(stepFrom(9, 4, 1)).toBe(0);
  });

  it("finds a deal's neighbours in the pipeline's order, and none past its ends", () => {
    const order = ["a", "b", "c"];
    expect(neighbourIn(order, "b", 1)).toBe("c");
    expect(neighbourIn(order, "b", -1)).toBe("a");
    expect(neighbourIn(order, "a", -1)).toBeNull();
    expect(neighbourIn(order, "c", 1)).toBeNull();
    expect(neighbourIn(order, "z", 1)).toBeNull();
  });

  it("stores the order and reads back only what is an order of ids", () => {
    const ids = ["0b1c2d3e-0000-4000-8000-000000000001", "a", "b"];
    expect(readOrder(orderJson(ids))).toEqual(ids);
    expect(readOrder(null)).toBeNull();
    expect(readOrder("")).toBeNull();
    expect(readOrder("{not json")).toBeNull();
    expect(readOrder('{"a":1}')).toBeNull();
    expect(readOrder("[]")).toBeNull();
    // A path, a number or a repeat is dropped, never followed.
    expect(readOrder('["a","../billing",3,"a","b"]')).toEqual(["a", "b"]);
    expect(JSON.parse(orderJson(Array.from({ length: PIPELINE_ORDER_MAX + 5 }, (_, i) => `d${i}`)))).toHaveLength(PIPELINE_ORDER_MAX);
  });

  it("keeps each signed-in reader's order under their own key, and none for a reader not known", () => {
    const a = pipelineOrderKey("0B1C2D3E-0000-4000-8000-000000000001");
    const b = pipelineOrderKey("0b1c2d3e-0000-4000-8000-000000000002");
    expect(a).toBe("uc-pipeline-order:0b1c2d3e-0000-4000-8000-000000000001");
    expect(a).not.toBe(b);
    expect(pipelineOrderKey(null)).toBeNull();
    expect(pipelineOrderKey(undefined)).toBeNull();
    expect(pipelineOrderKey("")).toBeNull();
    // The pipeline writes and the deal page reads by the reader's key.
    const keep = readFileSync("app/(app)/deals/pipeline-keys.ts", "utf8");
    const step = readFileSync("app/(app)/deals/[id]/deal-step-keys.tsx", "utf8");
    expect(keep).toMatch(/sessionStorage\.setItem\(storeKey,/);
    expect(step).toMatch(/sessionStorage\.getItem\(storeKey\)/);
    expect(keep + step).toMatch(/pipelineOrderKey\(viewerId\)[\s\S]*pipelineOrderKey\(viewerId\)/);
    expect(keep + step).not.toMatch(/PIPELINE_ORDER_KEY/);
  });
});

describe("a layout that types \"[\" and \"]\" with AltGr", () => {
  const altGr = (over: Partial<KeyLike>): Partial<KeyLike> => ({ ...over, getModifierState: (k: string) => k === "AltGraph" });
  it("steps on a deal: Ctrl and Alt are the layout's, not a shortcut's", () => {
    // Windows reports AltGr as Ctrl and Alt held; Linux and macOS as Alt.
    expect(dealStepOf(key("[", altGr({ ctrlKey: true, altKey: true })))).toBe(-1);
    expect(dealStepOf(key("]", altGr({ ctrlKey: true, altKey: true })))).toBe(1);
    expect(dealStepOf(key("]", altGr({ altKey: true })))).toBe(1);
  });

  it("still stands down for ⌘, for Ctrl or Alt without AltGr, and while typing", () => {
    expect(dealStepOf(key("]", altGr({ ctrlKey: true, altKey: true, metaKey: true })))).toBeNull();
    expect(dealStepOf(key("]", { ctrlKey: true, altKey: true, getModifierState: () => false }))).toBeNull();
    expect(dealStepOf(key("]", altGr({ altKey: true, target: el("INPUT") })))).toBeNull();
    // A browser whose getModifierState throws is read as no AltGr.
    const throws = () => {
      throw new Error("no");
    };
    expect(dealStepOf(key("]", { altKey: true, getModifierState: throws }))).toBeNull();
  });
});

describe("the shortcuts sheet", () => {
  it("is a labelled modal dialog listing every shortcut by where it works, and reads clean", () => {
    const html = renderToStaticMarkup(React.createElement(ShortcutsSheetBody, { onClose: () => {} }));
    expect(html).toMatch(/role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="shortcuts-sheet-title"/);
    expect(html).toContain('id="shortcuts-sheet-title"');
    expect(a11yIssues(html)).toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    for (const s of SHORTCUTS) expect(text).toContain(s.does);
    for (const place of ["Anywhere", "On the pipeline", "On a deal"]) expect(text).toContain(place);
    // Its one stop is Close; the dim behind it is out of the tab order.
    expect(html).toMatch(/<button type="button" tabindex="-1" aria-label="Close the shortcuts"/);
  });

  it("is listed in the command palette where the shell gives it, with the palette's footer naming its key", () => {
    const open = renderToStaticMarkup(React.createElement(CommandPalette, { open: true, onOpenChange: () => {}, onShowShortcuts: () => {} }));
    expect(visibleText(open)).toContain("Keyboard shortcuts");
    expect(visibleText(open)).toContain("? / n j k [ ]");
    expect(a11yIssues(open)).toEqual([]);
    const without = renderToStaticMarkup(React.createElement(CommandPalette, { open: true, onOpenChange: () => {} }));
    expect(visibleText(without)).not.toContain("Keyboard shortcuts");
  });
});

describe("the pipeline marks each deal's own control for j and k", () => {
  const card = (id: string, stage: string): DealCard => ({
    id,
    name: `Deal ${id}`,
    assetClass: "multifamily",
    createdAt: "2026-09-01T12:00:00Z",
    verdict: null,
    stage,
    addedBy: null,
    fit: null,
    score: null,
    mandateVerdict: null,
    market: "Dallas, TX",
    coveredMarket: null,
    offersDue: null,
    slots: { cap: null, price: null, yoc: null },
    jobStatus: null,
    hasAddress: false,
  });
  const props = {
    deals: [card("a", "screening"), card("b", "tracking"), card("c", "dead")],
    errorMessage: null,
    billing: { isPro: false, canCreateDeal: true, allowance: dealAllowance({ plan: "free", dealCount: 1, team: null }) },
    todayIso: "2026-09-28",
  };
  const render = (over: object) =>
    renderToStaticMarkup(React.createElement(ToastProvider, null, React.createElement(Pipeline, { ...props, ...over })));

  it("one link a card, a row and a board card, in the order shown — a dead deal only once asked for", () => {
    for (const initialView of ["cards", "list", "board"] as const) {
      const html = render({ initialView });
      const navs = [...html.matchAll(/<a\b[^>]*data-deal-nav="[^"]*"[^>]*>/g)].map((m) => m[0].match(/href="\/deals\/([^"]+)"/)?.[1]);
      expect(navs, initialView).toEqual(["a", "b"]);
    }
  });
});
