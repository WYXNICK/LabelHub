import type { TemplateComponentDTO, TemplateComponentType, TemplateOptionDTO, TemplateSchemaVO } from "./types";
import { createTemplateComponent, templateComponentTypeLabels } from "./view";

export type DesignerMaterialType =
  | "SHOW_ITEM"
  | "TEXT_INPUT"
  | "TEXTAREA"
  | "RADIO"
  | "CHECKBOX"
  | "TAG_SELECT";

export const designerMaterialTypes: DesignerMaterialType[] = [
  "SHOW_ITEM",
  "TEXT_INPUT",
  "TEXTAREA",
  "RADIO",
  "CHECKBOX",
  "TAG_SELECT",
];

export const designerMaterialDescriptions: Record<DesignerMaterialType, string> = {
  SHOW_ITEM: "展示题目原始字段，不参与提交",
  TEXT_INPUT: "短文本、标题、简单判断依据",
  TEXTAREA: "长文本理由、修订说明、开放回答",
  RADIO: "单一结论、等级、是否通过",
  CHECKBOX: "多项问题类型、命中标签",
  TAG_SELECT: "可配置标签组，多选提交",
};

const materialFieldPrefix: Record<DesignerMaterialType, string> = {
  SHOW_ITEM: "show_item",
  TEXT_INPUT: "text_input",
  TEXTAREA: "textarea",
  RADIO: "radio",
  CHECKBOX: "checkbox",
  TAG_SELECT: "tag_select",
};

const defaultOptions: TemplateOptionDTO[] = [
  { label: "通过", value: "pass" },
  { label: "需修改", value: "revise" },
];

export function createDesignerComponent(input: {
  type: DesignerMaterialType;
  id: string;
  index?: number;
}): TemplateComponentDTO {
  const index = input.index ?? 1;
  const label = templateComponentTypeLabels[input.type];
  const base = createTemplateComponent({
    id: input.id,
    type: input.type,
    label,
    fieldKey: input.type === "SHOW_ITEM" ? null : `${materialFieldPrefix[input.type]}_${index}`,
  });

  if (input.type === "SHOW_ITEM") {
    return {
      ...base,
      props: { path: "$.prompt" },
      validation: {},
    };
  }

  if (input.type === "TEXT_INPUT") {
    return {
      ...base,
      props: { placeholder: "请输入内容", defaultValue: "" },
      validation: { required: true, maxLength: 120 },
    };
  }

  if (input.type === "TEXTAREA") {
    return {
      ...base,
      props: { placeholder: "请输入详细说明", defaultValue: "" },
      validation: { required: false, maxLength: 1000 },
    };
  }

  if (input.type === "RADIO") {
    return {
      ...base,
      props: { options: defaultOptions, defaultValue: "" },
      validation: { required: true },
    };
  }

  return {
    ...base,
    props: {
      options: defaultOptions,
      defaultValue: [],
      ...(input.type === "TAG_SELECT" ? { placeholder: "请选择标签" } : {}),
    },
    validation: { required: false },
  };
}

export function createDesignerComponentId(type: DesignerMaterialType, index: number): string {
  const randomPart = Math.random().toString(36).slice(2, 7);
  return `${materialFieldPrefix[type]}_${Date.now().toString(36)}_${index}_${randomPart}`;
}

export function appendComponentToSchema(
  schema: TemplateSchemaVO,
  component: TemplateComponentDTO,
  beforeComponentId?: string | null,
): TemplateSchemaVO {
  const root = [...schema.layout.root];
  const insertIndex = beforeComponentId ? root.findIndex((node) => node === beforeComponentId) : -1;
  if (insertIndex >= 0) {
    root.splice(insertIndex, 0, component.id);
  } else {
    root.push(component.id);
  }
  return {
    ...schema,
    components: [...schema.components, component],
    layout: { ...schema.layout, root },
  };
}

export function moveComponentInSchema(
  schema: TemplateSchemaVO,
  activeComponentId: string,
  overComponentId: string,
): TemplateSchemaVO {
  if (activeComponentId === overComponentId) {
    return schema;
  }
  // 阶段 2.3/2.4 只排序 root 下的平铺物料；分组与 Tab 的嵌套布局在阶段 2.5 扩展。
  const root = schema.layout.root.filter((node): node is string => typeof node === "string");
  const fromIndex = root.indexOf(activeComponentId);
  const toIndex = root.indexOf(overComponentId);
  if (fromIndex < 0 || toIndex < 0) {
    return schema;
  }
  const nextRoot = [...root];
  const [moved] = nextRoot.splice(fromIndex, 1);
  nextRoot.splice(toIndex, 0, moved);
  return { ...schema, layout: { ...schema.layout, root: nextRoot } };
}

export function moveComponentByOffset(schema: TemplateSchemaVO, componentId: string, offset: -1 | 1): TemplateSchemaVO {
  const root = schema.layout.root.filter((node): node is string => typeof node === "string");
  const index = root.indexOf(componentId);
  const nextIndex = index + offset;
  if (index < 0 || nextIndex < 0 || nextIndex >= root.length) {
    return schema;
  }
  const nextRoot = [...root];
  const [moved] = nextRoot.splice(index, 1);
  nextRoot.splice(nextIndex, 0, moved);
  return { ...schema, layout: { ...schema.layout, root: nextRoot } };
}

export function removeComponentFromSchema(schema: TemplateSchemaVO, componentId: string): TemplateSchemaVO {
  return {
    ...schema,
    components: schema.components.filter((component) => component.id !== componentId),
    layout: {
      ...schema.layout,
      root: schema.layout.root.filter((node) => node !== componentId),
    },
  };
}

export function updateTemplateComponent(
  schema: TemplateSchemaVO,
  componentId: string,
  updater: (component: TemplateComponentDTO) => TemplateComponentDTO,
): TemplateSchemaVO {
  return {
    ...schema,
    components: schema.components.map((component) => (component.id === componentId ? updater(component) : component)),
  };
}

export function getComponentById(schema: TemplateSchemaVO, componentId: string | null): TemplateComponentDTO | null {
  if (!componentId) {
    return null;
  }
  return schema.components.find((component) => component.id === componentId) ?? null;
}

export function getOrderedDesignerComponents(schema: TemplateSchemaVO): TemplateComponentDTO[] {
  const byId = new Map(schema.components.map((component) => [component.id, component]));
  return schema.layout.root.flatMap((node) => {
    if (typeof node !== "string") {
      return [];
    }
    const component = byId.get(node);
    return component ? [component] : [];
  });
}

export function normalizeDesignerOptions(component: TemplateComponentDTO): TemplateOptionDTO[] {
  const rawOptions = component.props.options;
  if (!Array.isArray(rawOptions)) {
    return [];
  }
  return rawOptions.map((option, index) => {
    if (!option || typeof option !== "object") {
      return { label: `选项 ${index + 1}`, value: `option_${index + 1}` };
    }
    const record = option as Record<string, unknown>;
    const label = typeof record.label === "string" ? record.label : `选项 ${index + 1}`;
    const value = typeof record.value === "string" ? record.value : `option_${index + 1}`;
    return { label, value };
  });
}

export function isBasicDesignerMaterial(type: TemplateComponentType): type is DesignerMaterialType {
  return designerMaterialTypes.includes(type as DesignerMaterialType);
}
