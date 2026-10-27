// Client for foxglove_bridge (foxglove.websocket.v1 / foxglove.sdk.v1).
//
// - Topic subscriptions are reference counted and shared: one bridge
//   subscription and one decode per message, whatever the number of widgets.
// - Topic and node names that do not start with "/" are relative: they match
//   the first advertised name equal to "/<name>" or ending with "/<name>", so
//   views keep working when the robot runs under a different namespace.
// - Messages are decoded with the schema advertised by the bridge (CDR) and
//   published as JSON when the bridge supports it, CDR otherwise.

import { MessageReader, MessageWriter } from "@foxglove/rosmsg2-serialization";
import { parseSchema, type Definitions } from "./schema.ts";

export type ConnState = "disconnected" | "connecting" | "connected";

export interface Channel {
  id: number;
  topic: string;
  encoding: string;
  schemaName: string;
  schema: string;
  schemaEncoding?: string;
}

interface ServiceSchema {
  encoding?: string;
  schemaName: string;
  schemaEncoding?: string;
  schema: string;
}

export interface Service {
  id: number;
  name: string;
  type: string;
  request?: ServiceSchema;
  response?: ServiceSchema;
  requestSchema?: string;
  responseSchema?: string;
}

export interface Param {
  name: string;
  value: unknown;
  type?: string;
}

export type LogLevel = "info" | "ok" | "warn" | "error";
export interface LogEntry {
  id: number;
  t: number;
  level: LogLevel;
  text: string;
}

export interface Sample {
  msg: unknown;
  /** Receive time, seconds (performance clock). */
  t: number;
}

export type TopicListener = (msg: unknown, t: number) => void;

interface TopicState {
  name: string;
  listeners: Set<TopicListener>;
  channel?: Channel;
  latest?: Sample;
  count: number;
  hz: number;
}

interface ChannelSub {
  subId: number;
  channel: Channel;
  decode: (data: Uint8Array) => unknown;
  members: Set<TopicState>;
}

interface ClientChannel {
  id: number;
  topic: string;
  schemaName: string;
  encoding: string;
  writer?: MessageWriter;
}

interface Pending<T> {
  resolve: (v: T) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const SUBPROTOCOLS = ["foxglove.sdk.v1", "foxglove.websocket.v1"];
const REQUEST_TIMEOUT_MS = 5000;
const SERVICE_TIMEOUT_MS = 15000;

export const now = () => performance.now() / 1000;

function matchesName(full: string, wanted: string): boolean {
  return full === "/" + wanted || full.endsWith("/" + wanted);
}

function normalize(v: unknown): unknown {
  if (typeof v === "bigint") return Number(v);
  if (v === null || typeof v !== "object") return v;
  if (v instanceof BigInt64Array || v instanceof BigUint64Array) return Array.from(v, Number);
  if (ArrayBuffer.isView(v)) return v;
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) v[i] = normalize(v[i]);
    return v;
  }
  const o = v as Record<string, unknown>;
  for (const k in o) o[k] = normalize(o[k]);
  return o;
}

function jsonReplacer(_k: string, v: unknown) {
  if (typeof v === "bigint") return Number(v);
  if (ArrayBuffer.isView(v) && !(v instanceof DataView)) return Array.from(v as unknown as ArrayLike<number>);
  return v;
}

/** ROS 2 cannot serialize an empty struct: rosidl adds a dummy uint8 member. */
function writeCdr(writer: MessageWriter, defs: Definitions, msg: unknown): Uint8Array {
  if (defs[0] && defs[0].definitions.filter((f) => !f.isConstant).length === 0) return new Uint8Array([0, 1, 0, 0, 0]);
  return writer.writeMessage(msg);
}

export class BridgeClient {
  url = "";
  state: ConnState = "disconnected";
  serverName = "";
  /** Why the last connection attempt failed or ended, cleared on (re)connect. */
  lastError = "";
  capabilities: string[] = [];
  encodings: string[] = [];
  channels = new Map<number, Channel>();
  services = new Map<number, Service>();
  log: LogEntry[] = [];
  /** Incremented on every change of connection state or of the ROS graph. */
  version = 0;
  logVersion = 0;

  private ws?: WebSocket;
  private rateTimer?: ReturnType<typeof setInterval>;
  private topics = new Map<string, TopicState>();
  private chanSubs = new Map<number, ChannelSub>();
  private subsById = new Map<number, ChannelSub>();
  private clientChans = new Map<string, ClientChannel>();
  private paramListeners = new Map<string, Set<(p: Param) => void>>();
  private pendingParams = new Map<string, Pending<Param[]>>();
  private pendingCalls = new Map<number, Pending<unknown> & { decode: (d: Uint8Array) => unknown }>();
  private changeListeners = new Set<() => void>();
  private logListeners = new Set<() => void>();
  private nextSubId = 1;
  private nextClientChan = 1;
  private nextRequest = 1;
  private nextLogId = 1;
  private notifyQueued = false;

  // ---------------------------------------------------------------- events

  onChange(cb: () => void): () => void {
    this.changeListeners.add(cb);
    return () => this.changeListeners.delete(cb);
  }
  onLog(cb: () => void): () => void {
    this.logListeners.add(cb);
    return () => this.logListeners.delete(cb);
  }
  private changed() {
    this.version++;
    if (this.notifyQueued) return;
    this.notifyQueued = true;
    queueMicrotask(() => {
      this.notifyQueued = false;
      this.changeListeners.forEach((cb) => cb());
    });
  }
  addLog(level: LogLevel, text: string) {
    this.log.push({ id: this.nextLogId++, t: Date.now(), level, text });
    if (this.log.length > 500) this.log.splice(0, this.log.length - 500);
    this.logVersion++;
    this.logListeners.forEach((cb) => cb());
  }

  // ------------------------------------------------------------ connection

  get connected() {
    return this.state === "connected";
  }
  can(capability: string) {
    return this.capabilities.includes(capability);
  }

  /** Connects once; there is no automatic reconnection (the user presses Connect again). */
  connect(url: string) {
    this.url = url;
    this.lastError = "";
    this.rateTimer ??= setInterval(() => {
      for (const s of this.topics.values()) {
        s.hz = s.count;
        s.count = 0;
      }
    }, 1000);
    this.closeSocket();
    this.state = "connecting";
    this.changed();
    let ws: WebSocket;
    try {
      ws = new WebSocket(url, SUBPROTOCOLS);
    } catch {
      this.state = "disconnected";
      this.lastError = `Invalid bridge URL: ${url}`;
      this.addLog("error", this.lastError);
      this.changed();
      return;
    }
    ws.binaryType = "arraybuffer";
    ws.onopen = () => {
      this.state = "connected";
      this.addLog("ok", `Connected to ${url}`);
      this.changed();
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      const was = this.state;
      this.ws = undefined;
      this.resetSession();
      this.state = "disconnected";
      this.lastError = was === "connected" ? "Connection to the bridge lost" : `Cannot reach foxglove_bridge at ${url}: is it running?`;
      this.addLog(was === "connected" ? "warn" : "error", this.lastError);
      this.changed();
    };
    ws.onerror = () => {};
    ws.onmessage = (ev) => {
      try {
        if (typeof ev.data === "string") this.onJson(JSON.parse(ev.data));
        else this.onBinary(ev.data as ArrayBuffer);
      } catch (e) {
        console.error("bridge message error", e);
      }
    };
    this.ws = ws;
  }

  /** Closes the connection and stops all timers (the client can connect again later). */
  disconnect() {
    clearInterval(this.rateTimer);
    this.rateTimer = undefined;
    this.closeSocket();
    this.resetSession();
    if (this.state !== "disconnected") this.addLog("info", "Disconnected");
    this.state = "disconnected";
    this.changed();
  }

  private closeSocket() {
    const ws = this.ws;
    this.ws = undefined;
    if (ws) {
      ws.onclose = null;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
  }

  private resetSession() {
    this.channels.clear();
    this.services.clear();
    this.chanSubs.clear();
    this.subsById.clear();
    this.clientChans.clear();
    this.capabilities = [];
    this.encodings = [];
    for (const s of this.topics.values()) s.channel = undefined;
    for (const [, p] of this.pendingParams) {
      clearTimeout(p.timer);
      p.reject(new Error("Disconnected"));
    }
    this.pendingParams.clear();
    for (const [, p] of this.pendingCalls) {
      clearTimeout(p.timer);
      p.reject(new Error("Disconnected"));
    }
    this.pendingCalls.clear();
  }

  private send(obj: unknown) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  private onJson(msg: any) {
    switch (msg.op) {
      case "serverInfo":
        this.serverName = msg.name || "";
        this.capabilities = msg.capabilities || [];
        this.encodings = msg.supportedEncodings || [];
        {
          const lib = msg.metadata?.["fg-library"] || this.serverName || "foxglove_bridge";
          const distro = msg.metadata?.ROS_DISTRO ? ` · ROS ${msg.metadata.ROS_DISTRO}` : "";
          this.addLog("info", `Bridge: ${lib}${distro}`);
        }
        if (!this.can("clientPublish")) this.addLog("warn", "The bridge does not allow publishing (clientPublish disabled)");
        if (this.paramListeners.size && this.can("parametersSubscribe"))
          this.send({ op: "subscribeParameterUpdates", parameterNames: [...this.paramListeners.keys()] });
        this.changed();
        break;
      case "advertise":
        for (const ch of msg.channels as Channel[]) this.channels.set(ch.id, ch);
        this.syncSubscriptions();
        this.changed();
        break;
      case "unadvertise":
        for (const id of msg.channelIds as number[]) {
          this.channels.delete(id);
          const sub = this.chanSubs.get(id);
          if (sub) {
            this.chanSubs.delete(id);
            this.subsById.delete(sub.subId);
          }
        }
        this.syncSubscriptions();
        this.changed();
        break;
      case "advertiseServices":
        for (const s of msg.services as Service[]) this.services.set(s.id, s);
        this.changed();
        break;
      case "unadvertiseServices":
        for (const id of msg.serviceIds as number[]) this.services.delete(id);
        this.changed();
        break;
      case "parameterValues":
        this.onParameterValues(msg.parameters || [], msg.id);
        break;
      case "status":
        this.addLog(msg.level >= 2 ? "error" : msg.level === 1 ? "warn" : "info", `Bridge: ${msg.message}`);
        break;
      case "serviceCallFailure": {
        const p = this.pendingCalls.get(msg.callId);
        if (p) {
          clearTimeout(p.timer);
          this.pendingCalls.delete(msg.callId);
          p.reject(new Error(msg.message || "Service call failed"));
        }
        break;
      }
    }
  }

  private onBinary(buf: ArrayBuffer) {
    const dv = new DataView(buf);
    const op = dv.getUint8(0);
    if (op === 1) {
      // Message Data: op(1) subscriptionId(4) timestamp(8) payload
      const sub = this.subsById.get(dv.getUint32(1, true));
      if (!sub) return;
      const t = now();
      let msg: unknown;
      try {
        msg = sub.decode(new Uint8Array(buf, 13));
      } catch (e) {
        console.warn(`decode error on ${sub.channel.topic}`, e);
        return;
      }
      for (const s of sub.members) {
        s.latest = { msg, t };
        s.count++;
        for (const l of s.listeners) l(msg, t);
      }
    } else if (op === 3) {
      // Service Call Response: op(1) serviceId(4) callId(4) encodingLength(4) encoding payload
      const callId = dv.getUint32(5, true);
      const encLen = dv.getUint32(9, true);
      const p = this.pendingCalls.get(callId);
      if (!p) return;
      clearTimeout(p.timer);
      this.pendingCalls.delete(callId);
      try {
        p.resolve(p.decode(new Uint8Array(buf, 13 + encLen)));
      } catch (e) {
        p.reject(e as Error);
      }
    }
  }

  // ---------------------------------------------------------------- graph

  /** Advertised channel for a (possibly relative) topic name. */
  channelFor(name: string): Channel | undefined {
    if (!name) return undefined;
    let fallback: Channel | undefined;
    for (const ch of this.channels.values()) {
      if (ch.topic === name) return ch;
      if (!fallback && !name.startsWith("/") && matchesName(ch.topic, name)) fallback = ch;
    }
    return fallback;
  }

  topicNames(): string[] {
    return [...new Set([...this.channels.values()].map((c) => c.topic))].sort();
  }

  typeNames(): string[] {
    const s = new Set<string>();
    for (const c of this.channels.values()) s.add(c.schemaName);
    return [...s].sort();
  }

  /** Nodes that expose the parameter services. */
  nodeNames(): string[] {
    const out: string[] = [];
    for (const s of this.services.values()) if (s.name.endsWith("/get_parameters")) out.push(s.name.slice(0, -"/get_parameters".length));
    return out.sort();
  }

  resolveNode(name: string): string {
    if (!name || name.startsWith("/")) return name;
    return this.nodeNames().find((n) => matchesName(n, name)) ?? "/" + name;
  }

  serviceFor(name: string): Service | undefined {
    let fallback: Service | undefined;
    for (const s of this.services.values()) {
      if (s.name === name) return s;
      if (!fallback && !name.startsWith("/") && matchesName(s.name, name)) fallback = s;
    }
    return fallback;
  }

  serviceNames(): string[] {
    return [...this.services.values()].map((s) => s.name).sort();
  }

  /** Parsed definitions of a message type, from any advertised channel or service using it. */
  definitionsFor(type: string | undefined): Definitions | undefined {
    if (!type) return undefined;
    for (const c of this.channels.values()) {
      if (c.schemaName === type && c.schema) {
        try {
          return parseSchema(c.schemaName, c.schemaEncoding, c.schema);
        } catch {
          return undefined;
        }
      }
    }
    return undefined;
  }

  // ---------------------------------------------------------- subscribing

  subscribe(name: string, listener: TopicListener): () => void {
    let s = this.topics.get(name);
    if (!s) {
      s = { name, listeners: new Set(), count: 0, hz: 0 };
      this.topics.set(name, s);
    }
    s.listeners.add(listener);
    this.syncSubscriptions();
    return () => {
      const st = this.topics.get(name);
      if (!st) return;
      st.listeners.delete(listener);
      if (!st.listeners.size) {
        this.topics.delete(name);
        if (st.channel) this.chanSubs.get(st.channel.id)?.members.delete(st);
        this.syncSubscriptions();
      }
    };
  }

  topicInfo(name: string): TopicState | undefined {
    return this.topics.get(name);
  }

  private makeDecoder(ch: Channel): (data: Uint8Array) => unknown {
    if (ch.encoding === "json") {
      const td = new TextDecoder();
      return (d) => JSON.parse(td.decode(d));
    }
    if (ch.encoding === "cdr") {
      const reader = new MessageReader(parseSchema(ch.schemaName, ch.schemaEncoding, ch.schema));
      return (d) => normalize(reader.readMessage(d));
    }
    throw new Error(`Unsupported encoding "${ch.encoding}" on ${ch.topic}`);
  }

  /** Matches wanted topics to advertised channels and (un)subscribes on the bridge. */
  private syncSubscriptions() {
    const used = new Set<number>();
    const toSubscribe: { id: number; channelId: number }[] = [];
    for (const s of this.topics.values()) {
      const ch = this.connected ? this.channelFor(s.name) : undefined;
      if (s.channel && s.channel !== ch) this.chanSubs.get(s.channel.id)?.members.delete(s);
      s.channel = ch;
      if (!ch) continue;
      used.add(ch.id);
      let sub = this.chanSubs.get(ch.id);
      if (!sub) {
        let decode: ChannelSub["decode"];
        try {
          decode = this.makeDecoder(ch);
        } catch (e) {
          this.addLog("error", (e as Error).message);
          continue;
        }
        sub = { subId: this.nextSubId++, channel: ch, decode, members: new Set() };
        this.chanSubs.set(ch.id, sub);
        this.subsById.set(sub.subId, sub);
        toSubscribe.push({ id: sub.subId, channelId: ch.id });
      }
      sub.members.add(s);
    }
    const toUnsubscribe: number[] = [];
    for (const [chId, sub] of this.chanSubs) {
      if (used.has(chId) && sub.members.size) continue;
      this.chanSubs.delete(chId);
      this.subsById.delete(sub.subId);
      toUnsubscribe.push(sub.subId);
    }
    if (toSubscribe.length) this.send({ op: "subscribe", subscriptions: toSubscribe });
    if (toUnsubscribe.length) this.send({ op: "unsubscribe", subscriptionIds: toUnsubscribe });
  }

  // ----------------------------------------------------------- publishing

  /** Topic a publisher on `name` writes to: the advertised match, or the absolute name. */
  publishTopic(name: string): string {
    return this.channelFor(name)?.topic ?? (name.startsWith("/") ? name : "/" + name);
  }

  publishType(name: string, explicitType?: string): string | undefined {
    return explicitType || this.channelFor(name)?.schemaName;
  }

  private clientChannel(name: string, explicitType?: string): ClientChannel {
    if (!this.connected) throw new Error("Not connected to the bridge");
    if (!this.can("clientPublish")) throw new Error("The bridge does not allow publishing (clientPublish capability missing)");
    const topic = this.publishTopic(name);
    const schemaName = this.publishType(name, explicitType);
    if (!schemaName) throw new Error(`Unknown message type for ${topic}: set it in the widget configuration`);
    let cc = this.clientChans.get(topic);
    if (cc && cc.schemaName !== schemaName) {
      this.send({ op: "unadvertise", channelIds: [cc.id] });
      this.clientChans.delete(topic);
      cc = undefined;
    }
    if (!cc) {
      const encoding = this.encodings.includes("json") ? "json" : "cdr";
      cc = { id: this.nextClientChan++, topic, schemaName, encoding };
      if (encoding === "cdr") {
        const defs = this.definitionsFor(schemaName);
        if (!defs) throw new Error(`No schema known for ${schemaName}: the bridge only supports CDR publishing`);
        cc.writer = new MessageWriter(defs);
      }
      this.send({ op: "advertise", channels: [{ id: cc.id, topic, encoding, schemaName }] });
      this.clientChans.set(topic, cc);
    }
    return cc;
  }

  /** Advertises the publisher in advance, so that the first message is not lost. */
  preparePublisher(name: string, explicitType?: string) {
    try {
      if (this.connected && this.can("clientPublish") && this.publishType(name, explicitType)) this.clientChannel(name, explicitType);
    } catch {
      /* reported on publish */
    }
  }

  publish(name: string, msg: unknown, explicitType?: string): string {
    const cc = this.clientChannel(name, explicitType);
    let payload: Uint8Array;
    if (cc.encoding === "json") payload = new TextEncoder().encode(JSON.stringify(msg, jsonReplacer));
    else payload = writeCdr(cc.writer!, this.definitionsFor(cc.schemaName)!, msg);
    const frame = new Uint8Array(5 + payload.length);
    frame[0] = 1;
    new DataView(frame.buffer).setUint32(1, cc.id, true);
    frame.set(payload, 5);
    this.ws!.send(frame);
    return cc.topic;
  }

  // ----------------------------------------------------------- parameters

  private onParameterValues(params: Param[], id?: string) {
    for (const p of params) this.paramListeners.get(p.name)?.forEach((cb) => cb(p));
    if (id) {
      const pending = this.pendingParams.get(id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingParams.delete(id);
        pending.resolve(params);
      }
    }
  }

  private paramRequest(op: "getParameters" | "setParameters", body: Record<string, unknown>): Promise<Param[]> {
    if (!this.connected) return Promise.reject(new Error("Not connected to the bridge"));
    if (!this.can("parameters")) return Promise.reject(new Error("The bridge does not expose parameters"));
    const id = `rmv-${this.nextRequest++}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingParams.delete(id);
        reject(new Error("Timeout waiting for the bridge"));
      }, REQUEST_TIMEOUT_MS);
      this.pendingParams.set(id, { resolve, reject, timer });
      this.send({ op, id, ...body });
    });
  }

  /** Parameters by full name ("/node.param"); an empty list returns all parameters of all nodes. */
  getParameters(names: string[]): Promise<Param[]> {
    return this.paramRequest("getParameters", { parameterNames: names });
  }

  /** Resolves with the values after the request: a rejected set returns the old value. */
  setParameters(params: Param[]): Promise<Param[]> {
    return this.paramRequest("setParameters", { parameters: params });
  }

  subscribeParams(names: string[], cb: (p: Param) => void): () => void {
    const added: string[] = [];
    for (const n of names) {
      let set = this.paramListeners.get(n);
      if (!set) {
        set = new Set();
        this.paramListeners.set(n, set);
        added.push(n);
      }
      set.add(cb);
    }
    if (added.length && this.connected && this.can("parametersSubscribe")) this.send({ op: "subscribeParameterUpdates", parameterNames: added });
    return () => {
      const removed: string[] = [];
      for (const n of names) {
        const set = this.paramListeners.get(n);
        if (!set) continue;
        set.delete(cb);
        if (!set.size) {
          this.paramListeners.delete(n);
          removed.push(n);
        }
      }
      if (removed.length && this.connected && this.can("parametersSubscribe")) this.send({ op: "unsubscribeParameterUpdates", parameterNames: removed });
    };
  }

  // ------------------------------------------------------------- services

  serviceDefinitions(s: Service, part: "request" | "response"): Definitions {
    const sch = s[part];
    const text = sch?.schema ?? (part === "request" ? s.requestSchema : s.responseSchema) ?? "";
    return parseSchema(sch?.schemaName ?? `${s.type}_${part === "request" ? "Request" : "Response"}`, sch?.schemaEncoding ?? "ros2msg", text);
  }

  callService(name: string, request: unknown): Promise<unknown> {
    if (!this.connected) return Promise.reject(new Error("Not connected to the bridge"));
    if (!this.can("services")) return Promise.reject(new Error("The bridge does not expose services"));
    const s = this.serviceFor(name);
    if (!s) return Promise.reject(new Error(`Service ${name} not found`));
    let payload: Uint8Array, decode: (d: Uint8Array) => unknown;
    try {
      const reqDefs = this.serviceDefinitions(s, "request");
      payload = writeCdr(new MessageWriter(reqDefs), reqDefs, request);
      const reader = new MessageReader(this.serviceDefinitions(s, "response"));
      decode = (d) => normalize(reader.readMessage(d));
    } catch (e) {
      return Promise.reject(e);
    }
    const callId = this.nextRequest++;
    const enc = new TextEncoder().encode("cdr");
    const frame = new Uint8Array(13 + enc.length + payload.length);
    const dv = new DataView(frame.buffer);
    frame[0] = 2;
    dv.setUint32(1, s.id, true);
    dv.setUint32(5, callId, true);
    dv.setUint32(9, enc.length, true);
    frame.set(enc, 13);
    frame.set(payload, 13 + enc.length);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCalls.delete(callId);
        reject(new Error("Service call timed out"));
      }, SERVICE_TIMEOUT_MS);
      this.pendingCalls.set(callId, { resolve, reject, timer, decode });
      this.ws!.send(frame);
    });
  }
}
