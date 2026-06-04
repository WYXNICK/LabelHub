import type {
  TemplateComponentDTO,
  TemplateConditionOperator,
  TemplateFieldValue,
  TemplateLayoutNodeDTO,
  TemplateOptionDTO,
  TemplateRequiredWhenRuleDTO,
  TemplateRuleConditionDTO,
  TemplateRuleSetDTO,
  TemplateSchemaVO,
  TemplateSubmissionValue,
} from "./types";
import { collectTemplateFieldKeys, collectableTemplateComponentTypes } from "./view";

const pathTokenPattern = /([^[.\]]+)|\[(\d+)\]/g;
const emojiPattern = /\p{Extended_Pictographic}/u;
const urlPattern = /(https?:\/\/|www\.)/i;

export interface TemplateSubmissionError {
  fieldKey: string;
  message: string;
}

export type RenderableLayoutItem =
  | {
      component: TemplateComponentDTO;
      children?: RenderableLayoutItem[];
      tabs?: Array<{ id: string; label: string; children: RenderableLayoutItem[] }>;
    }
  | { missingId: string };

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

export function getRenderableLayoutItems(schema: TemplateSchemaVO): RenderableLayoutItem[] {
  const componentsById = new Map(schema.components.map((component) => [component.id, component]));
  return buildRenderableLayoutItems(schema.layout.root, componentsById);
}

export function isTemplateComponentVisible(component: TemplateComponentDTO, value: TemplateSubmissionValue): boolean {
  const ruleSet = readRuleSet(component.visibility);
  return evaluateTemplateRuleSet(ruleSet, value, true);
}

export function isTemplateComponentRequired(component: TemplateComponentDTO, value: TemplateSubmissionValue): boolean {
  if (component.validation.required === true) {
    return true;
  }
  const requiredWhen = readRequiredWhenRule(component.validation.requiredWhen);
  return evaluateTemplateRuleSet(requiredWhen, value, false);
}

export function pruneHiddenSubmissionValue(schema: TemplateSchemaVO, value: TemplateSubmissionValue): TemplateSubmissionValue {
  const visibleFieldKeys = new Set(
    schema.components
      .filter((component) => component.fieldKey && collectableTemplateComponentTypes.has(component.type))
      .filter((component) => isTemplateComponentVisible(component, value))
      .map((component) => component.fieldKey as string),
  );
  const nextValue: TemplateSubmissionValue = {};
  for (const [fieldKey, fieldValue] of Object.entries(value)) {
    if (visibleFieldKeys.has(fieldKey)) {
      nextValue[fieldKey] = fieldValue;
    }
  }
  return nextValue;
}

export function validateTemplateSubmissionValue(
  schema: TemplateSchemaVO,
  value: TemplateSubmissionValue,
): TemplateSubmissionError[] {
  const errors: TemplateSubmissionError[] = [];
  for (const component of schema.components) {
    if (!component.fieldKey || !collectableTemplateComponentTypes.has(component.type) || !isTemplateComponentVisible(component, value)) {
      continue;
    }
    const fieldValue = value[component.fieldKey];
    const requiredWhen = readRequiredWhenRule(component.validation.requiredWhen);
    const requiredWhenActive = evaluateTemplateRuleSet(requiredWhen, value, false);
    if ((component.validation.required === true || requiredWhenActive) && isEmptyValue(fieldValue)) {
      errors.push({
        fieldKey: component.fieldKey,
        message: requiredWhenActive && requiredWhen?.message ? requiredWhen.message : `${component.label} 为必填项`,
      });
      continue;
    }
    const maxLength = typeof component.validation.maxLength === "number" ? component.validation.maxLength : null;
    if (maxLength && typeof fieldValue === "string" && fieldValue.length > maxLength) {
      errors.push({ fieldKey: component.fieldKey, message: `${component.label} 不能超过 ${maxLength} 字` });
    }
    if (typeof component.validation.pattern === "string" && typeof fieldValue === "string" && fieldValue) {
      try {
        const pattern = new RegExp(component.validation.pattern);
        if (!pattern.test(fieldValue)) {
          errors.push({
            fieldKey: component.fieldKey,
            message:
              typeof component.validation.patternMessage === "string"
                ? component.validation.patternMessage
                : `${component.label} 格式不符合要求`,
          });
        }
      } catch {
        errors.push({ fieldKey: component.fieldKey, message: `${component.label} 的正则配置无效` });
      }
    }
    for (const customRuleId of getStringArray(component.validation.customRuleIds)) {
      const message = validateCustomRule(customRuleId, fieldValue, component.label);
      if (message) {
        errors.push({ fieldKey: component.fieldKey, message });
      }
    }
  }
  return errors;
}

export function getTemplateSubmissionErrorsByField(
  schema: TemplateSchemaVO,
  value: TemplateSubmissionValue,
): Map<string, string[]> {
  const byField = new Map<string, string[]>();
  for (const error of validateTemplateSubmissionValue(schema, value)) {
    byField.set(error.fieldKey, [...(byField.get(error.fieldKey) ?? []), error.message]);
  }
  return byField;
}

export function evaluateTemplateRuleSet(
  ruleSet: TemplateRuleSetDTO | null,
  value: TemplateSubmissionValue,
  emptyFallback: boolean,
): boolean {
  const conditions = ruleSet?.conditions ?? [];
  if (conditions.length === 0) {
    return emptyFallback;
  }
  const results = conditions.map((condition) => evaluateTemplateCondition(condition, value));
  return (ruleSet?.logic ?? "ALL") === "ANY" ? results.some(Boolean) : results.every(Boolean);
}

export function evaluateTemplateCondition(
  condition: TemplateRuleConditionDTO,
  value: TemplateSubmissionValue,
): boolean {
  const currentValue = value[condition.fieldKey];
  switch (condition.operator) {
    case "EQUALS":
      return scalarEquals(currentValue, condition.value);
    case "NOT_EQUALS":
      return !scalarEquals(currentValue, condition.value);
    case "IN":
      return getStringArray(condition.value).includes(String(currentValue ?? ""));
    case "NOT_IN":
      return !getStringArray(condition.value).includes(String(currentValue ?? ""));
    case "NOT_EMPTY":
      return !isEmptyValue(currentValue);
    case "EMPTY":
      return isEmptyValue(currentValue);
    default:
      return false;
  }
}

function buildRenderableLayoutItems(
  nodes: TemplateLayoutNodeDTO[],
  byId: Map<string, TemplateComponentDTO>,
): RenderableLayoutItem[] {
  return nodes.map((node) => {
    const componentId = typeof node === "string" ? node : node.componentId;
    const component = byId.get(componentId);
    if (!component) {
      return { missingId: componentId };
    }
    if (typeof node === "string") {
      return { component };
    }
    return {
      component,
      children: node.children ? buildRenderableLayoutItems(node.children, byId) : undefined,
      tabs: node.tabs?.map((tab) => ({
        id: tab.id,
        label: tab.label,
        children: buildRenderableLayoutItems(tab.children, byId),
      })),
    };
  });
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

function readRuleSet(value: unknown): TemplateRuleSetDTO | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const logic = record.logic === "ANY" ? "ANY" : "ALL";
  const conditions = Array.isArray(record.conditions) ? record.conditions.flatMap(readCondition) : [];
  return { logic, conditions };
}

function readRequiredWhenRule(value: unknown): TemplateRequiredWhenRuleDTO | null {
  const ruleSet = readRuleSet(value);
  if (!ruleSet) {
    return null;
  }
  return {
    ...ruleSet,
    message: value && typeof value === "object" && typeof (value as Record<string, unknown>).message === "string"
      ? String((value as Record<string, unknown>).message)
      : undefined,
  };
}

function readCondition(value: unknown): TemplateRuleConditionDTO[] {
  if (!value || typeof value !== "object") {
    return [];
  }
  const record = value as Record<string, unknown>;
  if (typeof record.fieldKey !== "string" || !isConditionOperator(record.operator)) {
    return [];
  }
  return [{ fieldKey: record.fieldKey, operator: record.operator, value: record.value as TemplateRuleConditionDTO["value"] }];
}

function isConditionOperator(value: unknown): value is TemplateConditionOperator {
  return value === "EQUALS" || value === "NOT_EQUALS" || value === "IN" || value === "NOT_IN" || value === "NOT_EMPTY" || value === "EMPTY";
}

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value === "string") {
    return value.trim().length === 0;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (typeof value === "object") {
    return Object.keys(value).length === 0;
  }
  return false;
}

function scalarEquals(currentValue: unknown, expectedValue: unknown): boolean {
  if (Array.isArray(currentValue)) {
    return currentValue.map(String).includes(String(expectedValue ?? ""));
  }
  return currentValue === expectedValue || String(currentValue ?? "") === String(expectedValue ?? "");
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function validateCustomRule(ruleId: string, value: unknown, label: string): string | null {
  if (isEmptyValue(value)) {
    return null;
  }
  if (ruleId === "NO_EMOJI" && typeof value === "string" && emojiPattern.test(value)) {
    return `${label} 不能包含 Emoji`;
  }
  if (ruleId === "NO_URL" && typeof value === "string" && urlPattern.test(value)) {
    return `${label} 不能包含链接`;
  }
  if (ruleId === "TRIMMED_NON_EMPTY" && typeof value === "string" && value.trim().length === 0) {
    return `${label} 不能只包含空白字符`;
  }
  if (ruleId === "JSON_OBJECT" && (!value || typeof value !== "object" || Array.isArray(value))) {
    return `${label} 必须是 JSON Object`;
  }
  return null;
}
