import type { WidgetDef } from "./types.ts";
import { valueWidget } from "./ValueWidget.tsx";
import { barWidget } from "./BarWidget.tsx";
import { indicatorWidget } from "./IndicatorWidget.tsx";
import { plotWidget } from "./PlotWidget.tsx";
import { messageWidget } from "./MessageWidget.tsx";
import { logWidget } from "./LogWidget.tsx";
import { publishWidget } from "./PublishWidget.tsx";
import { buttonsWidget } from "./ButtonsWidget.tsx";
import { sliderWidget } from "./SliderWidget.tsx";
import { serviceWidget } from "./ServiceWidget.tsx";
import { paramWidget } from "./ParamWidget.tsx";
import { paramsWidget } from "./ParamsWidget.tsx";
import { textWidget } from "./TextWidget.tsx";
import { dividerWidget, sectionWidget } from "./SectionWidget.tsx";
import { groupWidget } from "./GroupWidget.tsx";

/** All widget types, in palette order. Add new widgets here. */
export const WIDGETS: WidgetDef[] = [
  valueWidget,
  barWidget,
  indicatorWidget,
  plotWidget,
  messageWidget,
  logWidget,
  publishWidget,
  buttonsWidget,
  sliderWidget,
  serviceWidget,
  paramWidget,
  paramsWidget,
  groupWidget,
  sectionWidget,
  dividerWidget,
  textWidget,
];

const byType = new Map(WIDGETS.map((w) => [w.type, w]));

export function widgetDef(type: string): WidgetDef | undefined {
  return byType.get(type);
}
