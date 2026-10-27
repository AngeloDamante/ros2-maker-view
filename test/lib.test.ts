import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { getPath, objectLeaves, parsePath, setPath, toNumber } from "../src/lib/path.ts";
import { computeVarValues, formatOptionLines, parseOptionLines, resolveVars } from "../src/lib/vars.ts";
import { embedView, isTemplate } from "../src/lib/embed.ts";
import { loggerMatcher } from "../src/lib/match.ts";
import { normalizeView } from "../src/types.ts";
import { ViewStore } from "../server/views.ts";

test("parsePath / getPath", () => {
  assert.deepEqual(parsePath("pose.position.x"), ["pose", "position", "x"]);
  assert.deepEqual(parsePath("points[2].y"), ["points", 2, "y"]);
  const msg = { data: 3, points: [{ y: 1 }, { y: 2 }], big: 5n, arr: new Float64Array([1, 2, 3]) };
  assert.equal(getPath(msg, "data"), 3);
  assert.equal(getPath(msg, "points[1].y"), 2);
  assert.equal(getPath(msg, "points[-1].y"), 2);
  assert.equal(getPath(msg, "arr[2]"), 3);
  assert.equal(getPath(msg, "big"), 5);
  assert.equal(getPath(msg, "missing.x"), undefined);
  assert.equal(getPath(msg, ""), msg);
});

test("setPath copies and creates intermediates", () => {
  const base = { header: { frame_id: "a" }, data: 0 };
  const out = setPath(base, "header.stamp.sec", 5);
  assert.deepEqual(out, { header: { frame_id: "a", stamp: { sec: 5 } }, data: 0 });
  assert.deepEqual(base, { header: { frame_id: "a" }, data: 0 });
  assert.deepEqual(setPath({ v: [1, 2] }, "v[1]", 9), { v: [1, 9] });
});

test("toNumber", () => {
  assert.equal(toNumber(true), 1);
  assert.equal(toNumber("2.5"), 2.5);
  assert.equal(toNumber(""), undefined);
  assert.equal(toNumber({}), undefined);
  assert.equal(toNumber(NaN), undefined);
});

test("objectLeaves", () => {
  assert.deepEqual(objectLeaves({ a: 1, b: { c: true, d: [1, 2] } }), [
    ["a", 1],
    ["b.c", true],
    ["b.d", [1, 2]],
  ]);
});

test("variables: selection, extra values and typed substitution", () => {
  const variables = [{ name: "motor", options: parseOptionLines(["left; dev_id=115; label=Left", "right; dev_id=104"]) }];
  assert.deepEqual(computeVarValues(variables, {}), { motor: "left", dev_id: "115" });
  assert.deepEqual(computeVarValues(variables, { motor: "right" }), { motor: "right", dev_id: "104" });
  assert.deepEqual(computeVarValues(variables, { motor: "gone" }), { motor: "left", dev_id: "115" });
  const vars = { motor: "right", dev_id: "104" };
  assert.equal(resolveVars("${motor}/current", vars), "right/current");
  assert.equal(resolveVars("${unknown}", vars), "${unknown}");
  assert.deepEqual(resolveVars({ payload: ["${dev_id}", 0], name: "${motor}" }, vars, true), { payload: [104, 0], name: "right" });
  assert.deepEqual(resolveVars({ payload: ["${dev_id}"] }, vars), { payload: ["104"] });
  assert.deepEqual(formatOptionLines(variables[0]!.options), ["left; label=Left; dev_id=115", "right; dev_id=104"]);
});

test("embedView fills the slot and escapes </script>", () => {
  const tpl = '<html><head><title>x</title><script id="rmv-view" type="application/json">null</script></head></html>';
  assert.ok(isTemplate(tpl));
  const out = embedView(tpl, { id: "v", view: { title: "</script><b>" } }, "A & B");
  assert.ok(!out.includes("</script><b>"));
  assert.ok(out.includes("<title>A &amp; B</title>"));
  const json = /<script id="rmv-view" type="application\/json">([\s\S]*?)<\/script>/.exec(out)![1]!;
  assert.deepEqual(JSON.parse(json), { id: "v", view: { title: "</script><b>" } });
  // re-embedding replaces the previous view
  const again = embedView(out, { id: "w", view: {} });
  assert.equal(again.match(/rmv-view/g)!.length, 1);
  assert.throws(() => embedView("<html></html>", { id: "v", view: {} }));
});

test("normalizeView", () => {
  assert.throws(() => normalizeView({}));
  const v = normalizeView({ pages: [{ widgets: [{ type: "value" }, { nope: 1 }] }] });
  assert.equal(v.title, "Untitled view");
  assert.equal(v.pages[0]!.widgets.length, 1);
  assert.equal(v.pages[0]!.widgets[0]!.w, 6);
  assert.ok(v.pages[0]!.id);
});

test("ViewStore save / list / get / remove", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rmv-"));
  try {
    const store = new ViewStore(dir);
    await store.save("demo_1", { title: "Demo", pages: [{ id: "p", title: "P", widgets: [] }] });
    assert.deepEqual(
      (await store.list()).map((v) => [v.id, v.title, v.pages]),
      [["demo_1", "Demo", 1]],
    );
    assert.equal((await store.get("demo_1")).title, "Demo");
    await assert.rejects(store.get("../etc/passwd"), /Invalid view id/);
    await assert.rejects(store.save("x", { nope: true }), /missing pages/);
    await store.remove("demo_1");
    await assert.rejects(store.get("demo_1"), /not found/);
    assert.deepEqual((await fs.readdir(dir)).length, 0);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("loggerMatcher", () => {
  const exact = loggerMatcher("rmv_demo");
  assert.ok(exact("rmv_demo"));
  assert.ok(exact("ns.rmv_demo"));
  assert.ok(!exact("rmv_demo_b"));
  assert.ok(loggerMatcher("rmv_demo*")("rmv_demo_b"));
  assert.ok(loggerMatcher("*cam*")("front_camera"));
  assert.ok(loggerMatcher("a.b")("a.b") && !loggerMatcher("a.b")("axb"));
  assert.ok(loggerMatcher("")("anything"));
});
