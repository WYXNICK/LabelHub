import {
  CheckOutlined,
  CodeOutlined,
  FileImageOutlined,
  ThunderboltOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Alert, Button, Checkbox, Empty, Form, Input, Radio, Select, Space, Tabs, Tag, Tooltip, Typography, Upload } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";

import type { JsonObject } from "../../shared/types/api";
import { formatTaskTime } from "../tasks/view";
import type { TemplateComponentDTO, TemplateFieldValue, TemplateSchemaVO, TemplateSubmissionValue } from "./types";
import {
  formatPayloadValue,
  getRenderableLayoutItems,
  getTemplateOptions,
  getTemplateSubmissionErrorsByField,
  isTemplateComponentRequired,
  isTemplateComponentVisible,
  pruneHiddenSubmissionValue,
  readPayloadPath,
  type RenderableLayoutItem,
  type TemplateSubmissionError,
  updateTemplateSubmissionValue,
} from "./runtime";

interface TemplateRendererProps {
  schema: TemplateSchemaVO;
  itemPayload: JsonObject;
  value: TemplateSubmissionValue;
  onChange: (nextValue: TemplateSubmissionValue) => void;
  readonly?: boolean;
  serverErrors?: TemplateSubmissionError[];
  onUploadFile?: (file: File, component: TemplateComponentDTO) => Promise<string>;
  onRunLlmAction?: (
    component: TemplateComponentDTO,
    inputValues: TemplateSubmissionValue,
  ) => Promise<TemplateLlmActionRunResult>;
}

export interface TemplateLlmActionRunResult {
  status: "SUCCEEDED" | "FAILED";
  outputValue: unknown | null;
  outputValues: TemplateSubmissionValue | null;
  errorMessage?: string | null;
  createdAt?: string;
}

export function TemplateRenderer({
  schema,
  itemPayload,
  value,
  onChange,
  readonly = false,
  serverErrors = [],
  onUploadFile,
  onRunLlmAction,
}: TemplateRendererProps) {
  const renderableItems = useMemo(() => getRenderableLayoutItems(schema), [schema]);
  const errorsByField = useMemo(
    () => mergeErrorsByField(getTemplateSubmissionErrorsByField(schema, value), serverErrors),
    [schema, serverErrors, value],
  );

  useEffect(() => {
    const nextValue = pruneHiddenSubmissionValue(schema, value);
    if (!isSameSubmissionValue(value, nextValue)) {
      onChange(nextValue);
    }
  }, [schema, value, onChange]);

  if (renderableItems.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前模板草稿还没有可渲染物料" />;
  }

  return (
    <div className="labelhub-template-renderer">
      {renderableItems.map((item, index) => (
        <RendererLayoutItem
          key={"missingId" in item ? `missing-${item.missingId}-${index}` : item.component.id}
          item={item}
          itemPayload={itemPayload}
          value={value}
          errorsByField={errorsByField}
          readonly={readonly}
          onUploadFile={onUploadFile}
          onRunLlmAction={onRunLlmAction}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

function RendererLayoutItem({
  item,
  itemPayload,
  value,
  errorsByField,
  readonly,
  onUploadFile,
  onRunLlmAction,
  onChange,
}: {
  item: RenderableLayoutItem;
  itemPayload: JsonObject;
  value: TemplateSubmissionValue;
  errorsByField: Map<string, string[]>;
  readonly: boolean;
  onUploadFile?: (file: File, component: TemplateComponentDTO) => Promise<string>;
  onRunLlmAction?: (
    component: TemplateComponentDTO,
    inputValues: TemplateSubmissionValue,
  ) => Promise<TemplateLlmActionRunResult>;
  onChange: (nextValue: TemplateSubmissionValue) => void;
}) {
  if ("missingId" in item) {
    return <Alert type="warning" showIcon message={`布局引用了不存在的组件：${item.missingId}`} />;
  }

  const { component } = item;
  if (!isTemplateComponentVisible(component, value)) {
    return null;
  }

  if (component.type === "GROUP") {
    return (
      <section className="labelhub-template-group">
        <div className="labelhub-template-group-head">
          <Typography.Text strong>{component.label}</Typography.Text>
          {typeof component.props.description === "string" && component.props.description && (
            <Typography.Text type="secondary">{component.props.description}</Typography.Text>
          )}
        </div>
        <div className="labelhub-template-group-body">
          {(item.children ?? []).map((child, index) => (
            <RendererLayoutItem
              key={"missingId" in child ? `missing-${child.missingId}-${index}` : child.component.id}
              item={child}
              itemPayload={itemPayload}
              value={value}
              errorsByField={errorsByField}
              readonly={readonly}
              onUploadFile={onUploadFile}
              onRunLlmAction={onRunLlmAction}
              onChange={onChange}
            />
          ))}
          {(item.children ?? []).length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="分组内暂无字段" />}
        </div>
      </section>
    );
  }

  if (component.type === "TABS") {
    const tabs = item.tabs ?? [];
    const defaultTabId = typeof component.props.defaultTabId === "string" ? component.props.defaultTabId : tabs[0]?.id;
    return (
      <section className="labelhub-template-tabs">
        <Typography.Text strong>{component.label}</Typography.Text>
        <Tabs
          defaultActiveKey={defaultTabId}
          items={tabs.map((tab) => ({
            key: tab.id,
            label: tab.label,
            children: (
              <div className="labelhub-template-tab-body">
                {tab.children.length > 0 ? (
                  tab.children.map((child, index) => (
                    <RendererLayoutItem
                      key={"missingId" in child ? `missing-${child.missingId}-${index}` : child.component.id}
                      item={child}
                      itemPayload={itemPayload}
                      value={value}
                      errorsByField={errorsByField}
                      readonly={readonly}
                      onUploadFile={onUploadFile}
                      onRunLlmAction={onRunLlmAction}
                      onChange={onChange}
                    />
                  ))
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前 Tab 暂无字段" />
                )}
              </div>
            ),
          }))}
        />
      </section>
    );
  }

  return (
    <RendererField
      component={component}
      itemPayload={itemPayload}
      value={value}
      errorsByField={errorsByField}
      readonly={readonly}
      onUploadFile={onUploadFile}
      onRunLlmAction={onRunLlmAction}
      onChange={onChange}
    />
  );
}

function RendererField({
  component,
  itemPayload,
  value,
  errorsByField,
  readonly,
  onUploadFile,
  onRunLlmAction,
  onChange,
}: {
  component: TemplateComponentDTO;
  itemPayload: JsonObject;
  value: TemplateSubmissionValue;
  errorsByField: Map<string, string[]>;
  readonly: boolean;
  onUploadFile?: (file: File, component: TemplateComponentDTO) => Promise<string>;
  onRunLlmAction?: (
    component: TemplateComponentDTO,
    inputValues: TemplateSubmissionValue,
  ) => Promise<TemplateLlmActionRunResult>;
  onChange: (nextValue: TemplateSubmissionValue) => void;
}) {
  if (component.type === "SHOW_ITEM") {
    return <ShowItem component={component} itemPayload={itemPayload} />;
  }

  if (component.type === "LLM_ACTION") {
    return (
      <LlmAction
        component={component}
        value={value}
        readonly={readonly}
        onChange={onChange}
        onRunLlmAction={onRunLlmAction}
      />
    );
  }

  if (!component.fieldKey) {
    return <Alert type="warning" showIcon message={`${component.label} 缺少 fieldKey，暂时无法提交。`} />;
  }

  const errors = errorsByField.get(component.fieldKey) ?? [];
  const required = isTemplateComponentRequired(component, value);
  const fieldValue = value[component.fieldKey];
  const inputId = `template-field-${component.fieldKey}`;
  const canUseNativeLabel =
    component.type === "TEXT_INPUT" ||
    component.type === "TEXTAREA" ||
    component.type === "RICH_TEXT" ||
    component.type === "JSON_EDITOR";
  const setValue = (nextValue: TemplateFieldValue) =>
    onChange(updateTemplateSubmissionValue(value, component, nextValue));

  return (
    <Form.Item
      className="labelhub-template-field"
      validateStatus={errors.length > 0 ? "error" : undefined}
      help={errors.length > 0 ? errors.join("；") : undefined}
    >
      <FieldLabel label={component.label} required={required} htmlFor={canUseNativeLabel ? inputId : undefined} />
      {renderInput(component, fieldValue, setValue, readonly, inputId, onUploadFile)}
    </Form.Item>
  );
}

function FieldLabel({ label, required, htmlFor }: { label: string; required: boolean; htmlFor?: string }) {
  const content = (
    <>
      <Typography.Text strong>{label}</Typography.Text>
      {required && <Typography.Text type="danger"> *</Typography.Text>}
    </>
  );
  if (htmlFor) {
    return (
      <label className="labelhub-template-field-label" htmlFor={htmlFor}>
        {content}
      </label>
    );
  }
  return <div className="labelhub-template-field-label">{content}</div>;
}

function ShowItem({ component, itemPayload }: { component: TemplateComponentDTO; itemPayload: JsonObject }) {
  const rawPath = component.props.path;
  const path = typeof rawPath === "string" ? rawPath : "$";
  const displayValue = formatPayloadValue(readPayloadPath(itemPayload, path));
  const isBlockValue = displayValue.includes("\n") || displayValue.length > 120;
  return (
    <section className="labelhub-template-show-item">
      <Typography.Text strong>{component.label}</Typography.Text>
      <Typography.Text type="secondary" className="labelhub-template-path">
        {path}
      </Typography.Text>
      {isBlockValue ? (
        <pre className="labelhub-template-show-block">{displayValue}</pre>
      ) : (
        <Typography.Paragraph className="labelhub-template-show-text">{displayValue}</Typography.Paragraph>
      )}
    </section>
  );
}

function renderInput(
  component: TemplateComponentDTO,
  fieldValue: unknown,
  onChange: (nextValue: TemplateFieldValue) => void,
  readonly: boolean,
  inputId: string,
  onUploadFile?: (file: File, component: TemplateComponentDTO) => Promise<string>,
) {
  const placeholder = typeof component.props.placeholder === "string" ? component.props.placeholder : undefined;
  if (component.type === "TEXT_INPUT") {
    return (
      <Input
        id={inputId}
        name={component.fieldKey ?? component.id}
        aria-label={component.label}
        disabled={readonly}
        placeholder={placeholder}
        value={typeof fieldValue === "string" ? fieldValue : ""}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  if (component.type === "TEXTAREA") {
    return (
      <Input.TextArea
        id={inputId}
        name={component.fieldKey ?? component.id}
        aria-label={component.label}
        disabled={readonly}
        rows={4}
        placeholder={placeholder}
        value={typeof fieldValue === "string" ? fieldValue : ""}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  if (component.type === "RICH_TEXT") {
    return (
      <RichTextInput
        component={component}
        fieldValue={fieldValue}
        inputId={inputId}
        placeholder={placeholder}
        readonly={readonly}
        onChange={onChange}
      />
    );
  }
  if (component.type === "RADIO") {
    return (
      <Radio.Group
        id={inputId}
        name={component.fieldKey ?? component.id}
        aria-label={component.label}
        disabled={readonly}
        options={getTemplateOptions(component)}
        value={typeof fieldValue === "string" ? fieldValue : undefined}
        onChange={(event) => onChange(event.target.value as string)}
      />
    );
  }
  if (component.type === "CHECKBOX") {
    return (
      <Checkbox.Group
        name={component.fieldKey ?? component.id}
        aria-label={component.label}
        disabled={readonly}
        options={getTemplateOptions(component)}
        value={Array.isArray(fieldValue) ? fieldValue : []}
        onChange={(nextValue) => onChange(nextValue.map(String))}
      />
    );
  }
  if (component.type === "TAG_SELECT") {
    return (
      <Select
        id={inputId}
        aria-label={component.label}
        mode="multiple"
        disabled={readonly}
        options={getTemplateOptions(component)}
        value={Array.isArray(fieldValue) ? fieldValue : []}
        onChange={(nextValue) => onChange(nextValue)}
        placeholder={placeholder}
      />
    );
  }
  if (component.type === "FILE_UPLOAD" || component.type === "IMAGE_UPLOAD") {
    const names = Array.isArray(fieldValue) ? fieldValue.map(String) : [];
    const maxFiles = getNumberProp(component.props.maxFiles, component.type === "IMAGE_UPLOAD" ? 6 : 3);
    const accept = getStringArrayProp(component.props.accept).join(",");
    const fileList = names.map((name) => ({ uid: name, name, status: "done" as const }));
    return (
      <Upload.Dragger
        name={component.fieldKey ?? component.id}
        aria-label={component.label}
        disabled={readonly || names.length >= maxFiles}
        multiple
        maxCount={maxFiles}
        accept={accept || undefined}
        fileList={fileList}
        listType={component.type === "IMAGE_UPLOAD" ? "picture" : "text"}
        beforeUpload={async (file) => {
          try {
            const fileRef = onUploadFile ? await onUploadFile(file, component) : file.name;
            onChange([...names, fileRef].slice(0, maxFiles));
          } catch {
            return Upload.LIST_IGNORE;
          }
          return false;
        }}
        onRemove={(file) => {
          onChange(names.filter((name) => name !== file.name));
          return true;
        }}
      >
        <p className="ant-upload-drag-icon">
          {component.type === "IMAGE_UPLOAD" ? <FileImageOutlined /> : <UploadOutlined />}
        </p>
        <p className="ant-upload-text">{component.type === "IMAGE_UPLOAD" ? "选择或拖拽图片" : "选择或拖拽文件"}</p>
        <p className="ant-upload-hint">
          最多 {maxFiles} 个；{accept ? `允许 ${accept}` : "类型不限"}。当前预览仅记录文件名。
        </p>
      </Upload.Dragger>
    );
  }
  if (component.type === "JSON_EDITOR") {
    const editorValue =
      typeof fieldValue === "string" ? fieldValue : formatJsonEditorValue(fieldValue && typeof fieldValue === "object" ? fieldValue : {});
    return (
      <Input.TextArea
        id={inputId}
        name={component.fieldKey ?? component.id}
        aria-label={component.label}
        className="labelhub-schema-editor"
        disabled={readonly}
        rows={8}
        placeholder={placeholder}
        value={editorValue}
        onChange={(event) => onChange(parseJsonObjectOrDraft(event.target.value))}
      />
    );
  }
  return <Alert type="info" showIcon message={`${component.type} 将在后续粒度接入运行时渲染。`} />;
}

function RichTextInput({
  component,
  fieldValue,
  inputId,
  placeholder,
  readonly,
  onChange,
}: {
  component: TemplateComponentDTO;
  fieldValue: unknown;
  inputId: string;
  placeholder?: string;
  readonly: boolean;
  onChange: (nextValue: TemplateFieldValue) => void;
}) {
  const textAreaRef = useRef<TextAreaRef>(null);
  const textValue = typeof fieldValue === "string" ? fieldValue : "";

  const focusSelection = (start: number, end: number) => {
    window.requestAnimationFrame(() => {
      const textArea = textAreaRef.current?.resizableTextArea?.textArea;
      textArea?.focus();
      textArea?.setSelectionRange(start, end);
    });
  };

  const getSelection = () => {
    const textArea = textAreaRef.current?.resizableTextArea?.textArea;
    return {
      start: textArea?.selectionStart ?? textValue.length,
      end: textArea?.selectionEnd ?? textValue.length,
    };
  };

  const updateText = (nextText: string, selectionStart = nextText.length, selectionEnd = nextText.length) => {
    onChange(nextText);
    focusSelection(selectionStart, selectionEnd);
  };

  const wrapSelection = (prefix: string, suffix: string, fallback: string) => {
    const { start, end } = getSelection();
    const selectedText = textValue.slice(start, end) || fallback;
    const nextText = `${textValue.slice(0, start)}${prefix}${selectedText}${suffix}${textValue.slice(end)}`;
    const nextStart = start + prefix.length;
    updateText(nextText, nextStart, nextStart + selectedText.length);
  };

  const transformSelectedLines = (transform: (line: string, index: number) => string) => {
    const { start, end } = getSelection();
    const blockStart = textValue.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const nextLineIndex = textValue.indexOf("\n", end);
    const blockEnd = nextLineIndex >= 0 ? nextLineIndex : textValue.length;
    const block = textValue.slice(blockStart, blockEnd) || "";
    const nextBlock = block.split("\n").map(transform).join("\n");
    const nextText = `${textValue.slice(0, blockStart)}${nextBlock}${textValue.slice(blockEnd)}`;
    updateText(nextText, blockStart, blockStart + nextBlock.length);
  };

  const clearFormatting = () => {
    // 只清理工具栏可产生的轻量 Markdown 标记，避免误伤正文内容。
    const nextText = textValue
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/_(.*?)_/g, "$1")
      .replace(/^\s*[-*]\s+/gm, "")
      .replace(/^\s*\d+\.\s+/gm, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    updateText(nextText);
  };

  return (
    <div className="labelhub-rich-runtime">
      <div className="labelhub-rich-runtime-toolbar" aria-label={`${component.label} 富文本工具栏`}>
        <div className="labelhub-rich-runtime-tools">
          <Tooltip title="加粗选中文本">
            <Button size="small" disabled={readonly} onClick={() => wrapSelection("**", "**", "加粗文本")}>
              <span className="labelhub-rich-toolbar-mark">B</span>
              加粗
            </Button>
          </Tooltip>
          <Tooltip title="斜体选中文本">
            <Button size="small" disabled={readonly} onClick={() => wrapSelection("_", "_", "斜体文本")}>
              <span className="labelhub-rich-toolbar-mark labelhub-rich-toolbar-mark-italic">I</span>
              斜体
            </Button>
          </Tooltip>
          <Tooltip title="转换为无序列表">
            <Button
              size="small"
              disabled={readonly}
              onClick={() => transformSelectedLines((line) => (line.trim().startsWith("- ") ? line : `- ${line || "列表项"}`))}
            >
              无序列表
            </Button>
          </Tooltip>
          <Tooltip title="转换为有序列表">
            <Button
              size="small"
              disabled={readonly}
              onClick={() =>
                transformSelectedLines((line, index) => (/^\s*\d+\.\s+/.test(line) ? line : `${index + 1}. ${line || "列表项"}`))
              }
            >
              有序列表
            </Button>
          </Tooltip>
          <Tooltip title="插入链接">
            <Button size="small" disabled={readonly} onClick={() => wrapSelection("[", "](https://)", "链接文本")}>
              插入链接
            </Button>
          </Tooltip>
          <Tooltip title="清除工具栏格式">
            <Button size="small" disabled={readonly || !textValue} onClick={clearFormatting}>
              清除格式
            </Button>
          </Tooltip>
        </div>
        <Typography.Text type="secondary" className="labelhub-rich-runtime-counter">
          {textValue.length} 字
        </Typography.Text>
      </div>
      <Input.TextArea
        ref={textAreaRef}
        id={inputId}
        name={component.fieldKey ?? component.id}
        aria-label={component.label}
        disabled={readonly}
        rows={7}
        placeholder={placeholder}
        value={textValue}
        onChange={(event) => onChange(event.target.value)}
      />
      <div className="labelhub-rich-runtime-preview" aria-live="polite">
        <Typography.Text strong>格式预览</Typography.Text>
        <RichTextPreview value={textValue} />
      </div>
    </div>
  );
}

function RichTextPreview({ value }: { value: string }) {
  if (!value.trim()) {
    return <Typography.Text type="secondary">暂无富文本内容</Typography.Text>;
  }
  return <div className="labelhub-rich-runtime-preview-body">{renderRichTextBlocks(value)}</div>;
}

function renderRichTextBlocks(value: string): ReactNode[] {
  const blocks: ReactNode[] = [];
  let listBuffer: { type: "ul" | "ol"; items: string[] } | null = null;

  const flushList = () => {
    if (!listBuffer) {
      return;
    }
    const ListTag = listBuffer.type;
    blocks.push(
      <ListTag key={`list-${blocks.length}`}>
        {listBuffer.items.map((item, index) => (
          <li key={`${item}-${index}`}>{renderInlineRichText(item)}</li>
        ))}
      </ListTag>,
    );
    listBuffer = null;
  };

  value.split("\n").forEach((line, index) => {
    const unorderedMatch = line.match(/^\s*[-*]\s+(.+)$/);
    const orderedMatch = line.match(/^\s*\d+\.\s+(.+)$/);
    if (unorderedMatch || orderedMatch) {
      const nextType = unorderedMatch ? "ul" : "ol";
      if (listBuffer?.type !== nextType) {
        flushList();
        listBuffer = { type: nextType, items: [] };
      }
      listBuffer.items.push((unorderedMatch ?? orderedMatch)?.[1] ?? "");
      return;
    }

    flushList();
    if (line.trim()) {
      blocks.push(<p key={`p-${index}`}>{renderInlineRichText(line)}</p>);
    } else {
      blocks.push(<br key={`br-${index}`} />);
    }
  });
  flushList();

  return blocks;
}

function renderInlineRichText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*([^*]+)\*\*|_([^_]+)_|\[([^\]]+)\]\(([^)\s]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      nodes.push(<strong key={`b-${match.index}`}>{match[2]}</strong>);
    } else if (match[3]) {
      nodes.push(<em key={`i-${match.index}`}>{match[3]}</em>);
    } else {
      nodes.push(
        <Typography.Link key={`a-${match.index}`} href={getSafePreviewUrl(match[5])} target="_blank" rel="noreferrer">
          {match[4]}
        </Typography.Link>,
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

function getSafePreviewUrl(url: string) {
  return /^https?:\/\//i.test(url) ? url : undefined;
}

function LlmAction({
  component,
  value,
  readonly,
  onChange,
  onRunLlmAction,
}: {
  component: TemplateComponentDTO;
  value: TemplateSubmissionValue;
  readonly: boolean;
  onChange: (nextValue: TemplateSubmissionValue) => void;
  onRunLlmAction?: (
    component: TemplateComponentDTO,
    inputValues: TemplateSubmissionValue,
  ) => Promise<TemplateLlmActionRunResult>;
}) {
  const [result, setResult] = useState<TemplateLlmActionRunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const inputItemPaths = getStringArrayProp(component.props.inputItemPaths);
  const inputFieldKeys = getStringArrayProp(component.props.inputFieldKeys);
  const outputFieldKey = typeof component.props.outputFieldKey === "string" ? component.props.outputFieldKey : "";
  const promptTemplate = typeof component.props.promptTemplate === "string" ? component.props.promptTemplate : "";
  const outputValues = useMemo(() => coerceOutputValues(result?.outputValues), [result]);
  const canApply = !readonly && result?.status === "SUCCEEDED" && outputValues && Object.keys(outputValues).length > 0;

  const handleRun = useCallback(async () => {
    if (!onRunLlmAction || running) {
      return;
    }
    setRunning(true);
    setRunError(null);
    try {
      const nextResult = await onRunLlmAction(component, value);
      setResult(nextResult);
      setRunError(nextResult.status === "FAILED" ? nextResult.errorMessage ?? "LLM 辅助生成失败，请稍后重试。" : null);
    } catch (error) {
      setRunError(getRuntimeErrorMessage(error));
    } finally {
      setRunning(false);
    }
  }, [component, onRunLlmAction, running, value]);

  const handleApply = useCallback(() => {
    if (!outputValues) {
      return;
    }
    onChange({ ...value, ...outputValues });
  }, [onChange, outputValues, value]);

  return (
    <section className="labelhub-template-llm-action" data-status={result?.status.toLowerCase() ?? "idle"}>
      <Space className="labelhub-template-llm-head" align="start" size={12}>
        <span className="labelhub-template-llm-icon">
          <ThunderboltOutlined />
        </span>
        <div>
          <Typography.Text strong>{component.label}</Typography.Text>
          <Typography.Paragraph type="secondary" className="labelhub-template-llm-desc">
            {typeof component.props.helperText === "string" ? component.props.helperText : "模型输出仅作参考，标注员确认后再提交。"}
          </Typography.Paragraph>
        </div>
      </Space>
      <div className="labelhub-template-llm-meta">
        <Tag color="purple">
          题目：{inputItemPaths.length > 0 ? inputItemPaths.join(", ") : "未配置"}
        </Tag>
        <Tag color="purple">
          字段：{inputFieldKeys.length > 0 ? inputFieldKeys.join(", ") : "未配置"}
        </Tag>
        <Tag color="blue">输出：{outputFieldKey || "未配置"}</Tag>
        <Tag>OpenAI 兼容调用</Tag>
      </div>
      {promptTemplate && (
        <pre className="labelhub-template-llm-prompt">
          <CodeOutlined /> {promptTemplate}
        </pre>
      )}
      {result?.status === "SUCCEEDED" && (
        <div className="labelhub-template-llm-result">
          <Typography.Text strong>模型建议</Typography.Text>
          <pre>{formatLlmOutput(result.outputValue)}</pre>
          {result.createdAt && (
            <Typography.Text type="secondary">生成时间：{formatTaskTime(result.createdAt)}</Typography.Text>
          )}
        </div>
      )}
      {runError && <Alert type="warning" showIcon message={runError} />}
      <Space className="labelhub-template-llm-actions" wrap>
        <Button
          disabled={readonly || !onRunLlmAction}
          icon={<ThunderboltOutlined />}
          loading={running}
          onClick={() => void handleRun()}
        >
          {typeof component.props.actionLabel === "string" ? component.props.actionLabel : "生成参考建议"}
        </Button>
        {canApply && (
          <Button type="primary" ghost icon={<CheckOutlined />} onClick={handleApply}>
            {outputFieldKey ? `采纳到 ${outputFieldKey}` : "采纳建议"}
          </Button>
        )}
      </Space>
    </section>
  );
}

function coerceOutputValues(value: TemplateSubmissionValue | null | undefined): TemplateSubmissionValue | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const entries = Object.entries(value).filter(([key]) => key.trim());
  return entries.length > 0 ? (Object.fromEntries(entries) as TemplateSubmissionValue) : null;
}

function formatLlmOutput(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
}

function getRuntimeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "LLM 辅助生成失败，请稍后重试。";
}

function getStringArrayProp(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function getNumberProp(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function formatJsonEditorValue(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "{}";
  }
}

function parseJsonObjectOrDraft(value: string): TemplateFieldValue {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as TemplateFieldValue) : value;
  } catch {
    return value;
  }
}

function isSameSubmissionValue(left: TemplateSubmissionValue, right: TemplateSubmissionValue): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  return leftKeys.every((key) => JSON.stringify(left[key]) === JSON.stringify(right[key]));
}

function mergeErrorsByField(
  runtimeErrors: Map<string, string[]>,
  serverErrors: TemplateSubmissionError[],
): Map<string, string[]> {
  const merged = new Map(runtimeErrors);
  for (const error of serverErrors) {
    merged.set(error.fieldKey, [...(merged.get(error.fieldKey) ?? []), error.message]);
  }
  return merged;
}
