import type {
  TemplateComponentDTO,
  TemplateFieldValue,
  TemplateLayoutNodeDTO,
  TemplateOptionDTO,
  TemplateSchemaVO,
  TemplateSubmissionValue,
} from "./types";
import { collectTemplateFieldKeys, collectableTemplateComponentTypes } from "./view";

const pathTokenPattern = /([^[.\]]+)|\[(\d+)\]/g;

// 只实现 ShowItem 预览所需的安全 JSONPath 子集，避免运行任意表达式。
export function readPayloadPath(payload: unknown, path: string | null | undefined): unknown {
  if (!path || path === "$") {
    return payload;
  }
  if (!path.startsWith("$.")) {
    return undefined;
  }
  const tokens = Array.from(path.slice(2).matchAll(pathTokenPattern)).map((match) => match[1] ?? match[2]);
  let current: unknown = payload;
  for (const token of tokens) {
    if (Array.isArray(current)) {
      current = current[Number(token)];
      continue;
    }
    if (current && typeof current === "object") {
      current = (current as Record<string, unknown>)[token];
      continue;
    }
    return undefined;
  }
  return current;
}

export function formatPayloadValue(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return "未提供";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

export function getTemplateOptions(component: TemplateComponentDTO): TemplateOptionDTO[] {
  const rawOptions = component.props.options;
  if (!Array.isArray(rawOptions)) {
    return [];
  }
  return rawOptions.flatMap((option): TemplateOptionDTO[] => {
    if (!option || typeof option !== "object") {
      return [];
    }
    const record = option as Record<string, unknown>;
    const label = typeof record.label === "string" ? record.label : "";
    const value = typeof record.value === "string" ? record.value : "";
    return label && value ? [{ label, value }] : [];
  });
}

export function getTemplateInitialValue(schema: TemplateSchemaVO): TemplateSubmissionValue {
  const initialValue: TemplateSubmissionValue = {};
  for (const component of schema.components) {
    if (!component.fieldKey || !collectableTemplateComponentTypes.has(component.type)) {
      continue;
    }
    if (component.type === "CHECKBOX" || component.type === "TAG_SELECT") {
      initialValue[component.fieldKey] = Array.isArray(component.props.defaultValue)
        ? component.props.defaultValue.map(String)
        : [];
      continue;
    }
    if (component.type === "FILE_UPLOAD" || component.type === "IMAGE_UPLOAD") {
      initialValue[component.fieldKey] = Array.isArray(component.props.defaultValue)
        ? component.props.defaultValue.map(String)
        : [];
      continue;
    }
    if (component.type === "JSON_EDITOR") {
      const defaultValue = component.props.defaultValue;
      initialValue[component.fieldKey] =
        defaultValue && typeof defaultValue === "object" ? (defaultValue as TemplateFieldValue) : {};
      continue;
    }
    const defaultValue = component.props.defaultValue;
    initialValue[component.fieldKey] = typeof defaultValue === "string" ? defaultValue : "";
  }
  return initialValue;
}

export function updateTemplateSubmissionValue(
  currentValue: TemplateSubmissionValue,
  component: TemplateComponentDTO,
  nextValue: TemplateFieldValue,
): TemplateSubmissionValue {
  if (!component.fieldKey) {
    return currentValue;
  }
  return { ...currentValue, [component.fieldKey]: nextValue };
}

export function summarizeRendererSchema(schema: TemplateSchemaVO): {
  componentCount: number;
  fieldKeys: string[];
} {
  return {
    componentCount: schema.components.length,
    fieldKeys: collectTemplateFieldKeys(schema),
  };
}

export function getRenderableComponents(schema: TemplateSchemaVO): Array<TemplateComponentDTO | { missingId: string }> {
  const componentsById = new Map(schema.components.map((component) => [component.id, component]));
  const componentIds = flattenLayoutNodes(schema.layout.root);
  return componentIds.map((componentId) => componentsById.get(componentId) ?? { missingId: componentId });
}

function flattenLayoutNodes(nodes: TemplateLayoutNodeDTO[]): string[] {
  const componentIds: string[] = [];
  for (const node of nodes) {
    if (typeof node === "string") {
      componentIds.push(node);
      continue;
    }
    componentIds.push(node.componentId);
    if (node.children) {
      componentIds.push(...flattenLayoutNodes(node.children));
    }
    if (node.tabs) {
      for (const tab of node.tabs) {
        componentIds.push(...flattenLayoutNodes(tab.children));
      }
    }
  }
  return componentIds;
}
