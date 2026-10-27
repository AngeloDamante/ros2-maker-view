import { useEffect, useRef, useState } from "react";
import { api, slugify, VIEW_ID_RE, type ServerInfo } from "../api.ts";
import { fmtAgo } from "../lib/format.ts";
import { downloadStandalone, parseImportedFile } from "../lib/exportHtml.ts";
import { emptyView, normalizeView, type ViewSummary } from "../types.ts";
import { ThemeToggle } from "./ui.tsx";

export function Home({ info }: { info: ServerInfo | null }) {
  const [views, setViews] = useState<ViewSummary[] | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [id, setId] = useState("");
  const [idTouched, setIdTouched] = useState(false);
  const [armDelete, setArmDelete] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const readonly = !!info?.readonly;

  const reload = () =>
    api
      .list()
      .then((v) => {
        setViews(v);
        setError("");
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    document.title = "ROS2 Maker View";
    reload();
  }, []);

  const uniqueId = (base: string) => {
    const taken = new Set((views || []).map((v) => v.id));
    let candidate = base, n = 2;
    while (taken.has(candidate)) candidate = `${base}_${n++}`;
    return candidate;
  };

  const open = (vid: string, edit = false) => {
    if (edit) sessionStorage.setItem("rmv.startEdit", vid);
    location.hash = `#/v/${encodeURIComponent(vid)}`;
  };

  const create = async () => {
    const vid = (idTouched ? id : slugify(title)).trim();
    if (!VIEW_ID_RE.test(vid)) return setError("Invalid id: letters, digits, _ and - only");
    if (views?.some((v) => v.id === vid)) return setError(`A view "${vid}" already exists`);
    try {
      await api.save(vid, emptyView(title.trim() || vid));
      open(vid, true);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const duplicate = async (vid: string) => {
    try {
      const doc = await api.get(vid);
      const nid = uniqueId(`${vid}_copy`);
      await api.save(nid, { ...doc, title: `${doc.title} (copy)` });
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (vid: string) => {
    try {
      await api.remove(vid);
      setArmDelete(null);
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const importFile = async (f: File) => {
    try {
      const parsed = parseImportedFile(f.name, await f.text());
      const doc = normalizeView(parsed.doc);
      const nid = uniqueId(slugify(parsed.id || f.name.replace(/\.(json|html?)$/i, "")));
      await api.save(nid, doc);
      open(nid);
    } catch (e) {
      setError(`Import failed: ${(e as Error).message}`);
    }
  };

  const exportView = async (vid: string) => {
    try {
      await downloadStandalone(vid, normalizeView(await api.get(vid)));
    } catch (e) {
      setError(`Export failed: ${(e as Error).message}`);
    }
  };

  return (
    <div className="home-page">
      <header className="topbar">
        <div className="tb-left">
          <span className="home">◧</span>
          <h1>ROS2 Maker View</h1>
          {readonly && <span className="pill">read-only server</span>}
        </div>
        <div className="tb-actions">
          <button onClick={() => fileRef.current?.click()} disabled={readonly} title="Import a view .json or an exported .html">
            Import
          </button>
          <button className="primary" onClick={() => setCreating(true)} disabled={readonly}>
            New view
          </button>
          <ThemeToggle />
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.html,.htm,application/json,text/html"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importFile(f);
            e.target.value = "";
          }}
        />
      </header>
      <main className="home-main">
        {error && (
          <div className="banner bad">
            {error}
            <button className="icon" onClick={() => setError("")}>
              ✕
            </button>
          </div>
        )}
        {creating && (
          <form
            className="card new-view"
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
          >
            <h2>New view</h2>
            <div className="row">
              <label>
                Title
                <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Arm monitor" />
              </label>
              <label>
                File id
                <input
                  className="mono"
                  value={idTouched ? id : slugify(title)}
                  onChange={(e) => {
                    setIdTouched(true);
                    setId(e.target.value);
                  }}
                />
              </label>
            </div>
            <p className="muted small-text">Saved as views/{(idTouched ? id : slugify(title)) || "…"}.json</p>
            <div className="row">
              <button type="submit" className="primary" disabled={!title.trim() && !id.trim()}>
                Create and edit
              </button>
              <button type="button" onClick={() => setCreating(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}
        {views === null && !error && <p className="muted">Loading…</p>}
        {views && !views.length && <p className="muted">No views yet: create one, or import a .json / exported .html.</p>}
        <div className="view-grid">
          {(views || []).map((v) => (
            <div key={v.id} className="card view-card">
              <a className="vc-main" href={`#/v/${encodeURIComponent(v.id)}`}>
                <h2>{v.title}</h2>
                {v.description && <p className="desc">{v.description}</p>}
                <p className="meta mono">
                  {v.id}.json · {v.pages} page{v.pages === 1 ? "" : "s"} · {v.widgets} widget{v.widgets === 1 ? "" : "s"} · {fmtAgo(v.updated)}
                </p>
              </a>
              <div className="vc-actions" onMouseLeave={() => setArmDelete(null)}>
                <button onClick={() => open(v.id)} className="primary">
                  Open
                </button>
                <button onClick={() => open(v.id, true)} disabled={readonly}>
                  Edit
                </button>
                <button onClick={() => exportView(v.id)} title="Download a standalone HTML file">
                  Export HTML
                </button>
                <button onClick={() => duplicate(v.id)} disabled={readonly}>
                  Duplicate
                </button>
                <button className={"danger" + (armDelete === v.id ? " armed" : "")} disabled={readonly} onClick={() => (armDelete === v.id ? remove(v.id) : setArmDelete(v.id))}>
                  {armDelete === v.id ? "Confirm delete" : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
