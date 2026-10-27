import { useEffect, useRef, useState, type ReactNode } from "react";

/** Button opening a dropdown panel; closes on outside click, Escape or item click. */
export function Menu({ label, title, children, align = "right", className = "" }: { label: ReactNode; title?: string; children: ReactNode; align?: "left" | "right"; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className={"menu " + className} ref={ref}>
      <button className={open ? "on" : ""} title={title} onClick={() => setOpen(!open)}>
        {label}
      </button>
      {open && (
        <div className={"menu-panel " + align} onClick={(e) => (e.target as HTMLElement).closest("[data-close]") && setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ children, onClick, disabled, hint }: { children: ReactNode; onClick: () => void; disabled?: boolean; hint?: string }) {
  return (
    <button className="menu-item" data-close onClick={onClick} disabled={disabled}>
      <span>{children}</span>
      {hint && <span className="hint">{hint}</span>}
    </button>
  );
}

export function Drawer({ title, onClose, children, footer }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <aside className="drawer" role="dialog" aria-label={typeof title === "string" ? title : undefined}>
      <div className="drawer-head">
        <h2>{title}</h2>
        <button className="icon" title="Close (Esc)" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="drawer-body">{children}</div>
      {footer && <div className="drawer-foot">{footer}</div>}
    </aside>
  );
}

export type Theme = "light" | "dark";

/** Saved theme; light unless dark was chosen. */
export function getTheme(): Theme {
  try {
    return localStorage.getItem("rmv.theme") === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem("rmv.theme", t);
  } catch {
    /* storage unavailable */
  }
}

/** Light / dark switch for the top bar. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getTheme);
  const next: Theme = theme === "light" ? "dark" : "light";
  return (
    <button
      className="theme-toggle"
      title={`Switch to ${next} theme`}
      aria-label={`Switch to ${next} theme`}
      onClick={() => {
        applyTheme(next);
        setTheme(next);
      }}
    >
      {theme === "light" ? "☾ Dark" : "☀ Light"}
    </button>
  );
}

export function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function lsSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}
