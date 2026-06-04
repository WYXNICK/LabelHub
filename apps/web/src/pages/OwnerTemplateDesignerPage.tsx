import {
  ArrowLeftOutlined,
  AuditOutlined,
  CloudUploadOutlined,
  EyeOutlined,
  FileSearchOutlined,
  HistoryOutlined,
  SaveOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { Alert, App as AntdApp, Button, Drawer, Empty, Flex, Input, List, Space, Spin, Tag, Typography } from "antd";
import { useCallback, useEffect, useState } from "react";

import { navigate } from "../app/routes";
import { getTask } from "../features/tasks/api";
import type { TaskDetailVO } from "../features/tasks/types";
import { formatTaskTime, taskStatusMeta } from "../features/tasks/view";
import {
  getTemplateDraft,
  listTemplateVersions,
  publishTemplateVersion,
  saveTemplateDraft,
  validateTemplateSchema,
} from "../features/templates/api";
import { TemplateDesigner } from "../features/templates/TemplateDesigner";
import { TemplateRenderer } from "../features/templates/TemplateRenderer";
import { getTemplateInitialValue } from "../features/templates/runtime";
import type {
  TemplateDraftVO,
  TemplateSchemaValidationErrorVO,
  TemplateSchemaValidationVO,
  TemplateSchemaVO,
  TemplateSubmissionValue,
  TemplateVersionVO,
} from "../features/templates/types";
import {
  collectTemplateFieldKeys,
  createEmptyTemplateSchema,
  getTemplateDesignerEntry,
  getTemplateDesignerReturnTarget,
  summarizeTemplateValidation,
} from "../features/templates/view";
import { ApiClientError } from "../shared/api/client";
import type { JsonObject } from "../shared/types/api";
import { OwnerPublishCheckDrawer } from "./OwnerPublishCheckDrawer";

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
  const [versionDrawerOpen, setVersionDrawerOpen] = useState(false);
  const [publishCheckOpen, setPublishCheckOpen] = useState(false);
  const [versions, setVersions] = useState<TemplateVersionVO[]>([]);
  const [versionNote, setVersionNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [publishingVersion, setPublishingVersion] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const returnTarget = getTemplateDesignerReturnTarget(taskId, getTemplateDesignerEntry(window.location.search));

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

  const loadVersions = useCallback(async () => {
    setVersionsLoading(true);
    try {
      const response = await listTemplateVersions(taskId, { page: 1, pageSize: 20 });
      setVersions(response.data);
    } catch (requestError) {
      message.error(getErrorMessage(requestError));
    } finally {
      setVersionsLoading(false);
    }
  }, [message, taskId]);

  useEffect(() => {
    if (!versionDrawerOpen) {
      return;
    }
    void loadVersions();
  }, [loadVersions, versionDrawerOpen]);

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

  async function persistDraft(showSuccess: boolean): Promise<TemplateDraftVO | null> {
    setSaving(true);
    setError(null);
    try {
      const savedDraft = await saveTemplateDraft(taskId, { schema });
      setDraft(savedDraft);
      setSchema(savedDraft.schema);
      setSubmissionValue(getTemplateInitialValue(savedDraft.schema));
      setDirty(false);
      setValidation({ valid: true, errors: [] });
      if (showSuccess) {
        message.success("模板草稿已保存");
      }
      return savedDraft;
    } catch (requestError) {
      const nextValidation = getValidationFromApiError(requestError);
      if (nextValidation) {
        setValidation(nextValidation);
      }
      setError(getErrorMessage(requestError));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    await persistDraft(true);
  }

  async function handlePublishVersion() {
    if (!draft) {
      message.warning("模板草稿尚未加载完成");
      return;
    }
    setPublishingVersion(true);
    setError(null);
    try {
      const validationResult = await validateTemplateSchema({ schema });
      setValidation(validationResult);
      if (!validationResult.valid) {
        message.warning("模板 schema 仍有需要处理的问题，暂不能发布版本");
        return;
      }

      // 发布前固定走一次保存，确保后端版本快照来自最新草稿。
      const savedDraft = await persistDraft(false);
      if (!savedDraft) {
        return;
      }

      const version = await publishTemplateVersion(taskId, {
        draftId: savedDraft.id,
        versionNote: versionNote.trim() || null,
      });
      const [nextTask, nextVersions] = await Promise.all([
        getTask(taskId),
        listTemplateVersions(taskId, { page: 1, pageSize: 20 }),
      ]);
      setTask(nextTask);
      setVersions(nextVersions.data);
      setVersionNote("");
      setDirty(false);
      message.success(`模板版本 r${version.versionNo} 已发布`);
    } catch (requestError) {
      const nextValidation = getValidationFromApiError(requestError);
      if (nextValidation) {
        setValidation(nextValidation);
      }
      setError(getErrorMessage(requestError));
    } finally {
      setPublishingVersion(false);
    }
  }

  const readOnly = task ? task.status !== "DRAFT" : true;

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <div className="labelhub-designer-topbar">
        <Flex align="center" justify="space-between" gap={16} wrap="wrap">
          <Space size={12} wrap>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(returnTarget.path)}>
              {returnTarget.label}
            </Button>
            <Button icon={<SettingOutlined />} onClick={() => navigate(`/owner/tasks/${taskId}/settings`)}>
              任务设置
            </Button>
            {task && <Tag color={taskStatusMeta[task.status].color}>{taskStatusMeta[task.status].label}</Tag>}
            {dirty ? <Tag color="orange">有未保存修改</Tag> : <Tag color="green">草稿已同步</Tag>}
            {task?.currentTemplateVersionId ? <Tag color="green">模板已发布</Tag> : <Tag color="orange">未发布模板版本</Tag>}
          </Space>
          <Space wrap>
            <Button icon={<EyeOutlined />} onClick={() => setPreviewOpen(true)}>
              预览
            </Button>
            <Button icon={<FileSearchOutlined />} loading={validating} onClick={() => void handleValidate()}>
              校验
            </Button>
            <Button
              icon={<SaveOutlined />}
              loading={saving}
              disabled={readOnly}
              onClick={() => void handleSave()}
            >
              保存草稿
            </Button>
            <Button icon={<AuditOutlined />} onClick={() => setPublishCheckOpen(true)}>
              发布检查
            </Button>
            <Button icon={<HistoryOutlined />} onClick={() => setVersionDrawerOpen(true)}>
              版本记录
            </Button>
            <Button
              type="primary"
              icon={<CloudUploadOutlined />}
              disabled={readOnly}
              loading={publishingVersion}
              onClick={() => setVersionDrawerOpen(true)}
            >
              发布版本
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
          description="模板草稿和模板版本只能在 DRAFT 任务上维护；已发布、暂停或结束任务不会被草稿改动影响。"
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

      <Drawer
        title="模板版本"
        width={620}
        open={versionDrawerOpen}
        onClose={() => setVersionDrawerOpen(false)}
        extra={
          <Button icon={<HistoryOutlined />} loading={versionsLoading} onClick={() => void loadVersions()}>
            刷新
          </Button>
        }
      >
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Alert
            type={task?.currentTemplateVersionId ? "success" : "info"}
            showIcon
            message={task?.currentTemplateVersionId ? "当前任务已绑定模板版本" : "当前任务尚未发布模板版本"}
            description="发布会把当前草稿固化为不可变版本，并同步更新任务的当前模板版本；后续修改草稿不会影响历史版本。"
          />

          <div className="labelhub-template-version-publish">
            <Space direction="vertical" size={10} style={{ width: "100%" }}>
              <Flex justify="space-between" align="center" gap={12} wrap="wrap">
                <Space direction="vertical" size={2}>
                  <Typography.Text strong>发布当前草稿</Typography.Text>
                  <Typography.Text type="secondary">
                    发布前会重新校验并保存当前画布，成功后可解除模板版本阻塞项。
                  </Typography.Text>
                </Space>
                <Button
                  type="primary"
                  icon={<CloudUploadOutlined />}
                  loading={publishingVersion || saving}
                  disabled={readOnly || loading}
                  onClick={() => void handlePublishVersion()}
                >
                  保存并发布版本
                </Button>
              </Flex>
              <Input.TextArea
                id="template-version-note"
                name="templateVersionNote"
                aria-label="模板版本备注"
                rows={3}
                maxLength={200}
                showCount
                disabled={readOnly || publishingVersion}
                placeholder="填写本次模板变更说明，例如：补齐质量标签与返修原因字段"
                value={versionNote}
                onChange={(event) => setVersionNote(event.target.value)}
              />
            </Space>
          </div>

          <List
            loading={versionsLoading}
            dataSource={versions}
            locale={{
              emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无模板版本" />,
            }}
            renderItem={(version) => {
              const isCurrent = version.id === task?.currentTemplateVersionId;
              const fieldCount = collectTemplateFieldKeys(version.schema).length;
              return (
                <List.Item className="labelhub-template-version-item">
                  <Space direction="vertical" size={8} style={{ width: "100%" }}>
                    <Flex justify="space-between" align="flex-start" gap={12} wrap="wrap">
                      <Space size={8} wrap>
                        <Typography.Text strong>r{version.versionNo}</Typography.Text>
                        <Tag color={version.status === "ACTIVE" ? "green" : "default"}>{version.status}</Tag>
                        {isCurrent && <Tag color="blue">当前绑定</Tag>}
                      </Space>
                      <Typography.Text type="secondary">{formatTaskTime(version.publishedAt)}</Typography.Text>
                    </Flex>
                    <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                      {version.versionNote || "未填写版本备注"}
                    </Typography.Paragraph>
                    <Flex justify="space-between" align="center" gap={12} wrap="wrap">
                      <Space size={8} wrap>
                        <Tag>{version.schema.components.length} 个物料</Tag>
                        <Tag>{fieldCount} 个提交字段</Tag>
                        <Tag className="labelhub-mono-id">{version.id}</Tag>
                      </Space>
                      <Typography.Text type="secondary">发布人：{version.publishedBy}</Typography.Text>
                    </Flex>
                  </Space>
                </List.Item>
              );
            }}
          />
        </Space>
      </Drawer>

      <OwnerPublishCheckDrawer
        taskId={taskId}
        open={publishCheckOpen}
        onClose={() => setPublishCheckOpen(false)}
        onPublished={setTask}
      />
    </Space>
  );
}
