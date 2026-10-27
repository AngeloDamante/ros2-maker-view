// Continuous publishing at a fixed rate, shared by the write widgets.
// Without a rate a widget publishes once per action; with a rate its action
// becomes an on/off switch.

import { useEffect, useReducer, useRef, useState } from "react";
import { useBridge, useBridgeVersion } from "../bridge/react.tsx";
import type { FieldSpec } from "./types.ts";

/** Rate from the config, or 0 when the widget publishes once per action. */
export function rateOf(v: unknown): number {
  const hz = Number(v);
  return Number.isFinite(hz) && hz > 0 ? Math.min(hz, 200) : 0;
}

export function rateField(help: string): FieldSpec {
  return { key: "repeatHz", label: "Rate [Hz]", kind: "number", placeholder: "none: publish once", help };
}

/**
 * Calls `send` every 1/hz s while running (the first message goes out immediately).
 * `send` returns false on error, which stops the repetition; disconnecting and
 * unmounting (e.g. changing page) stop it too.
 */
export function useRepeater(hz: number, send: () => boolean) {
  const client = useBridge();
  useBridgeVersion();
  const [running, setRunning] = useState(false);
  const sent = useRef(0);
  const sendRef = useRef(send);
  sendRef.current = send;
  const [, refresh] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    if (!running || hz <= 0) return;
    sent.current = 0;
    const tick = () => {
      if (sendRef.current()) sent.current++;
      else setRunning(false);
    };
    tick();
    const timer = setInterval(tick, 1000 / hz);
    // the "N sent" counter is refreshed once per second, not at the publish rate
    const display = setInterval(refresh, 1000);
    return () => {
      clearInterval(timer);
      clearInterval(display);
    };
  }, [running, hz]);

  useEffect(() => {
    if (!client.connected) setRunning(false);
  }, [client.connected]);
  useEffect(() => {
    if (hz <= 0) setRunning(false);
  }, [hz]);

  return { running: running && hz > 0, setRunning, sent: sent.current };
}
