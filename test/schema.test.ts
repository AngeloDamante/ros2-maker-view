// Message-definition helpers against a real ROS 2 schema, as foxglove_bridge advertises it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { MessageReader, MessageWriter } from "@foxglove/rosmsg2-serialization";
import { defaultMessage, fieldAt, leafPaths, parseSchema, stampMessage } from "../src/bridge/schema.ts";

const SCHEMA = `std_msgs/Header header
int64 count
float64[3] v
uint8[] payload
================================================================================
MSG: std_msgs/Header
builtin_interfaces/Time stamp
string frame_id
================================================================================
MSG: builtin_interfaces/Time
int32 sec
uint32 nanosec`;

const defs = parseSchema("test_msgs/msg/Sample", "ros2msg", SCHEMA);

test("defaultMessage", () => {
  assert.deepEqual(defaultMessage(defs), {
    header: { stamp: { sec: 0, nanosec: 0 }, frame_id: "" },
    count: 0,
    v: [0, 0, 0],
    payload: [],
  });
});

test("leafPaths and fieldAt", () => {
  const paths = leafPaths(defs).map((p) => p.path);
  assert.deepEqual(paths, ["header.stamp.sec", "header.stamp.nanosec", "header.frame_id", "count", "v[0]", "v[1]", "v[2]", "payload[0]"]);
  assert.deepEqual(
    leafPaths(defs).filter((p) => p.numeric).map((p) => p.path),
    paths.filter((p) => p !== "header.frame_id"),
  );
  assert.equal(fieldAt(defs, "count")?.type, "int64");
  assert.equal(fieldAt(defs, "v[1]")?.type, "float64");
  assert.equal(fieldAt(defs, "header.stamp.sec")?.type, "int32");
  assert.equal(fieldAt(defs, "nope"), undefined);
});

test("stampMessage sets header.stamp, also when missing", () => {
  const before = Math.floor(Date.now() / 1000);
  const out = stampMessage({ count: 1 }, defs) as any;
  assert.ok(out.header.stamp.sec >= before);
  assert.equal(out.count, 1);
  const heuristic = stampMessage({ stamp: { sec: 0, nanosec: 0 }, data: 2 }) as any;
  assert.ok(heuristic.stamp.sec >= before);
});

test("templates round-trip through CDR", () => {
  const msg = stampMessage({ ...defaultMessage(defs), count: 7, payload: [115, 0] }, defs);
  const bytes = new MessageWriter(defs).writeMessage(msg);
  const back = new MessageReader(defs).readMessage<any>(bytes);
  assert.equal(back.count, 7n);
  assert.deepEqual(Array.from(back.payload), [115, 0]);
});
