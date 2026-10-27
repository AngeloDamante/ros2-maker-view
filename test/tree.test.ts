import assert from "node:assert/strict";
import { test } from "node:test";
import type { WidgetDoc } from "../src/types.ts";
import { autoSizeGroups, childrenOf, cloneWithNewIds, countWidgets, findWidget, groupHeight, moveWidget, removeWidget, updateWidget } from "../src/lib/tree.ts";
import { normalizeView } from "../src/types.ts";

const w = (id: string, x = 0, y = 0, width = 4, h = 3, type = "value"): WidgetDoc => ({ id, type, x, y, w: width, h, config: {} });
const group = (id: string, children: WidgetDoc[], x = 0, y = 0): WidgetDoc => ({ id, type: "group", x, y, w: 12, h: 0, config: { widgets: children } });

const page = (): WidgetDoc[] => [w("a"), group("g", [w("c1", 0, 0, 4, 4), w("c2", 4, 2, 4, 3)], 0, 3), w("b", 12, 0)];

test("findWidget searches page and groups", () => {
  assert.equal(findWidget(page(), "a")?.parent, null);
  assert.equal(findWidget(page(), "c2")?.parent, "g");
  assert.equal(findWidget(page(), "nope"), undefined);
});

test("group height follows children (title row + max bottom, min 2 body rows)", () => {
  assert.equal(groupHeight(page()[1]!), 1 + 5);
  assert.equal(groupHeight(group("e", [])), 1 + 2);
  assert.equal(autoSizeGroups(page())[1]!.h, 6);
});

test("update and remove inside a group", () => {
  const up = updateWidget(page(), "c1", (x) => ({ ...x, title: "T" }));
  assert.equal(findWidget(up, "c1")?.widget.title, "T");
  const rm = removeWidget(page(), "c2");
  assert.deepEqual(childrenOf(rm[1]!).map((x) => x.id), ["c1"]);
  assert.equal(rm[1]!.h, 1 + 4);
});

test("moveWidget into and out of a group", () => {
  const into = moveWidget(page(), "b", "g", 9, 1, 12);
  assert.equal(findWidget(into, "b")?.parent, "g");
  assert.equal(findWidget(into, "b")?.widget.x, 8); // clamped to cols - w
  assert.equal(into.length, 2);
  const out = moveWidget(into, "c1", null, 2, 20, 24);
  assert.equal(findWidget(out, "c1")?.parent, null);
  assert.deepEqual([findWidget(out, "c1")?.widget.x, findWidget(out, "c1")?.widget.y], [2, 20]);
  // width is clamped when the target has fewer columns
  assert.equal(findWidget(moveWidget(page(), "a", "g", 0, 0, 3), "a")?.widget.w, 3);
});

test("groups cannot be nested", () => {
  const two = [...page(), group("g2", [], 0, 20)];
  assert.equal(moveWidget(two, "g2", "g", 0, 0, 12), two);
  assert.equal(moveWidget(two, "g", "g", 0, 0, 12), two);
});

test("cloneWithNewIds renews children ids", () => {
  let n = 0;
  const copy = cloneWithNewIds(page()[1]!, () => `n${n++}`);
  assert.equal(copy.id, "n0");
  assert.deepEqual(childrenOf(copy).map((x) => x.id), ["n1", "n2"]);
  assert.deepEqual(childrenOf(page()[1]!).map((x) => x.id), ["c1", "c2"]);
});

test("normalizeView keeps one level of groups", () => {
  const v = normalizeView({
    pages: [{ widgets: [{ type: "group", config: { widgets: [{ type: "value" }, { type: "group" }, { nope: 1 }] } }] }],
  });
  const g = v.pages[0]!.widgets[0]!;
  assert.deepEqual(childrenOf(g).map((x) => x.type), ["value"]);
  assert.equal(countWidgets(v.pages[0]!.widgets), 2);
});
