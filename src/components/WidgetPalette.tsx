// Sidebar shown in edit mode: widgets are dragged onto the page grid (HTML5
// drag and drop, received by react-grid-layout) or clicked to append them.

import type { ReactNode } from "react";
import { WIDGETS, widgetDef } from "../widgets/index.ts";

/** Widget type being dragged from the palette (dataTransfer is unreadable during dragover). */
let draggingType: string | null = null;

/** Size of the widget being dragged, or false when the drag is not from the palette. */
export function paletteDragSize(): { w: number; h: number } | false {
  const def = draggingType ? widgetDef(draggingType) : undefined;
  return def ? { ...def.size } : false;
}

export function takeDraggedType(): string | null {
  const t = draggingType;
  draggingType = null;
  return t;
}

const ICONS: Record<string, ReactNode> = {
  value: (
    <text x="8" y="11.5" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="currentColor" stroke="none" fontFamily="ui-monospace, monospace">
      1.2
    </text>
  ),
  bar: (
    <>
      <rect x="1.5" y="5.5" width="13" height="5" rx="1.5" />
      <rect x="1.5" y="5.5" width="8" height="5" rx="1.5" fill="currentColor" />
    </>
  ),
  indicator: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="8" cy="8" r="3" fill="currentColor" />
    </>
  ),
  plot: <polyline points="1.5,11 4.5,5 7.5,9.5 10.5,3.5 14.5,8" fill="none" />,
  message: (
    <text x="8" y="11.5" textAnchor="middle" fontSize="9" fontWeight="700" fill="currentColor" stroke="none" fontFamily="ui-monospace, monospace">
      {"{}"}
    </text>
  ),
  log: <path d="M2 4h12M2 8h12M2 12h8" />,
  publish: <path d="M2 8.5 14 2.5 10.5 14 8 9.5zM8 9.5l6-7" strokeLinejoin="round" />,
  buttons: (
    <>
      <rect x="1.5" y="4" width="6" height="8" rx="1.5" />
      <rect x="8.5" y="4" width="6" height="8" rx="1.5" fill="currentColor" />
    </>
  ),
  slider: (
    <>
      <path d="M1.5 8h13" />
      <circle cx="10" cy="8" r="2.5" fill="currentColor" />
    </>
  ),
  service: <path d="M2 5.5h10m-2.5-2.5L12 5.5 9.5 8M14 10.5H4m2.5-2.5L4 10.5 6.5 13" strokeLinejoin="round" />,
  params: (
    <>
      <path d="M2 4h12M2 8h12M2 12h12" />
      <circle cx="5" cy="4" r="1.6" fill="currentColor" />
      <circle cx="11" cy="8" r="1.6" fill="currentColor" />
      <circle cx="7" cy="12" r="1.6" fill="currentColor" />
    </>
  ),
  text: <path d="M3 3.5h10M8 3.5v10" />,
  section: (
    <>
      <path d="M1.5 5h6" strokeWidth="2.2" />
      <path d="M1.5 10.5h13" />
    </>
  ),
  divider: <path d="M1.5 8h13" strokeDasharray="2.5 2" />,
};

export function WidgetIcon({ type }: { type: string }) {
  return (
    <svg className="widget-icon" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
      {ICONS[type] ?? <rect x="2" y="2" width="12" height="12" rx="2" />}
    </svg>
  );
}

export function WidgetPalette({ onAdd }: { onAdd: (type: string) => void }) {
  return (
    <aside className="palette" aria-label="Widgets">
      <p className="palette-hint">Drag a widget onto the page, or click it to add it at the bottom.</p>
      {(["Read", "Write", "Layout"] as const).map((cat) => (
        <section key={cat}>
          <h3>{cat}</h3>
          {WIDGETS.filter((w) => w.category === cat).map((w) => (
            <button
              key={w.type}
              className="palette-item"
              draggable
              title={w.description}
              onClick={() => onAdd(w.type)}
              onDragStart={(e) => {
                draggingType = w.type;
                // Firefox only starts a drag when some data is set.
                e.dataTransfer.setData("text/plain", w.type);
                e.dataTransfer.effectAllowed = "copy";
              }}
              onDragEnd={() => {
                draggingType = null;
              }}
            >
              <WidgetIcon type={w.type} />
              <span className="palette-text">
                <span className="palette-label">{w.label}</span>
                <span className="palette-desc">{w.description}</span>
              </span>
            </button>
          ))}
        </section>
      ))}
    </aside>
  );
}
