import assert from "node:assert/strict";
import { test } from "node:test";
import { coerceParamValue, kindOf, paramValueFromText, parseParamText, sameValue } from "../src/lib/paramValue.ts";

test("kindOf recognizes the bridge's parameter types", () => {
  assert.equal(kindOf({ name: "a", value: 1.5, type: "float64" }), "double");
  assert.equal(kindOf({ name: "a", value: 2 }), "integer");
  assert.equal(kindOf({ name: "a", value: true }), "bool");
  assert.equal(kindOf({ name: "a", value: "x" }), "string");
  assert.equal(kindOf({ name: "a", value: [1, 2], type: "float64_array" }), "array");
});

test("parseParamText reads JSON, else keeps the text", () => {
  assert.equal(parseParamText("true"), true);
  assert.equal(parseParamText("2.5"), 2.5);
  assert.deepEqual(parseParamText("[1, 2]"), [1, 2]);
  assert.equal(parseParamText("fast"), "fast");
  assert.equal(parseParamText(""), "");
});

test("coerceParamValue converts to the parameter's type", () => {
  const dbl = { name: "d", value: 1, type: "float64" };
  const int = { name: "i", value: 3 };
  const bool = { name: "b", value: false };
  const str = { name: "s", value: "slow" };
  assert.deepEqual(coerceParamValue(dbl, 2), { value: 2 });
  assert.deepEqual(coerceParamValue(dbl, "0.5"), { value: 0.5 });
  assert.ok(coerceParamValue(dbl, "").error);
  assert.deepEqual(coerceParamValue(int, 4), { value: 4 });
  assert.ok(coerceParamValue(int, 4.5).error);
  assert.deepEqual(coerceParamValue(bool, "TRUE"), { value: true });
  assert.deepEqual(coerceParamValue(bool, 0), { value: false });
  assert.ok(coerceParamValue(bool, "on").error);
  assert.deepEqual(coerceParamValue(str, parseParamText("12")), { value: "12" });
  assert.ok(coerceParamValue({ name: "a", value: [1] }, 1).error);
});

test("sameValue compares by value", () => {
  assert.ok(sameValue([1, 2], [1, 2]));
  assert.ok(sameValue(2, 2.0));
  assert.ok(!sameValue(true, 1));
});

test("paramValueFromText keeps text for string parameters", () => {
  assert.deepEqual(paramValueFromText({ name: "s", value: "x" }, "[1, 2]"), { value: "[1, 2]" });
  assert.deepEqual(paramValueFromText({ name: "s", value: "x" }, "true"), { value: "true" });
  assert.deepEqual(paramValueFromText({ name: "d", value: 1, type: "float64" }, "2"), { value: 2 });
  assert.deepEqual(paramValueFromText({ name: "a", value: [1], type: "float64_array" }, "[0.5, 1]"), { value: [0.5, 1] });
});
