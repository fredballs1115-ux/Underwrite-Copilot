import { describe, it, expect } from "vitest";
import {
  resolveBuyBoxStore,
  serializeBuyBoxStore,
  activeBox,
  type BuyBoxStore,
} from "./criteria";

// Simulate the server actions' store transforms (pure parts only).
function applyDelete(store: BuyBoxStore, id: string): BuyBoxStore {
  const boxes = store.boxes.filter((b) => b.id !== id);
  const activeId = store.activeId === id ? (boxes[0]?.id ?? "") : store.activeId;
  return { boxes, activeId };
}

describe("STORE: a persisted round-trip never loses a NON-empty named box", () => {
  it("delete of an empty-but-named sibling only drops that empty one", () => {
    const store: BuyBoxStore = {
      boxes: [
        { id: "a", name: "Core", box: { minCapPct: 5 } },
        { id: "b", name: "Placeholder", box: {} }, // named but empty
      ],
      activeId: "a",
    };
    // serialize→persist→resolve is what actually hits the DB
    const back = resolveBuyBoxStore(serializeBuyBoxStore(store));
    console.log("STORE two-box back:", back.boxes.map((b) => `${b.id}:${b.name}`), "active", back.activeId);
    expect(back.boxes.map((b) => b.name)).toEqual(["Core", "Placeholder"]);
  });

  it("DATA LOSS: deleting the only real box when the survivor is empty-named nulls the whole store", () => {
    const store: BuyBoxStore = {
      boxes: [
        { id: "a", name: "Core", box: { minCapPct: 5 } },
        { id: "b", name: "Value-add (WIP)", box: {} },
      ],
      activeId: "a",
    };
    const afterDelete = applyDelete(store, "a"); // delete Core
    const serialized = serializeBuyBoxStore(afterDelete);
    console.log("STORE after delete Core, serialized =", JSON.stringify(serialized));
    // The surviving named 'Value-add (WIP)' box is emptied to null — its name is gone.
    expect(serialized).toBeNull();
    const back = resolveBuyBoxStore(serialized);
    expect(back.boxes).toHaveLength(0); // the named survivor vanished
  });
});

describe("STORE: single custom-named box rollback claim", () => {
  it("a single custom-named box is stored as a v2 envelope, NOT a bare box", () => {
    const store: BuyBoxStore = {
      boxes: [{ id: "x", name: "Core plus", box: { minCapPct: 5, minIrrPct: 12 } }],
      activeId: "x",
    };
    const out = serializeBuyBoxStore(store) as Record<string, unknown>;
    console.log("STORE single custom-name serialized =", JSON.stringify(out));
    // Pre-F4 code would read this as a BuyBox — but it has no BuyBox fields,
    // so a rollback sees NO criteria for a single custom-named box.
    expect("boxes" in out).toBe(true);
    expect((out as { minCapPct?: number }).minCapPct).toBeUndefined();
  });
});

describe("STORE: full add/select/rename/delete sequence keeps every real box", () => {
  it("build up 3 boxes, rename, switch, delete one — survivors intact", () => {
    let store: BuyBoxStore = resolveBuyBoxStore({ minCapPct: 5 }); // legacy bare
    // add B
    store = { boxes: [...store.boxes, { id: "B", name: "Value-add", box: { minCapPct: 7 } }], activeId: "B" };
    store = resolveBuyBoxStore(serializeBuyBoxStore(store));
    // add C
    store = { boxes: [...store.boxes, { id: "C", name: "Opportunistic", box: { minIrrPct: 20 } }], activeId: "C" };
    store = resolveBuyBoxStore(serializeBuyBoxStore(store));
    console.log("STORE seq boxes:", store.boxes.map((b) => `${b.name}(${b.box.minCapPct ?? b.box.minIrrPct})`));
    expect(store.boxes).toHaveLength(3);
    // delete the middle (active C stays, B removed)
    store = applyDelete(store, "B");
    store = resolveBuyBoxStore(serializeBuyBoxStore(store));
    expect(store.boxes.map((b) => b.name).sort()).toEqual(["Mandate", "Opportunistic"]);
    expect(activeBox(store)?.minIrrPct).toBe(20);
  });
});
