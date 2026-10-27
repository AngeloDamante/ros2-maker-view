import type { WidgetDef, WidgetProps } from "./types.ts";

interface Config {
  text?: string;
  size?: "sm" | "md" | "lg" | "xl";
  align?: "left" | "center" | "right";
  muted?: boolean;
}

/** Minimal formatting: "# " heading lines, **bold** and `code`. */
function renderInline(s: string) {
  const parts = s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") && p.length > 4 ? (
      <b key={i}>{p.slice(2, -2)}</b>
    ) : p.startsWith("`") && p.endsWith("`") && p.length > 2 ? (
      <code key={i}>{p.slice(1, -1)}</code>
    ) : (
      p
    ),
  );
}

function TextWidget({ config }: WidgetProps<Config>) {
  const lines = (config.text || "").split("\n");
  return (
    <div className={`w-text size-${config.size || "md"}${config.muted ? " muted" : ""}`} style={{ textAlign: config.align || "left" }}>
      {lines.map((l, i) =>
        l.startsWith("# ") ? (
          <h3 key={i}>{renderInline(l.slice(2))}</h3>
        ) : l.trim() === "" ? (
          <div key={i} className="gap" />
        ) : (
          <p key={i}>{renderInline(l)}</p>
        ),
      )}
    </div>
  );
}

export const textWidget: WidgetDef = {
  type: "text",
  label: "Text / heading",
  description: "Static text: titles, notes, instructions.",
  category: "Layout",
  size: { w: 6, h: 2 },
  minSize: { w: 1, h: 1 },
  defaults: () => ({ text: "# Section", size: "md", align: "left", muted: false }),
  fields: [
    { key: "text", label: "Text", kind: "textarea", help: 'Lines starting with "# " are headings; **bold** and `code` are supported.' },
    {
      key: "size",
      label: "Size",
      kind: "select",
      options: [
        { value: "sm", label: "Small" },
        { value: "md", label: "Normal" },
        { value: "lg", label: "Large" },
        { value: "xl", label: "Extra large" },
      ],
    },
    {
      key: "align",
      label: "Align",
      kind: "select",
      options: [
        { value: "left", label: "Left" },
        { value: "center", label: "Center" },
        { value: "right", label: "Right" },
      ],
    },
    { key: "muted", label: "Muted color", kind: "bool" },
  ],
  component: TextWidget,
};
