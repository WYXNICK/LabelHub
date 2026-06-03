import {
  AlignLeftOutlined,
  AppstoreAddOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  EyeOutlined,
  FontSizeOutlined,
  HolderOutlined,
  PlusOutlined,
  TagsOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { useState } from "react";

import type { TemplateComponentDTO, TemplateOptionDTO, TemplateSchemaValidationVO, TemplateSchemaVO } from "./types";
import {
  appendComponentToSchema,
  createDesignerComponent,
  createDesignerComponentId,
  designerMaterialDescriptions,
  designerMaterialTypes,
  getComponentById,
  getOrderedDesignerComponents,
  isBasicDesignerMaterial,
  moveComponentByOffset,
  moveComponentInSchema,
  normalizeDesignerOptions,
  removeComponentFromSchema,
  updateTemplateComponent,
} from "./designer";
import { templateComponentTypeLabels } from "./view";

interface TemplateDesignerProps {
  schema: TemplateSchemaVO;
  selectedComponentId: string | null;
  validation: TemplateSchemaValidationVO | null;
  readOnly?: boolean;
  onSchemaChange: (schema: TemplateSchemaVO) => void;
  onSelectedComponentChange: (componentId: string | null) => void;
}

const optionMaterialTypes = new Set(["RADIO", "CHECKBOX", "TAG_SELECT"]);

const materialIcons = {
  SHOW_ITEM: <EyeOutlined />,
  TEXT_INPUT: <FontSizeOutlined />,
  TEXTAREA: <AlignLeftOutlined />,
  RADIO: <CheckCircleOutlined />,
  CHECKBOX: <AppstoreAddOutlined />,
  TAG_SELECT: <TagsOutlined />,
};

export function TemplateDesigner({
  schema,
  selectedComponentId,
  validation,
  readOnly = false,
  onSchemaChange,
  onSelectedComponentChange,
}: TemplateDesignerProps) {
  const [activeDragLabel, setActiveDragLabel] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const orderedComponents = getOrderedDesignerComponents(schema);
  const selectedComponent = getComponentById(schema, selectedComponentId);

  function addMaterial(type: (typeof designerMaterialTypes)[number], beforeComponentId?: string | null) {
    if (readOnly) {
      return;
    }
    const component = createDesignerComponent({
      type,
      id: createDesignerComponentId(type, schema.components.length + 1),
      index: schema.components.length + 1,
    });
    onSchemaChange(appendComponentToSchema(schema, component, beforeComponentId));
    onSelectedComponentChange(component.id);
  }

  function handleDragStart(event: DragStartEvent) {
    const activeId = String(event.active.id);
    if (activeId.startsWith("palette:")) {
      const type = activeId.replace("palette:", "") as (typeof designerMaterialTypes)[number];
      setActiveDragLabel(templateComponentTypeLabels[type]);
      return;
    }
    if (activeId.startsWith("canvas:")) {
      const componentId = activeId.replace("canvas:", "");
      const component = getComponentById(schema, componentId);
      setActiveDragLabel(component?.label ?? null);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : "";
    setActiveDragLabel(null);
    if (!overId || readOnly) {
      return;
    }

    const beforeComponentId = overId.startsWith("canvas-item:") ? overId.replace("canvas-item:", "") : null;
    if (activeId.startsWith("palette:")) {
      const type = activeId.replace("palette:", "") as (typeof designerMaterialTypes)[number];
      if (designerMaterialTypes.includes(type)) {
        addMaterial(type, beforeComponentId);
      }
      return;
    }

    if (activeId.startsWith("canvas:") && beforeComponentId) {
      onSchemaChange(moveComponentInSchema(schema, activeId.replace("canvas:", ""), beforeComponentId));
    }
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="labelhub-designer-grid">
        <DesignerPalette readOnly={readOnly} onAddMaterial={addMaterial} />
        <DesignerCanvas
          components={orderedComponents}
          selectedComponentId={selectedComponentId}
          readOnly={readOnly}
          onSelect={onSelectedComponentChange}
          onMove={(componentId, offset) => onSchemaChange(moveComponentByOffset(schema, componentId, offset))}
          onRemove={(componentId) => {
            onSchemaChange(removeComponentFromSchema(schema, componentId));
            if (selectedComponentId === componentId) {
              onSelectedComponentChange(null);
            }
          }}
        />
        <PropertyPanel
          component={selectedComponent}
          schema={schema}
          validation={validation}
          readOnly={readOnly}
          onSchemaChange={onSchemaChange}
        />
      </div>
      <DragOverlay>
        {activeDragLabel ? <div className="labelhub-drag-overlay">{activeDragLabel}</div> : null}
      </DragOverlay>
    </DndContext>
  );
}

function DesignerPalette({
  readOnly,
  onAddMaterial,
}: {
  readOnly: boolean;
  onAddMaterial: (type: (typeof designerMaterialTypes)[number]) => void;
}) {
  return (
    <aside className="labelhub-designer-panel labelhub-designer-palette">
      <div className="labelhub-panel-heading">
        <Typography.Text strong>物料</Typography.Text>
        <Typography.Text type="secondary">基础搭建</Typography.Text>
      </div>
      <Space direction="vertical" size={8} style={{ width: "100%" }}>
        {designerMaterialTypes.map((type) => (
          <PaletteItem key={type} type={type} readOnly={readOnly} onAdd={() => onAddMaterial(type)} />
        ))}
      </Space>
    </aside>
  );
}

function PaletteItem({
  type,
  readOnly,
  onAdd,
}: {
  type: (typeof designerMaterialTypes)[number];
  readOnly: boolean;
  onAdd: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `palette:${type}`,
    disabled: readOnly,
  });
  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <button
      ref={setNodeRef}
      type="button"
      className="labelhub-palette-item"
      style={style}
      disabled={readOnly}
      aria-label={`添加${templateComponentTypeLabels[type]}`}
      onClick={onAdd}
      {...listeners}
      {...attributes}
      data-dragging={isDragging ? "true" : undefined}
    >
      <span className="labelhub-palette-icon">{materialIcons[type]}</span>
      <span className="labelhub-palette-copy">
        <span>{templateComponentTypeLabels[type]}</span>
        <small>{designerMaterialDescriptions[type]}</small>
      </span>
    </button>
  );
}

function DesignerCanvas({
  components,
  selectedComponentId,
  readOnly,
  onSelect,
  onMove,
  onRemove,
}: {
  components: TemplateComponentDTO[];
  selectedComponentId: string | null;
  readOnly: boolean;
  onSelect: (componentId: string) => void;
  onMove: (componentId: string, offset: -1 | 1) => void;
  onRemove: (componentId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "canvas-end", disabled: readOnly });

  return (
    <main className="labelhub-designer-panel labelhub-designer-canvas">
      <div className="labelhub-canvas-head">
        <div>
          <Typography.Text strong>画布</Typography.Text>
          <Typography.Text type="secondary">按顺序生成可序列化 JSON Schema</Typography.Text>
        </div>
        <Tag color="blue">{components.length} 个物料</Tag>
      </div>
      <div ref={setNodeRef} className="labelhub-canvas-dropzone" data-over={isOver ? "true" : undefined}>
        {components.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="从左侧添加物料，或拖拽到这里开始搭建模板"
          />
        ) : (
          components.map((component, index) => (
            <CanvasItem
              key={component.id}
              component={component}
              index={index}
              total={components.length}
              selected={selectedComponentId === component.id}
              readOnly={readOnly}
              onSelect={() => onSelect(component.id)}
              onMove={onMove}
              onRemove={onRemove}
            />
          ))
        )}
      </div>
    </main>
  );
}

function CanvasItem({
  component,
  index,
  total,
  selected,
  readOnly,
  onSelect,
  onMove,
  onRemove,
}: {
  component: TemplateComponentDTO;
  index: number;
  total: number;
  selected: boolean;
  readOnly: boolean;
  onSelect: () => void;
  onMove: (componentId: string, offset: -1 | 1) => void;
  onRemove: (componentId: string) => void;
}) {
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: `canvas:${component.id}`,
    disabled: readOnly,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `canvas-item:${component.id}`,
    disabled: readOnly,
  });
  const setNodeRef = (node: HTMLDivElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };
  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <section
      ref={setNodeRef}
      className="labelhub-canvas-item"
      data-selected={selected ? "true" : undefined}
      data-over={isOver ? "true" : undefined}
      data-dragging={isDragging ? "true" : undefined}
      style={style}
      onClick={onSelect}
      aria-label={`${component.label} 属性`}
    >
      <div className="labelhub-canvas-item-head">
        <Space size={8}>
          <button
            type="button"
            className="labelhub-drag-handle"
            aria-label={`拖拽调整 ${component.label}`}
            {...listeners}
            {...attributes}
            disabled={readOnly}
          >
            <HolderOutlined />
          </button>
          <span className="labelhub-canvas-icon">
            {isBasicDesignerMaterial(component.type) ? materialIcons[component.type] : <AppstoreAddOutlined />}
          </span>
          <div>
            <Typography.Text strong>{component.label}</Typography.Text>
            <div className="labelhub-canvas-meta">
              {templateComponentTypeLabels[component.type]} {component.fieldKey ? `· ${component.fieldKey}` : ""}
            </div>
          </div>
        </Space>
        <Space size={4}>
          <Tooltip title="上移">
            <Button
              size="small"
              aria-label={`上移 ${component.label}`}
              icon={<ArrowUpOutlined />}
              disabled={readOnly || index === 0}
              onClick={(event) => {
                event.stopPropagation();
                onMove(component.id, -1);
              }}
            />
          </Tooltip>
          <Tooltip title="下移">
            <Button
              size="small"
              aria-label={`下移 ${component.label}`}
              icon={<ArrowDownOutlined />}
              disabled={readOnly || index === total - 1}
              onClick={(event) => {
                event.stopPropagation();
                onMove(component.id, 1);
              }}
            />
          </Tooltip>
          <Tooltip title="删除">
            <Button
              size="small"
              danger
              aria-label={`删除 ${component.label}`}
              icon={<DeleteOutlined />}
              disabled={readOnly}
              onClick={(event) => {
                event.stopPropagation();
                onRemove(component.id);
              }}
            />
          </Tooltip>
        </Space>
      </div>
      <CanvasItemPreview component={component} />
    </section>
  );
}

function CanvasItemPreview({ component }: { component: TemplateComponentDTO }) {
  const options = normalizeDesignerOptions(component);
  if (component.type === "SHOW_ITEM") {
    return (
      <div className="labelhub-canvas-preview labelhub-canvas-show-preview">
        <Typography.Text type="secondary">{String(component.props.path ?? "$.prompt")}</Typography.Text>
        <Typography.Text>题目原始数据将在这里展示</Typography.Text>
      </div>
    );
  }
  if (component.type === "TEXTAREA") {
    return <div className="labelhub-canvas-preview labelhub-canvas-textarea-preview">多行文本输入区域</div>;
  }
  if (component.type === "TEXT_INPUT") {
    return <div className="labelhub-canvas-preview">单行输入：{String(component.props.placeholder ?? "请输入")}</div>;
  }
  return (
    <div className="labelhub-canvas-preview labelhub-option-preview">
      {options.map((option) => (
        <Tag key={option.value}>{option.label}</Tag>
      ))}
      {options.length === 0 && <Typography.Text type="secondary">暂无选项</Typography.Text>}
    </div>
  );
}

function PropertyPanel({
  component,
  schema,
  validation,
  readOnly,
  onSchemaChange,
}: {
  component: TemplateComponentDTO | null;
  schema: TemplateSchemaVO;
  validation: TemplateSchemaValidationVO | null;
  readOnly: boolean;
  onSchemaChange: (schema: TemplateSchemaVO) => void;
}) {
  if (!component) {
    return (
      <aside className="labelhub-designer-panel labelhub-property-panel">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="选择画布中的物料后配置属性" />
      </aside>
    );
  }

  const errors = validation?.errors.filter((error) => error.field.includes(component.id) || error.field.startsWith("components")) ?? [];
  const controlId = (name: string) => `template-designer-${component.id}-${name}`;
  const patchComponent = (updater: (component: TemplateComponentDTO) => TemplateComponentDTO) =>
    onSchemaChange(updateTemplateComponent(schema, component.id, updater));
  const patchProps = (nextProps: Record<string, unknown>) =>
    patchComponent((current) => ({ ...current, props: { ...current.props, ...nextProps } }));
  const patchValidation = (nextValidation: Record<string, unknown>) =>
    patchComponent((current) => ({ ...current, validation: { ...current.validation, ...nextValidation } }));

  return (
    <aside className="labelhub-designer-panel labelhub-property-panel">
      <div className="labelhub-panel-heading">
        <Typography.Text strong>属性配置</Typography.Text>
        <Typography.Text type="secondary">{component.id}</Typography.Text>
      </div>
      {errors.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message="当前物料存在校验问题"
          description={errors.map((error) => `${error.field}: ${error.message}`).join("\n")}
        />
      )}
      <Form layout="vertical" disabled={readOnly}>
        <div className="labelhub-property-static-row">
          <Typography.Text type="secondary">物料类型</Typography.Text>
          <Tag>{templateComponentTypeLabels[component.type]}</Tag>
        </div>
        <Form.Item label="标签" htmlFor={controlId("label")}>
          <Input
            id={controlId("label")}
            name={controlId("label")}
            value={component.label}
            maxLength={120}
            onChange={(event) => patchComponent((current) => ({ ...current, label: event.target.value }))}
          />
        </Form.Item>
        {component.type !== "SHOW_ITEM" && (
          <Form.Item label="字段名 fieldKey" htmlFor={controlId("field-key")}>
            <Input
              id={controlId("field-key")}
              name={controlId("field-key")}
              value={component.fieldKey ?? ""}
              placeholder="例如 quality"
              onChange={(event) => patchComponent((current) => ({ ...current, fieldKey: event.target.value }))}
            />
          </Form.Item>
        )}
        {component.type === "SHOW_ITEM" ? (
          <Form.Item label="展示路径" htmlFor={controlId("path")}>
            <Input
              id={controlId("path")}
              name={controlId("path")}
              value={String(component.props.path ?? "")}
              placeholder="$.prompt"
              onChange={(event) => patchProps({ path: event.target.value })}
            />
          </Form.Item>
        ) : (
          <>
            <Form.Item label="占位符" htmlFor={controlId("placeholder")}>
              <Input
                id={controlId("placeholder")}
                name={controlId("placeholder")}
                value={typeof component.props.placeholder === "string" ? component.props.placeholder : ""}
                onChange={(event) => patchProps({ placeholder: event.target.value })}
              />
            </Form.Item>
            <Form.Item label="必填" htmlFor={controlId("required")}>
              <Switch
                id={controlId("required")}
                checked={component.validation.required === true}
                onChange={(checked) => patchValidation({ required: checked })}
              />
            </Form.Item>
          </>
        )}
        {(component.type === "TEXT_INPUT" || component.type === "TEXTAREA") && (
          <>
            <Form.Item label="默认值" htmlFor={controlId("default-value")}>
              <Input.TextArea
                id={controlId("default-value")}
                name={controlId("default-value")}
                rows={component.type === "TEXTAREA" ? 3 : 1}
                value={typeof component.props.defaultValue === "string" ? component.props.defaultValue : ""}
                onChange={(event) => patchProps({ defaultValue: event.target.value })}
              />
            </Form.Item>
            <Form.Item label="最大长度" htmlFor={controlId("max-length")}>
              <InputNumber
                id={controlId("max-length")}
                name={controlId("max-length")}
                min={1}
                max={component.type === "TEXTAREA" ? 5000 : 500}
                value={typeof component.validation.maxLength === "number" ? component.validation.maxLength : undefined}
                style={{ width: "100%" }}
                onChange={(value) => patchValidation({ maxLength: value ?? undefined })}
              />
            </Form.Item>
          </>
        )}
        {optionMaterialTypes.has(component.type) && (
          <OptionPropertyEditor component={component} patchProps={patchProps} />
        )}
      </Form>
    </aside>
  );
}

function OptionPropertyEditor({
  component,
  patchProps,
}: {
  component: TemplateComponentDTO;
  patchProps: (nextProps: Record<string, unknown>) => void;
}) {
  const options = normalizeDesignerOptions(component);
  const optionValues = options.map((option) => ({ label: option.label, value: option.value }));
  const isMultiple = component.type === "CHECKBOX" || component.type === "TAG_SELECT";

  function updateOptions(nextOptions: TemplateOptionDTO[]) {
    const availableValues = new Set(nextOptions.map((option) => option.value));
    const currentDefault = component.props.defaultValue;
    const defaultValue = isMultiple
      ? Array.isArray(currentDefault)
        ? currentDefault.filter((value) => typeof value === "string" && availableValues.has(value))
        : []
      : typeof currentDefault === "string" && availableValues.has(currentDefault)
        ? currentDefault
        : "";
    patchProps({ options: nextOptions, defaultValue });
  }

  return (
    <>
      <div className="labelhub-option-editor-head">
        <Typography.Text strong>选项</Typography.Text>
        <Button
          size="small"
          icon={<PlusOutlined />}
          onClick={() =>
            updateOptions([
              ...options,
              { label: `选项 ${options.length + 1}`, value: `option_${options.length + 1}` },
            ])
          }
        >
          新增
        </Button>
      </div>
      <Space direction="vertical" size={8} style={{ width: "100%" }}>
        {options.map((option, index) => (
          <div className="labelhub-option-row" key={`${option.value}-${index}`}>
            <Input
              aria-label={`选项 ${index + 1} 标签`}
              id={`template-option-${component.id}-${index}-label`}
              name={`template-option-${component.id}-${index}-label`}
              value={option.label}
              onChange={(event) =>
                updateOptions(options.map((item, itemIndex) => (itemIndex === index ? { ...item, label: event.target.value } : item)))
              }
            />
            <Input
              aria-label={`选项 ${index + 1} 值`}
              id={`template-option-${component.id}-${index}-value`}
              name={`template-option-${component.id}-${index}-value`}
              value={option.value}
              onChange={(event) =>
                updateOptions(options.map((item, itemIndex) => (itemIndex === index ? { ...item, value: event.target.value } : item)))
              }
            />
            <Button
              danger
              aria-label={`删除选项 ${index + 1}`}
              icon={<DeleteOutlined />}
              onClick={() => updateOptions(options.filter((_, itemIndex) => itemIndex !== index))}
            />
          </div>
        ))}
      </Space>
      <Form.Item label="默认值" htmlFor={`template-option-${component.id}-default`} style={{ marginTop: 16 }}>
        <Select
          id={`template-option-${component.id}-default`}
          aria-label="默认值"
          mode={isMultiple ? "multiple" : undefined}
          allowClear
          options={optionValues}
          value={
            isMultiple
              ? Array.isArray(component.props.defaultValue)
                ? component.props.defaultValue
                : []
              : typeof component.props.defaultValue === "string"
                ? component.props.defaultValue
                : undefined
          }
          onChange={(value) => patchProps({ defaultValue: value ?? (isMultiple ? [] : "") })}
        />
      </Form.Item>
    </>
  );
}
