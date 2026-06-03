import {
  ArrowLeftOutlined,
  EyeOutlined,
  FileSearchOutlined,
  SaveOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { Alert, App as AntdApp, Button, Drawer, Flex, Space, Spin, Tag, Typography } from "antd";
import { useEffect, useState } from "react";

import { navigate } from "../app/routes";
import { getTask } from "../features/tasks/api";
import type { TaskDetailVO } from "../features/tasks/types";
import { formatTaskTime, taskStatusMeta } from "../features/tasks/view";
import { getTemplateDraft, saveTemplateDraft, validateTemplateSchema } from "../features/templates/api";
import { TemplateDesigner } from "../features/templates/TemplateDesigner";
import { TemplateRenderer } from "../features/templates/TemplateRenderer";
import { getTemplateInitialValue } from "../features/templates/runtime";
import type {
  TemplateDraftVO,
  TemplateSchemaValidationErrorVO,
  TemplateSchemaValidationVO,
  TemplateSchemaVO,
  TemplateSubmissionValue,
} from "../features/templates/types";
import { createEmptyTemplateSchema, summarizeTemplateValidation } from "../features/templates/view";
import { ApiClientError } from "../shared/api/client";
import type { JsonObject } from "../shared/types/api";

interface OwnerTemplateDesignerPageProps {
  taskId: string;
}

const previewPayload: JsonObject = {
  id: "preview_item_001",
  prompt: "请判断下面的回答是否准确、完整，并给出必要的修正建议。",
  question: "上海交通大学位于哪里？",
  model_answer: "上海交通大学位于上海，是中国重点高校之一。",
  reference: "回答需要判断事实正确性、覆盖度和表达清晰度。",
  response_a: "回答准确，覆盖了地点和高校属性。",
  response_b: "回答不完整，没有说明判断依据。",
};

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.payload?.error.message ?? error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "请求失败，请稍后重试。";
}

function getValidationFromApiError(error: unknown): TemplateSchemaValidationVO | null {
  if (!(error instanceof ApiClientError)) {
    return null;
  }
  const details = error.payload?.error.details;
  if (!details || typeof details !== "object" || !("errors" in details)) {
    return null;
  }
  const rawErrors = (details as { errors?: unknown }).errors;
  if (!Array.isArray(rawErrors)) {
    return null;
  }
  const errors = rawErrors.flatMap((item): TemplateSchemaValidationErrorVO[] => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const field = (item as Record<string, unknown>).field;
    const message = (item as Record<string, unknown>).message;
    return typeof field === "string" && typeof message === "string" ? [{ field, message }] : [];
  });
  return { valid: false, errors };
}

export function OwnerTemplateDesignerPage({ taskId }: OwnerTemplateDesignerPageProps) {
  const { message } = AntdApp.useApp();
  const [task, setTask] = useState<TaskDetailVO | null>(null);
  const [draft, setDraft] = useState<TemplateDraftVO | null>(null);
  const [schema, setSchema] = useState<TemplateSchemaVO>(createEmptyTemplateSchema());
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [validation, setValidation] = useState<TemplateSchemaValidationVO | null>(null);
  const [submissionValue, setSubmissionValue] = useState<TemplateSubmissionValue>({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    const loadDesigner = async () => {
      setLoading(true);
      setError(null);
      try {
        const [nextTask, nextDraft] = await Promise.all([getTask(taskId), getTemplateDraft(taskId)]);
        if (ignore) {
          return;
        }
        setTask(nextTask);
        setDraft(nextDraft);
        setSchema(nextDraft.schema);
        setSubmissionValue(getTemplateInitialValue(nextDraft.schema));
        setSelectedComponentId(nextDraft.schema.layout.root.find((node): node is string => typeof node === "string") ?? null);
        setDirty(false);
      } catch (requestError) {
        if (!ignore) {
          setError(getErrorMessage(requestError));
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };
    void loadDesigner();
    return () => {
      ignore = true;
    };
  }, [taskId]);

  function updateSchema(nextSchema: TemplateSchemaVO) {
    setSchema(nextSchema);
    setSubmissionValue(getTemplateInitialValue(nextSchema));
    setValidation(null);
    setDirty(true);
  }

  async function handleValidate() {
    setValidating(true);
    setError(null);
    try {
      const result = await validateTemplateSchema({ schema });
      setValidation(result);
      if (result.valid) {
        message.success("模板 schema 校验通过");
      } else {
        message.warning("模板 schema 仍有需要处理的问题");
      }
      return result;
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      return null;
    } finally {
      setValidating(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const savedDraft = await saveTemplateDraft(taskId, { schema });
      setDraft(savedDraft);
      setSchema(savedDraft.schema);
      setSubmissionValue(getTemplateInitialValue(savedDraft.schema));
      setDirty(false);
      setValidation({ valid: true, errors: [] });
      message.success("模板草稿已保存");
    } catch (requestError) {
      const nextValidation = getValidationFromApiError(requestError);
      if (nextValidation) {
        setValidation(nextValidation);
      }
      setError(getErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  const readOnly = task ? task.status !== "DRAFT" : true;

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <div className="labelhub-designer-topbar">
        <Flex align="center" justify="space-between" gap={16} wrap="wrap">
          <Space size={12} wrap>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/owner/templates")}>
              返回模板工作台
            </Button>
            <Button icon={<SettingOutlined />} onClick={() => navigate(`/owner/tasks/${taskId}/settings`)}>
              任务设置
            </Button>
            {task && <Tag color={taskStatusMeta[task.status].color}>{taskStatusMeta[task.status].label}</Tag>}
            {dirty ? <Tag color="orange">有未保存修改</Tag> : <Tag color="green">草稿已同步</Tag>}
          </Space>
          <Space wrap>
            <Button icon={<EyeOutlined />} onClick={() => setPreviewOpen(true)}>
              预览
            </Button>
            <Button icon={<FileSearchOutlined />} loading={validating} onClick={() => void handleValidate()}>
              校验
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              disabled={readOnly}
              onClick={() => void handleSave()}
            >
              保存草稿
            </Button>
          </Space>
        </Flex>
        <div className="labelhub-designer-title-row">
          <div>
            <Typography.Title level={2}>模板搭建器</Typography.Title>
            <Typography.Text type="secondary">
              Schema 与渲染解耦：左侧物料、中间画布、右侧属性，保存后进入模板草稿。
            </Typography.Text>
          </div>
          <div className="labelhub-designer-meta">
            <Typography.Text type="secondary">任务</Typography.Text>
            <Typography.Text strong>{task?.title ?? "加载中"}</Typography.Text>
            <Typography.Text type="secondary">
              {draft ? `更新于 ${formatTaskTime(draft.updatedAt)}` : "未创建草稿"}
            </Typography.Text>
          </div>
        </div>
      </div>

      {task && readOnly && (
        <Alert
          type="info"
          showIcon
          message="当前任务不是草稿状态，模板搭建器以只读方式展示。"
          description="模板草稿只能在 DRAFT 任务上保存；发布版本将在阶段 2.7 接入。"
        />
      )}
      {validation && (
        <Alert
          type={validation.valid ? "success" : "warning"}
          showIcon
          message={validation.valid ? "模板 schema 校验通过" : "模板 schema 校验未通过"}
          description={validation.valid ? undefined : summarizeTemplateValidation(validation)}
        />
      )}
      {error && <Alert type="error" showIcon message={error} />}

      <Spin spinning={loading}>
        <TemplateDesigner
          schema={schema}
          selectedComponentId={selectedComponentId}
          validation={validation}
          readOnly={readOnly}
          onSchemaChange={updateSchema}
          onSelectedComponentChange={setSelectedComponentId}
        />
      </Spin>

      <Drawer
        title="模板运行时预览"
        width={760}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        destroyOnClose
      >
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Alert
            type="info"
            showIcon
            message="预览使用当前画布中的 schema，不要求先保存。"
            description="后续 Labeler 工作台会复用同一个 Renderer，提交字段以 fieldKey 为准。"
          />
          <TemplateRenderer
            schema={schema}
            itemPayload={previewPayload}
            value={submissionValue}
            onChange={setSubmissionValue}
          />
          <div>
            <Typography.Text strong>当前提交值</Typography.Text>
            <pre className="labelhub-json-preview">{JSON.stringify(submissionValue, null, 2)}</pre>
          </div>
        </Space>
      </Drawer>
    </Space>
  );
}
