import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Layout, LayoutItem } from "react-grid-layout";
import { api } from "../api.ts";
import { BridgeClient } from "../bridge/client.ts";
import { BridgeProvider, useBridge, useBridgeVersion } from "../bridge/react.tsx";
import { downloadJson, downloadStandalone } from "../lib/exportHtml.ts";
import { computeVarValues, formatOptionLines, optionLabel, optionValue, parseOptionLines, type VarValues } from "../lib/vars.ts";
import * as tree from "../lib/tree.ts";
import { GRID_COLS, newId, normalizeView, type Page, type ViewDoc, type WidgetDoc } from "../types.ts";
import { widgetDef } from "../widgets/index.ts";
import type { FieldSpec } from "../widgets/types.ts";
import { BridgeDatalists, ConfigForm } from "./ConfigForm.tsx";
import { Drawer, lsGet, lsSet, Menu, MenuItem, ThemeToggle } from "./ui.tsx";
import { EditorContext, WidgetGrid, type EditorApi } from "./WidgetGrid.tsx";
import { WidgetPalette } from "./WidgetPalette.tsx";

interface Props {
  id: string;
  standalone: boolean;
  readonly: boolean;
  initialDoc?: ViewDoc;
  initialPage?: string;
}

export function ViewScreen(props: Props) {
  const client = useMemo(() => new BridgeClient(), []);
  useEffect(() => () => client.disconnect(), [client]);
  const [doc, setDoc] = useState<ViewDoc | null>(props.initialDoc ? normalizeView(props.initialDoc) : null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (props.initialDoc) return;
    api
      .get(props.id)
      .then((d) => setDoc(normalizeView(d)))
      .catch((e) => setError(e.message));
  }, [props.id, props.initialDoc]);
  if (error)
    return (
      <div className="center-msg">
        <h2>Cannot open view "{props.id}"</h2>
        <p className="muted">{error}</p>
        <a href="#/">← All views</a>
      </div>
    );
  if (!doc) return <div className="center-msg muted">Loading…</div>;
  return (
    <BridgeProvider client={client}>
      <ViewEditor {...props} initialDoc={doc} />
    </BridgeProvider>
  );
}

function defaultBridgeUrl(id: string, doc: ViewDoc): string {
  const host = location.hostname || "localhost";
  const fromQuery = new URLSearchParams(location.search).get("bridge");
  return (fromQuery || lsGet(`rmv.bridge.${id}`) || doc.bridgeUrl || `ws://{host}:8765`).replace("{host}", host);
}

/** Widgets with the grid positions of `layout`; the same array when nothing moved. */
function applyLayout(widgets: WidgetDoc[], layout: Layout): WidgetDoc[] {
  let changed = false;
  const out = widgets.map((w) => {
    const l = layout.find((x) => x.i === w.id);
    if (!l || (l.x === w.x && l.y === w.y && l.w === w.w && l.h === w.h)) return w;
    changed = true;
    return { ...w, x: l.x, y: l.y, w: l.w, h: l.h };
  });
  return changed ? out : widgets;
}

const VIEW_FIELDS: FieldSpec[] = [
  { key: "title", label: "Title", kind: "text" },
  { key: "description", label: "Description", kind: "textarea" },
  {
    key: "bridgeUrl",
    label: "Default bridge URL",
    kind: "text",
    placeholder: "ws://{host}:8765",
    help: "{host} is replaced with the host the page was opened from. Each browser can still override it from the header.",
  },
  {
    key: "variables",
    label: "Variables",
    kind: "list",
    help: "Selectors shown in the header. Use ${name} in topics, fields, nodes, services, titles and messages.",
    fields: [
      { key: "name", label: "Name", kind: "text", placeholder: "motor" },
      { key: "label", label: "Label", kind: "text", placeholder: "shown in the header" },
      {
        key: "options",
        label: "Options",
        kind: "stringList",
        placeholder: "left; dev_id=115\nright; dev_id=104",
        help: "One per line: value; key=value; … (each key=value sets another variable when the option is selected; label=… sets the displayed text).",
        parseLines: parseOptionLines,
        formatLines: (v) => formatOptionLines(Array.isArray(v) ? v : []),
      },
      { key: "default", label: "Default", kind: "text", placeholder: "first option" },
    ],
    newItem: () => ({ name: "var", label: "", options: [], default: "" }),
    itemLabel: (v) => (v.name ? `\${${v.name}}` : "variable"),
  },
];

function ViewEditor({ id, standalone, readonly, initialDoc, initialPage }: Props & { initialDoc: ViewDoc }) {
  const [doc, setDoc] = useState<ViewDoc>(initialDoc);
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(initialDoc));
  const dirty = JSON.stringify(doc) !== savedJson;
  const [editing, setEditing] = useState(() => {
    const start = sessionStorage.getItem("rmv.startEdit") === id;
    sessionStorage.removeItem("rmv.startEdit");
    return start;
  });
  const [pageId, setPageId] = useState(() => (doc.pages.some((p) => p.id === initialPage) ? initialPage! : doc.pages[0]!.id));
  const page = doc.pages.find((p) => p.id === pageId) ?? doc.pages[0]!;
  const [configId, setConfigId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);
  const [selection, setSelection] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(lsGet(`rmv.vars.${id}`) || "{}");
    } catch {
      return {};
    }
  });
  const vars: VarValues = useMemo(() => computeVarValues(doc.variables, selection), [doc.variables, selection]);

  useEffect(() => {
    document.title = doc.title;
  }, [doc.title]);
  useEffect(() => {
    if (!standalone) history.replaceState(null, "", `${location.pathname}${location.search}#/v/${encodeURIComponent(id)}/${encodeURIComponent(page.id)}`);
  }, [id, page.id, standalone]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  /** Updates the widget tree of the current page (group heights follow their children). */
  const updateWidgets = useCallback(
    (fn: (ws: WidgetDoc[]) => WidgetDoc[]) =>
      setDoc((d) => ({
        ...d,
        pages: d.pages.map((p) => {
          if (p.id !== page.id) return p;
          const widgets = tree.autoSizeGroups(fn(p.widgets));
          return widgets === p.widgets ? p : { ...p, widgets };
        }),
      })),
    [page.id],
  );
  const updateWidget = (wid: string, fn: (w: WidgetDoc) => WidgetDoc) => updateWidgets((ws) => tree.updateWidget(ws, wid, fn));

  const save = async () => {
    const json = JSON.stringify(doc);
    try {
      if (standalone) {
        await downloadStandalone(id, doc);
        setSavedJson(json);
        setToast({ text: "Downloaded the updated HTML file (replace the old one)" });
        return;
      }
      if (readonly) {
        setToast({ text: "The server is read-only: use Download JSON", bad: true });
        return;
      }
      await api.save(id, doc);
      setSavedJson(json);
      setToast({ text: `Saved views/${id}.json` });
    } catch (e) {
      setToast({ text: `Save failed: ${(e as Error).message}`, bad: true });
    }
  };
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        saveRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  /**
   * Adds a widget at the bottom of the page, or where it was dropped in a container
   * (`layout` = positions of the container's widgets after the drop).
   */
  const addWidget = (type: string, drop?: { container: string | null; item: LayoutItem; layout: Layout }) => {
    const def = widgetDef(type);
    if (!def) return;
    const w: WidgetDoc = drop
      ? { id: newId("w"), type, x: drop.item.x, y: drop.item.y, w: drop.item.w, h: drop.item.h, config: def.defaults() }
      : { id: newId("w"), type, x: 0, y: tree.bottomOf(page.widgets), w: def.size.w, h: def.size.h, config: def.defaults() };
    updateWidgets((ws) => tree.mapContainer(ws, drop ? drop.container : null, (list) => [...(drop ? applyLayout(list, drop.layout) : list), w]));
    setSettingsOpen(false);
    setConfigId(w.id);
  };

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(lsGet(`rmv.collapsed.${id}`) || "{}");
    } catch {
      return {};
    }
  });

  const editor: EditorApi = {
    editing,
    vars,
    selectedId: configId,
    isCollapsed: (gid) => collapsed[gid] ?? !!tree.findWidget(page.widgets, gid)?.widget.config.startCollapsed,
    toggleCollapsed: (gid) => {
      const next = { ...collapsed, [gid]: !editor.isCollapsed(gid) };
      setCollapsed(next);
      lsSet(`rmv.collapsed.${id}`, JSON.stringify(next));
    },
    configure: (wid) => {
      setSettingsOpen(false);
      setConfigId(wid);
    },
    duplicate: (wid) =>
      updateWidgets((ws) => {
        const found = tree.findWidget(ws, wid);
        if (!found) return ws;
        return tree.mapContainer(ws, found.parent, (list) => [...list, { ...tree.cloneWithNewIds(found.widget, () => newId("w")), y: tree.bottomOf(list) }]);
      }),
    remove: (wid) => {
      updateWidgets((ws) => tree.removeWidget(ws, wid));
      if (configId === wid) setConfigId(null);
    },
    layoutChanged: (container, layout) => updateWidgets((ws) => tree.mapContainer(ws, container, (list) => applyLayout(list, layout))),
    dropNew: (container, type, item, layout) => addWidget(type, { container, item, layout }),
    move: (wid, target, x, y, cols) => updateWidgets((ws) => tree.moveWidget(ws, wid, target, x, y, cols)),
  };

  const addPage = () => {
    const p: Page = { id: newId("p"), title: `Page ${doc.pages.length + 1}`, widgets: [] };
    setDoc((d) => ({ ...d, pages: [...d.pages, p] }));
    setPageId(p.id);
  };
  const renamePage = (pid: string, title: string) => setDoc((d) => ({ ...d, pages: d.pages.map((p) => (p.id === pid ? { ...p, title } : p)) }));
  const movePage = (pid: string, delta: number) =>
    setDoc((d) => {
      const i = d.pages.findIndex((p) => p.id === pid), j = i + delta;
      if (i < 0 || j < 0 || j >= d.pages.length) return d;
      const pages = [...d.pages];
      [pages[i], pages[j]] = [pages[j]!, pages[i]!];
      return { ...d, pages };
    });
  const deletePage = (pid: string) => {
    if (doc.pages.length <= 1) return;
    const i = doc.pages.findIndex((p) => p.id === pid);
    setDoc((d) => ({ ...d, pages: d.pages.filter((p) => p.id !== pid) }));
    setPageId(doc.pages[i === 0 ? 1 : i - 1]!.id);
  };

  const configWidget = configId ? tree.findWidget(page.widgets, configId)?.widget : undefined;
  const configDef = configWidget ? widgetDef(configWidget.type) : undefined;

  const setVar = (name: string, value: string) => {
    const next = { ...selection, [name]: value };
    setSelection(next);
    lsSet(`rmv.vars.${id}`, JSON.stringify(next));
  };

  return (
    <div className={"view" + (editing ? " is-editing" : "") + (configWidget || settingsOpen ? " has-drawer" : "")}>
      <header className="topbar">
        <div className="tb-left">
          {!standalone && (
            <a className="home" href="#/" title="All views">
              ◧
            </a>
          )}
          <h1 title={doc.description || doc.title}>{doc.title}</h1>
          {dirty && <span className="pill warn" title="Unsaved changes">unsaved</span>}
        </div>
        <PageTabs
          pages={doc.pages}
          current={page.id}
          editing={editing}
          onSelect={setPageId}
          onAdd={addPage}
          onRename={renamePage}
          onMove={movePage}
          onDelete={deletePage}
        />
        {(doc.variables || []).length > 0 && (
          <div className="vars">
            {(doc.variables || []).map((v) => (
              <label key={v.name} className="var">
                <span>{v.label || v.name}</span>
                <select value={vars[v.name] ?? ""} onChange={(e) => setVar(v.name, e.target.value)}>
                  {v.options.map((o) => (
                    <option key={optionValue(o)} value={optionValue(o)}>
                      {optionLabel(o)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        )}
        <ConnectionBar id={id} doc={doc} />
        <div className="tb-actions">
          {editing ? (
            <>
              <button
                onClick={() => {
                  setConfigId(null);
                  setSettingsOpen(!settingsOpen);
                }}
                className={settingsOpen ? "on" : ""}
              >
                Settings
              </button>
              <button className="primary" onClick={save} disabled={!dirty && !standalone} title="Ctrl+S">
                {standalone ? "Save HTML" : "Save"}
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setConfigId(null);
                  setSettingsOpen(false);
                }}
              >
                Done
              </button>
            </>
          ) : (
            <>
              {dirty && (
                <button className="primary" onClick={save}>
                  {standalone ? "Save HTML" : "Save"}
                </button>
              )}
              <button onClick={() => setEditing(true)}>Edit</button>
            </>
          )}
          <ThemeToggle />
          <Menu label="⋯" title="More">
            <MenuItem onClick={() => downloadStandalone(id, doc).catch((e) => setToast({ text: `Export failed: ${e.message}`, bad: true }))} hint="single file, opens without the server">
              Export standalone HTML
            </MenuItem>
            <MenuItem onClick={() => downloadJson(id, doc)} hint="view definition">
              Download JSON
            </MenuItem>
            {!standalone && dirty && (
              <MenuItem onClick={() => setDoc(JSON.parse(savedJson))} hint="discard unsaved changes">
                Revert
              </MenuItem>
            )}
            <MenuItem onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}>Fullscreen</MenuItem>
          </Menu>
        </div>
      </header>

      <div className="view-body">
      {editing && <WidgetPalette onAdd={(type) => addWidget(type)} />}
      <main className="canvas">
        <EditorContext.Provider value={editor}>
          <WidgetGrid key={page.id} container={null} widgets={page.widgets} cols={GRID_COLS} />
        </EditorContext.Provider>
        {!page.widgets.length && (
          <div className="empty-page">
            {editing ? (
              <p>This page is empty: drag a widget here from the panel on the left.</p>
            ) : (
              <p>
                This page is empty. <button onClick={() => setEditing(true)}>Edit</button>
              </p>
            )}
          </div>
        )}
      </main>
      </div>

      {configWidget && configDef && (
        <Drawer
          title={`${configDef.label} widget`}
          onClose={() => setConfigId(null)}
          footer={
            <>
              <span className="muted small-text">Changes apply immediately · Save to keep them</span>
              <button onClick={() => setConfigId(null)}>Close</button>
            </>
          }
        >
          <BridgeDatalists />
          <div className="cfg-row">
            <label className="cfg-label">Title</label>
            <div className="cfg-input">
              <input type="text" value={configWidget.title ?? ""} placeholder="no title bar" onChange={(e) => updateWidget(configWidget.id, (w) => ({ ...w, title: e.target.value }))} />
            </div>
          </div>
          <ConfigForm
            fields={configDef.fields}
            value={{ ...configDef.defaults(), ...configWidget.config }}
            vars={vars}
            onChange={(config) => updateWidget(configWidget.id, (w) => ({ ...w, config }))}
          />
        </Drawer>
      )}
      {settingsOpen && (
        <Drawer title="View settings" onClose={() => setSettingsOpen(false)}>
          <div className="cfg-row">
            <label className="cfg-label">File</label>
            <div className="cfg-input mono muted">{standalone ? "standalone HTML export" : `views/${id}.json`}</div>
          </div>
          <ConfigForm fields={VIEW_FIELDS} value={doc as any} vars={vars} onChange={(v) => setDoc((d) => ({ ...d, ...v }) as ViewDoc)} />
        </Drawer>
      )}
      {toast && <div className={"toast" + (toast.bad ? " bad" : "")}>{toast.text}</div>}
    </div>
  );
}

function ConnectionBar({ id, doc }: { id: string; doc: ViewDoc }) {
  const client = useBridge();
  useBridgeVersion();
  // Views open disconnected: the user connects when the bridge is running.
  const [url, setUrl] = useState(() => defaultBridgeUrl(id, doc));
  const connect = () => {
    lsSet(`rmv.bridge.${id}`, url);
    client.connect(url.trim());
  };
  const busy = client.state !== "disconnected";
  return (
    <div className="conn">
      <input
        type="text"
        className="mono"
        value={url}
        spellCheck={false}
        aria-label="foxglove_bridge URL"
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") connect();
        }}
      />
      <button onClick={() => (busy ? client.disconnect() : connect())}>{busy ? "Disconnect" : "Connect"}</button>
      <span
        className={"pill " + (client.state === "connected" ? "ok" : client.lastError ? "bad" : "")}
        title={
          client.state === "connected"
            ? client.capabilities.join(", ")
            : client.lastError || "Not connected: start foxglove_bridge, then press Connect. Views can be edited offline."
        }
      >
        {client.state === "connected"
          ? `connected · ${client.channels.size} topics`
          : client.state === "connecting"
            ? "connecting…"
            : client.lastError
              ? client.lastError.startsWith("Connection") ? "connection lost" : "bridge unreachable"
              : "disconnected"}
      </span>
    </div>
  );
}

function PageTabs({
  pages,
  current,
  editing,
  onSelect,
  onAdd,
  onRename,
  onMove,
  onDelete,
}: {
  pages: Page[];
  current: string;
  editing: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, title: string) => void;
  onMove: (id: string, delta: number) => void;
  onDelete: (id: string) => void;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [armDelete, setArmDelete] = useState(false);
  if (pages.length <= 1 && !editing) return <div className="tabs" />;
  return (
    <nav className="tabs">
      {pages.map((p) =>
        renaming === p.id ? (
          <input
            key={p.id}
            className="tab-rename"
            autoFocus
            defaultValue={p.title}
            onBlur={(e) => {
              onRename(p.id, e.target.value.trim() || p.title);
              setRenaming(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setRenaming(null);
            }}
          />
        ) : (
          <button
            key={p.id}
            className={"tab" + (p.id === current ? " sel" : "")}
            onClick={() => onSelect(p.id)}
            onDoubleClick={() => editing && setRenaming(p.id)}
            title={editing ? "Double-click to rename" : undefined}
          >
            {p.title}
          </button>
        ),
      )}
      {editing && (
        <span className="tab-tools" onMouseLeave={() => setArmDelete(false)}>
          <button className="icon" title="Move page left" onClick={() => onMove(current, -1)}>
            ◀
          </button>
          <button className="icon" title="Move page right" onClick={() => onMove(current, 1)}>
            ▶
          </button>
          <button className="icon" title="Rename page" onClick={() => setRenaming(current)}>
            ✎
          </button>
          <button
            className={"icon danger" + (armDelete ? " armed" : "")}
            title={pages.length <= 1 ? "A view needs at least one page" : armDelete ? "Click again to delete the page" : "Delete page"}
            disabled={pages.length <= 1}
            onClick={() => {
              if (armDelete) {
                onDelete(current);
                setArmDelete(false);
              } else setArmDelete(true);
            }}
          >
            {armDelete ? "✓" : "✕"}
          </button>
          <button className="icon" title="Add page" onClick={onAdd}>
            ＋
          </button>
        </span>
      )}
    </nav>
  );
}
