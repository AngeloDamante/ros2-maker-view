import { cssColor } from "../lib/colors.ts";
import type { FieldSpec, WidgetDef, WidgetProps } from "./types.ts";

type LineStyle = "solid" | "dashed" | "dotted";

interface SectionConfig {
  title?: string;
  subtitle?: string;
  color?: string;
  line?: LineStyle | "none";
  size?: "sm" | "md" | "lg";
}

interface DividerConfig {
  orientation?: "horizontal" | "vertical";
  line?: LineStyle;
  thickness?: number | null;
  color?: string;
}

const LINE_OPTIONS = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
];

const COLOR_FIELD: FieldSpec = { key: "color", label: "Color", kind: "color", help: "Default: the border color." };

function lineColor(c: string | undefined): string {
  return c ? cssColor(c) : "var(--border)";
}

/** Title followed by a line: separates the blocks of a page. */
function SectionWidget({ config }: WidgetProps<SectionConfig>) {
  const line = config.line ?? "solid";
  return (
    <div className={`w-section size-${config.size || "md"}`}>
      <div className="section-titles">
        {config.title && (
          <span className="section-title" style={config.color ? { color: cssColor(config.color) } : undefined}>
            {config.title}
          </span>
        )}
        {config.subtitle && <span className="section-subtitle">{config.subtitle}</span>}
      </div>
      {line !== "none" && <span className="section-line" style={{ borderTopStyle: line, borderTopColor: lineColor(config.color) }} />}
    </div>
  );
}

/** Plain horizontal or vertical line. */
function DividerWidget({ config }: WidgetProps<DividerConfig>) {
  const vertical = config.orientation === "vertical";
  const t = Math.max(1, Math.min(8, Number(config.thickness) || 1));
  const style = vertical
    ? { borderLeft: `${t}px ${config.line || "solid"} ${lineColor(config.color)}` }
    : { borderTop: `${t}px ${config.line || "solid"} ${lineColor(config.color)}` };
  return (
    <div className={`w-divider ${vertical ? "vertical" : "horizontal"}`}>
      <span style={style} />
    </div>
  );
}

export const sectionWidget: WidgetDef = {
  type: "section",
  label: "Section",
  description: "Section title with a line, to separate the blocks of a page.",
  category: "Layout",
  size: { w: 24, h: 1 },
  minSize: { w: 2, h: 1 },
  compact: true,
  defaults: () => ({ title: "Section", subtitle: "", color: "", line: "solid", size: "md" }),
  fields: [
    { key: "title", label: "Title", kind: "text", help: "Variables like ${node} are allowed." },
    { key: "subtitle", label: "Subtitle", kind: "text", placeholder: "optional" },
    COLOR_FIELD,
    { key: "line", label: "Line", kind: "select", options: [...LINE_OPTIONS, { value: "none", label: "No line" }] },
    {
      key: "size",
      label: "Size",
      kind: "select",
      options: [
        { value: "sm", label: "Small" },
        { value: "md", label: "Normal" },
        { value: "lg", label: "Large" },
      ],
    },
  ],
  component: SectionWidget,
};

export const dividerWidget: WidgetDef = {
  type: "divider",
  label: "Divider",
  description: "Horizontal or vertical line (resize it to the length you need).",
  category: "Layout",
  size: { w: 24, h: 1 },
  minSize: { w: 1, h: 1 },
  compact: true,
  defaults: () => ({ orientation: "horizontal", line: "solid", thickness: 1, color: "" }),
  fields: [
    {
      key: "orientation",
      label: "Orientation",
      kind: "select",
      options: [
        { value: "horizontal", label: "Horizontal" },
        { value: "vertical", label: "Vertical" },
      ],
    },
    { key: "line", label: "Line", kind: "select", options: LINE_OPTIONS },
    { key: "thickness", label: "Thickness [px]", kind: "number", placeholder: "1" },
    COLOR_FIELD,
  ],
  component: DividerWidget,
};
