import assert from "node:assert/strict";
import { test } from "node:test";
import { paramsToYaml } from "../src/lib/paramsYaml.ts";

test("paramsToYaml writes the ros2 param dump format", () => {
  const yaml = paramsToYaml(
    "/ns/node",
    [
      { name: "gain", value: 2, type: "float64" },
      { name: "count", value: 5 },
      { name: "enabled", value: true },
      { name: "label", value: "demo" },
      { name: "limits", value: [1, 2.5], type: "float64_array" },
      { name: "ids", value: [1, 2] },
      { name: "names", value: [] },
      { name: "pid.kp", value: 1, type: "float64" },
      { name: "pid.ki", value: 0.1, type: "float64" },
    ],
    "header line",
  );
  assert.equal(
    yaml,
    `# header line
/ns/node:
  ros__parameters:
    count: 5
    enabled: true
    gain: 2.0
    ids:
    - 1
    - 2
    label: demo
    limits:
    - 1.0
    - 2.5
    names: []
    pid:
      ki: 0.1
      kp: 1.0
`,
  );
});

test("paramsToYaml quotes strings that YAML would misread", () => {
  const yaml = paramsToYaml("/n", [
    { name: "a", value: "" },
    { name: "b", value: "true" },
    { name: "c", value: "12" },
    { name: "d", value: "x: y # z" },
    { name: "e", value: "/dev/ttyACM0" },
    { name: "f", value: 'say "hi"' },
  ]);
  assert.match(yaml, /a: ""\n/);
  assert.match(yaml, /b: "true"\n/);
  assert.match(yaml, /c: "12"\n/);
  assert.match(yaml, /d: "x: y # z"\n/);
  assert.match(yaml, /e: \/dev\/ttyACM0\n/);
  assert.match(yaml, /f: "say \\"hi\\""\n/);
});
