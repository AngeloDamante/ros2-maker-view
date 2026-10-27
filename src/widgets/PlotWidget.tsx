import { useEffect, useReducer, useRef, useState } from "react";
import { useBridge, useTicker } from "../bridge/react.tsx";
import { now } from "../bridge/client.ts";
import { canvasColor, cssColor, seriesColor } from "../lib/colors.ts";
import { fmtNumber } from "../lib/format.ts";
import { getPath, toNumber } from "../lib/path.ts";
import { transform } from "./resolve.ts";
import type { WidgetDef, WidgetProps } from "./types.ts";

interface Series {
  topic: string;
  path: string;
  label?: string;
  color?: string;
  scale?: number | null;
  offset?: number | null;
  step?: boolean;
}

interface RefLine {
  value: number;
  label?: string;
  color?: string;
}

interface Config {
  series?: Series[];
  window?: number;
  yMin?: number | null;
  yMax?: number | null;
  lines?: RefLine[];
  legend?: boolean;
  decimals?: number | null;
}

type Point = [t: number, v: number];

const WINDOWS = [5, 10, 30, 60, 120, 300];
const KEEP_S = 600;
const MAX_POINTS = 100_000;
const PAD = { L: 50, R: 10, T: 8, B: 18 };

function lowerIdx(a: Point[], t: number): number {
  let lo = 0, hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid]![0] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function niceStep(range: number): number {
  const raw = range / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * p;
}

function nearest(a: Point[], t: number): Point | undefined {
  if (!a.length) return undefined;
  let k = Math.min(lowerIdx(a, t), a.length - 1);
  if (k > 0 && Math.abs(a[k - 1]![0] - t) < Math.abs(a[k]![0] - t)) k--;
  return a[k];
}

function seriesName(s: Series): string {
  return s.label || [s.topic, s.path].filter(Boolean).join(" · ") || "series";
}

function PlotWidget({ config }: WidgetProps<Config>) {
  const client = useBridge();
  const series = config.series || [];
  const [win, setWin] = useState(Number(config.window) || 30);
  const [paused, setPaused] = useState(false);
  const [, force] = useReducer((x: number) => x + 1, 0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const data = useRef<Point[][]>([]);
  const st = useRef({ config, win, paused, pausedAt: 0, hoverT: null as number | null, autoPaused: false });
  st.current.config = config;
  st.current.win = win;
  st.current.paused = paused;

  useEffect(() => setWin(Number(config.window) || 30), [config.window]);

  // Subscriptions: one listener per distinct topic feeding all its series.
  const key = JSON.stringify(series.map((s) => [s.topic, s.path, s.scale, s.offset]));
  useEffect(() => {
    const ser = series;
    data.current = ser.map(() => []);
    const byTopic = new Map<string, number[]>();
    ser.forEach((s, i) => {
      if (!s.topic) return;
      if (!byTopic.has(s.topic)) byTopic.set(s.topic, []);
      byTopic.get(s.topic)!.push(i);
    });
    const unsubs = [...byTopic].map(([topic, idx]) =>
      client.subscribe(topic, (msg, t) => {
        for (const i of idx) {
          const s = ser[i]!;
          const v = transform(toNumber(getPath(msg, s.path || "")), s);
          if (v === undefined) continue;
          const arr = data.current[i]!;
          arr.push([t, v]);
          if (arr.length > MAX_POINTS) arr.splice(0, arr.length - MAX_POINTS);
        }
      }),
    );
    const trim = setInterval(() => {
      const tmin = now() - KEEP_S;
      for (const arr of data.current) {
        const k = lowerIdx(arr, tmin);
        if (k) arr.splice(0, k);
      }
    }, 5000);
    return () => {
      unsubs.forEach((u) => u());
      clearInterval(trim);
    };
  }, [client, key]);

  useEffect(() => {
    let raf = 0, last = 0;
    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      if (ts - last < 33 || document.hidden) return;
      last = ts;
      draw();
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  useTicker(force);

  function draw() {
    const cv = canvasRef.current;
    if (!cv) return;
    const { config: cfg, win, paused, pausedAt, hoverT } = st.current;
    const ser = cfg.series || [];
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    }
    const g = cv.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const { L, R, T, B } = PAD, pw = W - L - R, ph = H - T - B;
    if (pw < 10 || ph < 10) return;
    const tEnd = paused ? pausedAt : now(), tStart = tEnd - win;
    const lines = (cfg.lines || []).filter((l) => typeof l.value === "number");

    let lo = Infinity, hi = -Infinity;
    const ranges = data.current.map((arr) => [Math.max(0, lowerIdx(arr, tStart) - 1), Math.min(arr.length, lowerIdx(arr, tEnd) + 1)] as const);
    data.current.forEach((arr, i) => {
      const [i0, i1] = ranges[i]!;
      for (let k = i0; k < i1; k++) {
        const v = arr[k]![1];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    });
    for (const l of lines) {
      lo = Math.min(lo, l.value);
      hi = Math.max(hi, l.value);
    }
    if (!Number.isFinite(lo)) {
      lo = -1;
      hi = 1;
    }
    if (hi - lo < 1e-9) {
      lo -= 1;
      hi += 1;
    }
    const pad = (hi - lo) * 0.08;
    lo -= pad;
    hi += pad;
    if (typeof cfg.yMin === "number") lo = cfg.yMin;
    if (typeof cfg.yMax === "number") hi = cfg.yMax;
    if (hi <= lo) hi = lo + 1;

    const X = (t: number) => L + ((t - tStart) / win) * pw;
    const Y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * ph;
    const muted = canvasColor("muted"), grid = canvasColor("--grid");
    g.font = `10px ${canvasColor("--mono")}`;
    g.lineWidth = 1;

    // y grid
    const step = niceStep(hi - lo);
    g.textAlign = "right";
    g.textBaseline = "middle";
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      const y = Math.round(Y(v)) + 0.5;
      g.strokeStyle = grid;
      g.beginPath();
      g.moveTo(L, y);
      g.lineTo(W - R, y);
      g.stroke();
      g.fillStyle = muted;
      g.fillText(String(+v.toPrecision(6)), L - 5, y);
    }
    // x grid
    const xs = win <= 5 ? 1 : win <= 10 ? 2 : win <= 30 ? 5 : win <= 60 ? 10 : win <= 120 ? 20 : 60;
    g.textAlign = "center";
    g.textBaseline = "top";
    for (let s = 0; s <= win; s += xs) {
      const x = Math.round(X(tEnd - s)) + 0.5;
      g.strokeStyle = grid;
      g.beginPath();
      g.moveTo(x, T);
      g.lineTo(x, T + ph);
      g.stroke();
      g.fillStyle = muted;
      g.fillText(s === 0 ? (paused ? "paused" : "now") : `-${s}s`, Math.min(Math.max(x, L + 14), W - R - 14), T + ph + 4);
    }
    // reference lines
    g.setLineDash([4, 3]);
    for (const l of lines) {
      if (l.value < lo || l.value > hi) continue;
      const y = Math.round(Y(l.value)) + 0.5, c = canvasColor(l.color, "warn");
      g.strokeStyle = c;
      g.beginPath();
      g.moveTo(L, y);
      g.lineTo(W - R, y);
      g.stroke();
      if (l.label) {
        g.fillStyle = c;
        g.textAlign = "right";
        g.textBaseline = "bottom";
        g.fillText(l.label, W - R - 3, y - 2);
      }
    }
    g.setLineDash([]);

    // series
    g.save();
    g.beginPath();
    g.rect(L, T, pw, ph);
    g.clip();
    data.current.forEach((arr, i) => {
      const s = ser[i];
      if (!s) return;
      const [i0, i1] = ranges[i]!;
      const n = i1 - i0;
      if (n <= 0) return;
      const avgDt = n > 1 ? (arr[i1 - 1]![0] - arr[i0]![0]) / (n - 1) : 0;
      const gap = Math.max(1, avgDt * 8);
      g.strokeStyle = canvasColor(s.color || seriesColor(i));
      g.fillStyle = g.strokeStyle;
      g.lineWidth = 1.6;
      g.lineJoin = "round";
      g.beginPath();
      const decimate = n > pw * 2;
      let pen = false, prevT = 0, prevY = 0, col = -1, cMin = 0, cMax = 0, cLast = 0;
      for (let k = i0; k < i1; k++) {
        const [t, v] = arr[k]!;
        const x = X(t), y = Y(v);
        if (!pen || t - prevT > gap) {
          if (pen && n < 3) g.fillRect(X(prevT) - 1.5, prevY - 1.5, 3, 3);
          g.moveTo(x, y);
          pen = true;
          col = Math.floor(x);
          cMin = cMax = cLast = y;
        } else if (decimate) {
          const c = Math.floor(x);
          if (c === col) {
            if (y < cMin) cMin = y;
            if (y > cMax) cMax = y;
            cLast = y;
          } else {
            g.lineTo(col, cMin);
            g.lineTo(col, cMax);
            g.lineTo(col, cLast);
            g.lineTo(x, y);
            col = c;
            cMin = cMax = cLast = y;
          }
        } else {
          if (s.step) g.lineTo(x, prevY);
          g.lineTo(x, y);
        }
        prevT = t;
        prevY = y;
      }
      if (n === 1) g.fillRect(X(prevT) - 2, prevY - 2, 4, 4);
      g.stroke();
    });
    g.restore();

    // hover
    if (hoverT !== null && hoverT >= tStart && hoverT <= tEnd) {
      const x = Math.round(X(hoverT)) + 0.5;
      g.strokeStyle = canvasColor("--text");
      g.globalAlpha = 0.35;
      g.beginPath();
      g.moveTo(x, T);
      g.lineTo(x, T + ph);
      g.stroke();
      g.globalAlpha = 1;
      data.current.forEach((arr, i) => {
        const p = nearest(arr, hoverT);
        if (!p || Math.abs(p[0] - hoverT) > Math.max(0.5, win / 100)) return;
        g.fillStyle = canvasColor(ser[i]?.color || seriesColor(i));
        g.beginPath();
        g.arc(X(p[0]), Y(p[1]), 3.5, 0, 7);
        g.fill();
      });
    }
    if (data.current.every((_, i) => ranges[i]![1] <= ranges[i]![0])) {
      g.fillStyle = muted;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = `12px ${canvasColor("--mono")}`;
      g.fillText(ser.length ? "no data" : "no series configured", L + pw / 2, T + ph / 2);
    }
  }

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect(), pw = r.width - PAD.L - PAD.R;
    const f = (e.clientX - r.left - PAD.L) / pw;
    const s = st.current;
    const tEnd = s.paused ? s.pausedAt : now();
    s.hoverT = f >= 0 && f <= 1 ? tEnd - s.win + f * s.win : null;
    if (!s.paused && s.hoverT !== null) {
      s.pausedAt = tEnd;
      s.autoPaused = true;
      setPaused(true);
    }
  };
  const onLeave = () => {
    const s = st.current;
    s.hoverT = null;
    if (s.autoPaused) {
      s.autoPaused = false;
      setPaused(false);
    }
  };
  const togglePause = () => {
    st.current.autoPaused = false;
    if (!paused) st.current.pausedAt = now();
    setPaused(!paused);
  };

  const hoverT = st.current.hoverT;
  return (
    <div className="w-plot">
      <div className="w-toolbar">
        <div className="seg">
          {WINDOWS.map((w) => (
            <button key={w} className={w === win ? "on" : ""} onClick={() => setWin(w)}>
              {w < 60 ? `${w}s` : `${w / 60}m`}
            </button>
          ))}
        </div>
        <button className="small" onClick={togglePause}>
          {paused && !st.current.autoPaused ? "Resume" : "Pause"}
        </button>
        <button className="small" onClick={() => data.current.forEach((a) => a.splice(0))}>
          Clear
        </button>
      </div>
      {config.legend !== false && (
        <div className="legend">
          {series.map((s, i) => {
            const arr = data.current[i] || [];
            const p = hoverT !== null ? nearest(arr, hoverT) : arr[arr.length - 1];
            return (
              <span key={i} className="item">
                <i style={{ background: cssColor(s.color || seriesColor(i)) }} />
                {seriesName(s)}
                <b>{fmtNumber(p?.[1], config.decimals ?? undefined)}</b>
              </span>
            );
          })}
        </div>
      )}
      <div className="canvas-wrap">
        <canvas ref={canvasRef} onMouseMove={onMove} onMouseLeave={onLeave} />
      </div>
    </div>
  );
}

export const plotWidget: WidgetDef = {
  type: "plot",
  label: "Plot",
  description: "Time plot of one or more numeric fields, with reference lines.",
  category: "Read",
  size: { w: 12, h: 9 },
  minSize: { w: 4, h: 5 },
  defaults: () => ({ series: [{ topic: "", path: "data", label: "", color: "" }], window: 30, yMin: null, yMax: null, lines: [], legend: true }),
  fields: [
    {
      key: "series",
      label: "Series",
      kind: "list",
      fields: [
        { key: "topic", label: "Topic", kind: "topic" },
        { key: "path", label: "Field", kind: "path", topicKey: "topic", numeric: true, placeholder: "data" },
        { key: "label", label: "Label", kind: "text", placeholder: "default: topic · field" },
        { key: "color", label: "Color", kind: "color" },
        { key: "scale", label: "Scale", kind: "number", placeholder: "1" },
        { key: "offset", label: "Offset", kind: "number", placeholder: "0" },
        { key: "step", label: "Step line", kind: "bool", help: "Draw as steps (states, modes)." },
      ],
      newItem: () => ({ topic: "", path: "data", label: "", color: "" }),
      itemLabel: (s) => s.label || [s.topic, s.path].filter(Boolean).join(" · ") || "series",
    },
    {
      key: "window",
      label: "Default window",
      kind: "select",
      numeric: true,
      options: WINDOWS.map((w) => ({ value: String(w), label: `${w} s` })),
    },
    { key: "yMin", label: "Y min", kind: "number", placeholder: "auto" },
    { key: "yMax", label: "Y max", kind: "number", placeholder: "auto" },
    {
      key: "lines",
      label: "Reference lines",
      kind: "list",
      fields: [
        { key: "value", label: "Value", kind: "number" },
        { key: "label", label: "Label", kind: "text" },
        { key: "color", label: "Color", kind: "color" },
      ],
      newItem: () => ({ value: 0, label: "", color: "warn" }),
      itemLabel: (l) => `${l.label || "line"} = ${l.value ?? "?"}`,
    },
    { key: "decimals", label: "Legend decimals", kind: "number", placeholder: "auto" },
    { key: "legend", label: "Show legend", kind: "bool" },
  ],
  component: PlotWidget,
};
