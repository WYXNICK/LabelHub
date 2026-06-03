import { Alert, Checkbox, Empty, Form, Input, Radio, Select, Typography } from "antd";

import type { JsonObject } from "../../shared/types/api";
import type { TemplateComponentDTO, TemplateSchemaVO, TemplateSubmissionValue } from "./types";
import {
  formatPayloadValue,
  getRenderableComponents,
  getTemplateOptions,
  readPayloadPath,
  updateTemplateSubmissionValue,
} from "./runtime";

interface TemplateRendererProps {
  schema: TemplateSchemaVO;
  itemPayload: JsonObject;
  value: TemplateSubmissionValue;
  onChange: (nextValue: TemplateSubmissionValue) => void;
  readonly?: boolean;
}

export function TemplateRenderer({
  schema,
  itemPayload,
  value,
  onChange,
  readonly = false,
}: TemplateRendererProps) {
  const renderableComponents = getRenderableComponents(schema);
  if (renderableComponents.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前模板草稿还没有可渲染物料" />;
  }

  return (
    <div className="labelhub-template-renderer">
      {renderableComponents.map((component) =>
        "missingId" in component ? (
          <Alert
            key={component.missingId}
            type="warning"
            showIcon
            message={`布局引用了不存在的组件：${component.missingId}`}
          />
        ) : (
          <RendererField
            key={component.id}
            component={component}
            itemPayload={itemPayload}
            value={value}
            readonly={readonly}
            onChange={onChange}
          />
        ),
      )}
    </div>
  );
}

function RendererField({
  component,
  itemPayload,
  value,
  readonly,
  onChange,
}: {
  component: TemplateComponentDTO;
  itemPayload: JsonObject;
  value: TemplateSubmissionValue;
  readonly: boolean;
  onChange: (nextValue: TemplateSubmissionValue) => void;
}) {
  if (component.type === "SHOW_ITEM") {
    return <ShowItem component={component} itemPayload={itemPayload} />;
  }

  if (!component.fieldKey) {
    return <Alert type="warning" showIcon message={`${component.label} 缺少 fieldKey，暂时无法提交。`} />;
  }

  const required = component.validation.required === true;
  const fieldValue = value[component.fieldKey];
  const inputId = `template-field-${component.fieldKey}`;
  const canUseNativeLabel = component.type === "TEXT_INPUT" || component.type === "TEXTAREA";
  const setValue = (nextValue: string | string[]) =>
    onChange(updateTemplateSubmissionValue(value, component, nextValue));

  return (
    <Form.Item className="labelhub-template-field">
      <FieldLabel label={component.label} required={required} htmlFor={canUseNativeLabel ? inputId : undefined} />
      {renderInput(component, fieldValue, setValue, readonly, inputId)}
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
  onChange: (nextValue: string | string[]) => void,
  readonly: boolean,
  inputId: string,
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
  return <Alert type="info" showIcon message={`${component.type} 将在后续粒度接入运行时渲染。`} />;
}
