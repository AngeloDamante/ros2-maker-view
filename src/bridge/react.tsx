import { createContext, useContext, useEffect, useReducer, useRef, useSyncExternalStore, type ReactNode } from "react";
import { BridgeClient, now, type TopicListener } from "./client.ts";

const BridgeContext = createContext<BridgeClient | null>(null);

export function BridgeProvider({ client, children }: { client: BridgeClient; children: ReactNode }) {
  return <BridgeContext.Provider value={client}>{children}</BridgeContext.Provider>;
}

export function useBridge(): BridgeClient {
  const c = useContext(BridgeContext);
  if (!c) throw new Error("useBridge outside BridgeProvider");
  return c;
}

/** Re-renders on connection state and ROS graph changes; returns the graph version. */
export function useBridgeVersion(): number {
  const c = useBridge();
  return useSyncExternalStore(
    (cb) => c.onChange(cb),
    () => c.version,
  );
}

export function useBridgeLog(): number {
  const c = useBridge();
  return useSyncExternalStore(
    (cb) => c.onLog(cb),
    () => c.logVersion,
  );
}

// A single shared ticker drives the UI refresh of every widget (15 Hz), so a
// 1 kHz topic does not cause 1000 React renders per second.
const tickers = new Set<() => void>();
setInterval(() => tickers.forEach((t) => t()), 66);

export function useTicker(fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const t = () => ref.current();
    tickers.add(t);
    return () => {
      tickers.delete(t);
    };
  }, []);
}

/** Calls `listener` for every message on `topic` (no re-render). */
export function useTopicListener(topic: string | undefined, listener: TopicListener) {
  const client = useBridge();
  const ref = useRef(listener);
  ref.current = listener;
  useEffect(() => {
    if (!topic) return;
    return client.subscribe(topic, (m, t) => ref.current(m, t));
  }, [client, topic]);
}

export interface TopicView {
  msg: unknown;
  t?: number;
  hz: number;
  stale: boolean;
  /** Resolved topic name, when advertised by the bridge. */
  topic?: string;
  schemaName?: string;
}

/** Latest message on a topic, refreshed at the ticker rate. */
export function useTopic(topic: string | undefined, staleAfterS = 2): TopicView {
  const client = useBridge();
  const [, force] = useReducer((x: number) => x + 1, 0);
  const dirty = useRef(false);
  const last = useRef("");
  useBridgeVersion();
  useTopicListener(topic, () => {
    dirty.current = true;
  });
  const info = topic ? client.topicInfo(topic) : undefined;
  const t = info?.latest?.t;
  const stale = t === undefined || now() - t > staleAfterS;
  useTicker(() => {
    const i = topic ? client.topicInfo(topic) : undefined;
    const lt = i?.latest?.t;
    const key = `${lt === undefined || now() - lt > staleAfterS}|${i?.hz}`;
    if (dirty.current || key !== last.current) {
      dirty.current = false;
      last.current = key;
      force();
    }
  });
  return { msg: info?.latest?.msg, t, hz: info?.hz ?? 0, stale, topic: info?.channel?.topic, schemaName: info?.channel?.schemaName };
}
