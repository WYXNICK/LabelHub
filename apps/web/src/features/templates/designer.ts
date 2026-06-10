import type {
  TemplateComponentDTO,
  TemplateComponentType,
  TemplateLayoutNodeDTO,
  TemplateLayoutTabDTO,
  TemplateOptionDTO,
  TemplateSchemaVO,
} from "./types";
import { createTemplateComponent } from "./view";

export type DesignerMaterialType =
  | "SHOW_ITEM"
  | "TEXT_INPUT"
  | "TEXTAREA"
  | "RADIO"
  | "CHECKBOX"
  | "TAG_SELECT"
  | "RICH_TEXT"
  | "FILE_UPLOAD"
  | "IMAGE_UPLOAD"
  | "JSON_EDITOR"
  | "LLM_ACTION"
  | "GROUP"
  | "TABS";

export interface DesignerLayoutItem {
  component: TemplateComponentDTO;
  children?: DesignerLayoutItem[];
  tabs?: Array<{ id: string; label: string; children: DesignerLayoutItem[] }>;
}

export interface DesignerLayoutTarget {
  containerId?: string;
  tabId?: string;
}

export interface DesignerMaterialGroup {
  title: string;
  description: string;
  types: DesignerMaterialType[];
}

export const designerMaterialGroups: DesignerMaterialGroup[] = [
  {
    title: "基础物料",
    description: "覆盖文本、选项和原始题目展示",
    types: ["SHOW_ITEM", "TEXT_INPUT", "TEXTAREA", "RADIO", "CHECKBOX", "TAG_SELECT"],
  },
  {
    title: "高级物料",
    description: "覆盖模型辅助、多媒体与结构化数据",
    types: ["LLM_ACTION", "RICH_TEXT", "FILE_UPLOAD", "IMAGE_UPLOAD", "JSON_EDITOR"],
  },
  {
    title: "布局物料",
    description: "组织分组、多 Tab 与进阶规则",
    types: ["GROUP", "TABS"],
  },
];

export const designerMaterialTypes: DesignerMaterialType[] = designerMaterialGroups.flatMap((group) => group.types);

export const designerMaterialDescriptions: Record<DesignerMaterialType, string> = {
  SHOW_ITEM: "展示题目原始字段，不参与提交",
  TEXT_INPUT: "短文本、标题、简单判断依据",
  TEXTAREA: "长文本理由、修订说明、开放回答",
  RADIO: "单一结论、等级、是否通过",
  CHECKBOX: "多项问题类型、命中标签",
  TAG_SELECT: "可配置标签组，多选提交",
  RICH_TEXT: "长文本带格式，适合说明与修订稿",
  FILE_UPLOAD: "附件证据、表格或文档留存",
  IMAGE_UPLOAD: "图片证据、截图和多图材料",
  JSON_EDITOR: "结构化对象或数组字段",
  LLM_ACTION: "题目级 AI 辅助，可作为参考或预填",
  GROUP: "把相关字段组织为一个逻辑区块",
  TABS: "将复杂模板拆成多个可切换页面",
};

// label 是标注员可见文案，默认用中文业务语义；fieldKey 仍保持稳定机器字段。
const defaultComponentLabels: Record<DesignerMaterialType, string> = {
  SHOW_ITEM: "题目原文",
  TEXT_INPUT: "单行输入",
  TEXTAREA: "回答内容",
  RADIO: "质量判断",
  CHECKBOX: "问题类型",
  TAG_SELECT: "标签选择",
  RICH_TEXT: "富文本说明",
  FILE_UPLOAD: "文件附件",
  IMAGE_UPLOAD: "图片附件",
  JSON_EDITOR: "结构化数据",
  LLM_ACTION: "AI 辅助动作",
  GROUP: "分组容器",
  TABS: "多 Tab 布局",
};

const materialFieldPrefix: Record<DesignerMaterialType, string> = {
  SHOW_ITEM: "show_item",
  TEXT_INPUT: "text_input",
  TEXTAREA: "textarea",
  RADIO: "radio",
  CHECKBOX: "checkbox",
  TAG_SELECT: "tag_select",
  RICH_TEXT: "rich_text",
  FILE_UPLOAD: "file_upload",
  IMAGE_UPLOAD: "image_upload",
  JSON_EDITOR: "json_editor",
  LLM_ACTION: "llm_action",
  GROUP: "group",
  TABS: "tabs",
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
  const label = defaultComponentLabels[input.type];
  const isNonCollectable = input.type === "SHOW_ITEM" || input.type === "LLM_ACTION" || input.type === "GROUP" || input.type === "TABS";
  const base = createTemplateComponent({
    id: input.id,
    type: input.type,
    label,
    fieldKey: isNonCollectable ? null : `${materialFieldPrefix[input.type]}_${index}`,
  });

  if (input.type === "SHOW_ITEM") {
    return { ...base, props: { path: "$.prompt" }, validation: {} };
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

  if (input.type === "RICH_TEXT") {
    return {
      ...base,
      props: { placeholder: "请输入富文本内容", defaultValue: "", toolbarPreset: "basic" },
      validation: { required: false, maxLength: 5000 },
    };
  }

  if (input.type === "FILE_UPLOAD") {
    return {
      ...base,
      props: { accept: [".pdf", ".docx", ".xlsx", ".json", ".txt", ".md"], maxFiles: 3, maxSizeMb: 20, defaultValue: [] },
      validation: { required: false },
    };
  }

  if (input.type === "IMAGE_UPLOAD") {
    return {
      ...base,
      props: { accept: ["image/png", "image/jpeg", "image/webp"], maxFiles: 6, maxSizeMb: 10, defaultValue: [] },
      validation: { required: false },
    };
  }

  if (input.type === "JSON_EDITOR") {
    return {
      ...base,
      props: { placeholder: '{\n  "key": "value"\n}', defaultValue: {} },
      validation: { required: false },
    };
  }

  if (input.type === "LLM_ACTION") {
    return {
      ...base,
      props: {
        actionLabel: "生成参考建议",
        promptTemplate: "请结合题目原始数据和已填写字段，生成可供标注员参考的建议。",
        inputItemPaths: [],
        inputFieldKeys: [],
        outputFieldKey: "",
        helperText: "模型输出仅作参考，标注员确认后再提交。",
      },
      validation: {},
    };
  }

  if (input.type === "GROUP") {
    return {
      ...base,
      props: { description: "用于组织相关字段", collapsible: false },
      validation: {},
    };
  }

  if (input.type === "TABS") {
    return {
      ...base,
      props: { defaultTabId: "basic" },
      validation: {},
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
  target?: DesignerLayoutTarget | null,
): TemplateSchemaVO {
  const layoutNode = createLayoutNodeForComponent(component);
  const root = target?.containerId
    ? insertLayoutNodeIntoContainer(schema.layout.root, layoutNode, target)
    : insertLayoutNodeBefore(schema.layout.root, layoutNode, beforeComponentId);
  return {
    ...schema,
    components: [...schema.components, component],
    layout: { ...schema.layout, root },
  };
}

export function createLayoutNodeForComponent(component: TemplateComponentDTO): TemplateLayoutNodeDTO {
  if (component.type === "GROUP") {
    return { componentId: component.id, children: [] };
  }
  if (component.type === "TABS") {
    return {
      componentId: component.id,
      tabs: [
        { id: "basic", label: "基础信息", children: [] },
        { id: "extra", label: "补充信息", children: [] },
      ],
    };
  }
  return component.id;
}

export function moveComponentInSchema(
  schema: TemplateSchemaVO,
  activeComponentId: string,
  overComponentId?: string | null,
  target?: DesignerLayoutTarget | null,
): TemplateSchemaVO {
  if (!overComponentId && !target?.containerId) {
    return schema;
  }

  if (overComponentId && activeComponentId === overComponentId) {
    return schema;
  }

  if (target?.containerId) {
    return {
      ...schema,
      layout: { ...schema.layout, root: moveLayoutNodeIntoContainer(schema.layout.root, activeComponentId, target) },
    };
  }

  return {
    ...schema,
    layout: { ...schema.layout, root: moveLayoutNodeBefore(schema.layout.root, activeComponentId, overComponentId) },
  };
}

export function moveComponentByOffset(schema: TemplateSchemaVO, componentId: string, offset: -1 | 1): TemplateSchemaVO {
  return {
    ...schema,
    layout: { ...schema.layout, root: moveLayoutNodeByOffset(schema.layout.root, componentId, offset) },
  };
}

export function removeComponentFromSchema(schema: TemplateSchemaVO, componentId: string): TemplateSchemaVO {
  const removal = removeLayoutNode(schema.layout.root, componentId);
  return {
    ...schema,
    components: schema.components.filter((component) => !removal.removedIds.has(component.id)),
    layout: { ...schema.layout, root: removal.nodes },
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
  return flattenDesignerLayoutItems(getDesignerLayoutItems(schema));
}

export function getDesignerLayoutItems(schema: TemplateSchemaVO): DesignerLayoutItem[] {
  const byId = new Map(schema.components.map((component) => [component.id, component]));
  return buildDesignerLayoutItems(schema.layout.root, byId);
}

export function getLayoutTabs(schema: TemplateSchemaVO, componentId: string): TemplateLayoutTabDTO[] {
  const node = findContainerNode(schema.layout.root, componentId);
  return node?.tabs ?? [];
}

export function updateLayoutTabs(
  schema: TemplateSchemaVO,
  componentId: string,
  updater: (tabs: TemplateLayoutTabDTO[]) => TemplateLayoutTabDTO[],
): TemplateSchemaVO {
  return {
    ...schema,
    layout: {
      ...schema.layout,
      root: mapLayoutNodes(schema.layout.root, (node) =>
        typeof node !== "string" && node.componentId === componentId ? { ...node, tabs: updater(node.tabs ?? []) } : node,
      ),
    },
  };
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

function insertLayoutNodeBefore(
  nodes: TemplateLayoutNodeDTO[],
  layoutNode: TemplateLayoutNodeDTO,
  beforeComponentId?: string | null,
): TemplateLayoutNodeDTO[] {
  const nextNodes = [...nodes];
  const insertIndex = beforeComponentId ? nextNodes.findIndex((node) => getLayoutNodeComponentId(node) === beforeComponentId) : -1;
  if (insertIndex >= 0) {
    nextNodes.splice(insertIndex, 0, layoutNode);
  } else {
    nextNodes.push(layoutNode);
  }
  return nextNodes;
}

function insertLayoutNodeIntoContainer(
  nodes: TemplateLayoutNodeDTO[],
  layoutNode: TemplateLayoutNodeDTO,
  target: DesignerLayoutTarget,
): TemplateLayoutNodeDTO[] {
  return nodes.map((node) => {
    if (typeof node === "string") {
      return node;
    }
    if (node.componentId === target.containerId) {
      if (target.tabId && node.tabs) {
        return {
          ...node,
          tabs: node.tabs.map((tab) => (tab.id === target.tabId ? { ...tab, children: [...tab.children, layoutNode] } : tab)),
        };
      }
      return { ...node, children: [...(node.children ?? []), layoutNode] };
    }
    return {
      ...node,
      children: node.children ? insertLayoutNodeIntoContainer(node.children, layoutNode, target) : node.children,
      tabs: node.tabs?.map((tab) => ({ ...tab, children: insertLayoutNodeIntoContainer(tab.children, layoutNode, target) })),
    };
  });
}

function moveLayoutNodeBefore(
  nodes: TemplateLayoutNodeDTO[],
  activeComponentId: string,
  overComponentId?: string | null,
): TemplateLayoutNodeDTO[] {
  if (!overComponentId || activeComponentId === overComponentId) {
    return nodes;
  }

  const activeIndex = nodes.findIndex((node) => getLayoutNodeComponentId(node) === activeComponentId);
  const overIndex = nodes.findIndex((node) => getLayoutNodeComponentId(node) === overComponentId);
  if (activeIndex >= 0 && overIndex >= 0) {
    const nextNodes = [...nodes];
    const [moved] = nextNodes.splice(activeIndex, 1);
    nextNodes.splice(activeIndex < overIndex ? overIndex - 1 : overIndex, 0, moved);
    return nextNodes;
  }

  const extracted = extractLayoutNode(nodes, activeComponentId);
  if (extracted.node && !layoutNodeContainsComponent(extracted.node, overComponentId)) {
    const inserted = insertLayoutNodeBeforeDeep(extracted.nodes, extracted.node, overComponentId);
    if (inserted.inserted) {
      return inserted.nodes;
    }
  }

  return nodes.map((node) => mapNestedLayoutNode(node, (children) => moveLayoutNodeBefore(children, activeComponentId, overComponentId)));
}

function moveLayoutNodeIntoContainer(
  nodes: TemplateLayoutNodeDTO[],
  activeComponentId: string,
  target: DesignerLayoutTarget,
): TemplateLayoutNodeDTO[] {
  if (!target.containerId || activeComponentId === target.containerId) {
    return nodes;
  }

  const extracted = extractLayoutNode(nodes, activeComponentId);
  if (!extracted.node || layoutNodeContainsComponent(extracted.node, target.containerId)) {
    return nodes;
  }

  return insertLayoutNodeIntoContainer(extracted.nodes, extracted.node, target);
}

function extractLayoutNode(
  nodes: TemplateLayoutNodeDTO[],
  componentId: string,
): { nodes: TemplateLayoutNodeDTO[]; node: TemplateLayoutNodeDTO | null } {
  let found: TemplateLayoutNodeDTO | null = null;
  const nextNodes: TemplateLayoutNodeDTO[] = [];

  for (const node of nodes) {
    if (getLayoutNodeComponentId(node) === componentId) {
      found = node;
      continue;
    }
    if (typeof node === "string") {
      nextNodes.push(node);
      continue;
    }

    const childResult = extractLayoutNode(node.children ?? [], componentId);
    const nextTabs = node.tabs?.map((tab) => {
      const tabResult = found ? { nodes: tab.children, node: null } : extractLayoutNode(tab.children, componentId);
      if (tabResult.node) {
        found = tabResult.node;
      }
      return { ...tab, children: tabResult.nodes };
    });
    if (childResult.node && !found) {
      found = childResult.node;
    }
    nextNodes.push({ ...node, children: node.children ? childResult.nodes : node.children, tabs: nextTabs });
  }

  return { nodes: nextNodes, node: found };
}

function insertLayoutNodeBeforeDeep(
  nodes: TemplateLayoutNodeDTO[],
  layoutNode: TemplateLayoutNodeDTO,
  beforeComponentId: string,
): { nodes: TemplateLayoutNodeDTO[]; inserted: boolean } {
  const directIndex = nodes.findIndex((node) => getLayoutNodeComponentId(node) === beforeComponentId);
  if (directIndex >= 0) {
    const nextNodes = [...nodes];
    nextNodes.splice(directIndex, 0, layoutNode);
    return { nodes: nextNodes, inserted: true };
  }

  let inserted = false;
  const nextNodes = nodes.map((node) => {
    if (typeof node === "string" || inserted) {
      return node;
    }
    const childResult = insertLayoutNodeBeforeDeep(node.children ?? [], layoutNode, beforeComponentId);
    if (childResult.inserted) {
      inserted = true;
      return { ...node, children: node.children ? childResult.nodes : node.children };
    }
    const nextTabs = node.tabs?.map((tab) => {
      if (inserted) {
        return tab;
      }
      const tabResult = insertLayoutNodeBeforeDeep(tab.children, layoutNode, beforeComponentId);
      if (tabResult.inserted) {
        inserted = true;
        return { ...tab, children: tabResult.nodes };
      }
      return tab;
    });
    return { ...node, tabs: nextTabs };
  });

  return { nodes: nextNodes, inserted };
}

function moveLayoutNodeByOffset(
  nodes: TemplateLayoutNodeDTO[],
  componentId: string,
  offset: -1 | 1,
): TemplateLayoutNodeDTO[] {
  const index = nodes.findIndex((node) => getLayoutNodeComponentId(node) === componentId);
  const nextIndex = index + offset;
  if (index < 0 || nextIndex < 0 || nextIndex >= nodes.length) {
    return nodes.map((node) => mapNestedLayoutNode(node, (children) => moveLayoutNodeByOffset(children, componentId, offset)));
  }
  const nextNodes = [...nodes];
  const [moved] = nextNodes.splice(index, 1);
  nextNodes.splice(nextIndex, 0, moved);
  return nextNodes;
}

function removeLayoutNode(
  nodes: TemplateLayoutNodeDTO[],
  componentId: string,
): { nodes: TemplateLayoutNodeDTO[]; removedIds: Set<string> } {
  const removedIds = new Set<string>();
  const nextNodes: TemplateLayoutNodeDTO[] = [];

  for (const node of nodes) {
    if (getLayoutNodeComponentId(node) === componentId) {
      collectLayoutNodeComponentIds(node).forEach((id) => removedIds.add(id));
      continue;
    }
    if (typeof node === "string") {
      nextNodes.push(node);
      continue;
    }
    const childrenRemoval = removeLayoutNode(node.children ?? [], componentId);
    childrenRemoval.removedIds.forEach((id) => removedIds.add(id));
    const nextTabs = node.tabs?.map((tab) => {
      const tabRemoval = removeLayoutNode(tab.children, componentId);
      tabRemoval.removedIds.forEach((id) => removedIds.add(id));
      return { ...tab, children: tabRemoval.nodes };
    });
    nextNodes.push({ ...node, children: node.children ? childrenRemoval.nodes : node.children, tabs: nextTabs });
  }
  return { nodes: nextNodes, removedIds };
}

function buildDesignerLayoutItems(
  nodes: TemplateLayoutNodeDTO[],
  byId: Map<string, TemplateComponentDTO>,
): DesignerLayoutItem[] {
  return nodes.flatMap((node): DesignerLayoutItem[] => {
    const component = byId.get(getLayoutNodeComponentId(node));
    if (!component) {
      return [];
    }
    if (typeof node === "string") {
      return [{ component }];
    }
    return [
      {
        component,
        children: node.children ? buildDesignerLayoutItems(node.children, byId) : undefined,
        tabs: node.tabs?.map((tab) => ({
          id: tab.id,
          label: tab.label,
          children: buildDesignerLayoutItems(tab.children, byId),
        })),
      },
    ];
  });
}

function flattenDesignerLayoutItems(items: DesignerLayoutItem[]): TemplateComponentDTO[] {
  return items.flatMap((item) => [
    item.component,
    ...(item.children ? flattenDesignerLayoutItems(item.children) : []),
    ...(item.tabs ? item.tabs.flatMap((tab) => flattenDesignerLayoutItems(tab.children)) : []),
  ]);
}

function getLayoutNodeComponentId(node: TemplateLayoutNodeDTO): string {
  return typeof node === "string" ? node : node.componentId;
}

function layoutNodeContainsComponent(node: TemplateLayoutNodeDTO, componentId: string): boolean {
  return collectLayoutNodeComponentIds(node).includes(componentId);
}

function mapNestedLayoutNode(
  node: TemplateLayoutNodeDTO,
  updater: (children: TemplateLayoutNodeDTO[]) => TemplateLayoutNodeDTO[],
): TemplateLayoutNodeDTO {
  if (typeof node === "string") {
    return node;
  }
  return {
    ...node,
    children: node.children ? updater(node.children) : node.children,
    tabs: node.tabs?.map((tab) => ({ ...tab, children: updater(tab.children) })),
  };
}

function mapLayoutNodes(
  nodes: TemplateLayoutNodeDTO[],
  updater: (node: TemplateLayoutNodeDTO) => TemplateLayoutNodeDTO,
): TemplateLayoutNodeDTO[] {
  return nodes.map((node) => {
    const updated = updater(node);
    if (typeof updated === "string") {
      return updated;
    }
    return {
      ...updated,
      children: updated.children ? mapLayoutNodes(updated.children, updater) : updated.children,
      tabs: updated.tabs?.map((tab) => ({ ...tab, children: mapLayoutNodes(tab.children, updater) })),
    };
  });
}

function findContainerNode(nodes: TemplateLayoutNodeDTO[], componentId: string): Exclude<TemplateLayoutNodeDTO, string> | null {
  for (const node of nodes) {
    if (typeof node === "string") {
      continue;
    }
    if (node.componentId === componentId) {
      return node;
    }
    const childMatch = findContainerNode(node.children ?? [], componentId);
    if (childMatch) {
      return childMatch;
    }
    for (const tab of node.tabs ?? []) {
      const tabMatch = findContainerNode(tab.children, componentId);
      if (tabMatch) {
        return tabMatch;
      }
    }
  }
  return null;
}

function collectLayoutNodeComponentIds(node: TemplateLayoutNodeDTO): string[] {
  if (typeof node === "string") {
    return [node];
  }
  return [
    node.componentId,
    ...(node.children ?? []).flatMap(collectLayoutNodeComponentIds),
    ...(node.tabs ?? []).flatMap((tab) => tab.children.flatMap(collectLayoutNodeComponentIds)),
  ];
}
