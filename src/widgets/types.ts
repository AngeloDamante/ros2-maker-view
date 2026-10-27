import type { ComponentType } from "react";
import type { WidgetDoc } from "../types.ts";
import type { VarValues } from "../lib/vars.ts";

export type FieldKind =
  | "text"
  | "textarea"
  | "number"
  | "bool"
  | "select"
  | "color"
  | "topic"
  | "type"
  | "path"
  | "node"
  | "service"
  | "stringList"
  | "message"
  | "list";

/** Declarative description of one configuration field, rendered by ConfigForm. */
export interface FieldSpec {
  key: string;
  label: string;
  kind: FieldKind;
  help?: string;
  placeholder?: string;
  /** For "path" / "type" / "message": the sibling (or root) key holding the topic. */
  topicKey?: string;
  /** For "message": the key holding an explicit message type. */
  typeKey?: string;
  /** For "message": the key holding a service name (request template). */
  serviceKey?: string;
  /** For "path": suggest numeric fields only. */
  numeric?: boolean;
  options?: { value: string; label: string }[];
  /** For "list": fields of each item. */
  fields?: FieldSpec[];
  newItem?: () => Record<string, any>;
  itemLabel?: (item: any, index: number) => string;
  showIf?: (config: Record<string, any>) => boolean;
  /** For "stringList": conversion between the stored value and the edited lines. */
  parseLines?: (lines: string[]) => unknown;
  formatLines?: (value: any) => string[];
}

export interface WidgetProps<C = Record<string, any>> {
  /** Configuration with view variables already substituted. */
  config: C;
  widget: WidgetDoc;
  editing: boolean;
  vars: VarValues;
}

export interface WidgetDef {
  type: string;
  label: string;
  description: string;
  category: "Read" | "Write" | "Layout";
  size: { w: number; h: number };
  minSize?: { w: number; h: number };
  /**
   * Decorative widget without a title bar (sections, dividers): in edit mode the
   * whole widget is the drag handle and the actions appear on hover.
   */
  compact?: boolean;
  defaults: () => Record<string, any>;
  fields: FieldSpec[];
  component: ComponentType<WidgetProps<any>>;
}
