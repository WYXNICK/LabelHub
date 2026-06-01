import {
  ArrowLeftOutlined,
  AuditOutlined,
  DatabaseOutlined,
  FileProtectOutlined,
  FormOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { Alert, Button, Card, Empty, Flex, Space, Spin, Tag, Typography } from "antd";
import { useEffect, useState } from "react";

import { navigate } from "../app/routes";
import { getTask } from "../features/tasks/api";
import type { TaskDetailVO } from "../features/tasks/types";
import { taskStatusMeta } from "../features/tasks/view";
import { getTemplateDraft } from "../features/templates/api";
import { TemplateRenderer } from "../features/templates/TemplateRenderer";
import { getTemplateInitialValue, summarizeRendererSchema } from "../features/templates/runtime";
import type { TemplateDraftVO, TemplateSubmissionValue } from "../features/templates/types";
import { ApiClientError } from "../shared/api/client";
import type { JsonObject } from "../shared/types/api";
import { OwnerPublishCheckDrawer } from "./OwnerPublishCheckDrawer";

interface OwnerTemplateRendererPreviewPageProps {
  taskId: string;
}

const previewPayload: JsonObject = {
  id: "preview_item_001",
  prompt: "请判断下面回答是否准确、完整，并给出必要的修正建议。",
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

export function OwnerTemplateRendererPreviewPage({ taskId }: OwnerTemplateRendererPreviewPageProps) {
  const [task, setTask] = useState<TaskDetailVO | null>(null);
  const [draft, setDraft] = useState<TemplateDraftVO | null>(null);
  const [submissionValue, setSubmissionValue] = useState<TemplateSubmissionValue>({});
  const [publishCheckOpen, setPublishCheckOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    const loadPreview = async () => {
      setLoading(true);
      setError(null);
      try {
        const [nextTask, nextDraft] = await Promise.all([getTask(taskId), getTemplateDraft(taskId)]);
        if (ignore) {
          return;
        }
        setTask(nextTask);
        setDraft(nextDraft);
        setSubmissionValue(getTemplateInitialValue(nextDraft.schema));
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
    void loadPreview();
    return () => {
      ignore = true;
    };
  }, [taskId]);

  const schemaSummary = draft ? summarizeRendererSchema(draft.schema) : null;

  return (
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      <Flex justify="space-between" align="flex-start" gap={16} wrap="wrap">
        <Space wrap>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/owner/tasks")}>
            返回列表
          </Button>
          <Button icon={<SettingOutlined />} onClick={() => navigate(`/owner/tasks/${taskId}/settings`)}>
            任务设置
          </Button>
          <Button icon={<DatabaseOutlined />} onClick={() => navigate(`/owner/tasks/${taskId}/datasets`)}>
            数据集
          </Button>
          <Button icon={<AuditOutlined />} onClick={() => navigate(`/owner/tasks/${taskId}/review-config`)}>
            审核配置
          </Button>
          <Button icon={<FileProtectOutlined />} onClick={() => setPublishCheckOpen(true)}>
            发布检查
          </Button>
        </Space>
        {task && <Tag color={taskStatusMeta[task.status].color}>{taskStatusMeta[task.status].label}</Tag>}
      </Flex>

      <Card>
        <Space direction="vertical" size={6}>
          <Typography.Title level={2} style={{ margin: 0 }}>
            模板运行时预览
          </Typography.Title>
          <Typography.Text type="secondary">
            阶段 2.2 使用任务当前模板草稿渲染最小运行时，后续 Designer 和 Labeler 会复用同一份 schema。
          </Typography.Text>
          {task && <Typography.Text strong>{task.title}</Typography.Text>}
        </Space>
      </Card>

      {error && <Alert type="error" showIcon message={error} />}

      <Spin spinning={loading}>
        {draft && draft.schema.components.length > 0 ? (
          <div className="labelhub-renderer-preview-grid">
            <Card
              title={
                <Space>
                  <FormOutlined />
                  <span>Renderer</span>
                </Space>
              }
              className="labelhub-renderer-card"
            >
              <TemplateRenderer
                schema={draft.schema}
                itemPayload={previewPayload}
                value={submissionValue}
                onChange={setSubmissionValue}
              />
            </Card>
            <Space direction="vertical" size={16}>
              <Card title="Schema 摘要">
                {schemaSummary && (
                  <div className="labelhub-renderer-summary">
                    <div>
                      <Typography.Text type="secondary">物料数</Typography.Text>
                      <Typography.Title level={3}>{schemaSummary.componentCount}</Typography.Title>
                    </div>
                    <div>
                      <Typography.Text type="secondary">提交字段</Typography.Text>
                      <Typography.Title level={3}>{schemaSummary.fieldKeys.length}</Typography.Title>
                    </div>
                  </div>
                )}
                <Space size={6} wrap>
                  {schemaSummary?.fieldKeys.map((fieldKey) => <Tag key={fieldKey}>{fieldKey}</Tag>)}
                </Space>
              </Card>
              <Card title="当前提交值">
                <pre className="labelhub-json-preview">{JSON.stringify(submissionValue, null, 2)}</pre>
              </Card>
              <Card title="预览 payload">
                <pre className="labelhub-json-preview">{JSON.stringify(previewPayload, null, 2)}</pre>
              </Card>
            </Space>
          </div>
        ) : (
          <Card>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="当前模板草稿还没有物料。阶段 2.3 Designer 接入后可在此搭建并预览。"
            />
          </Card>
        )}
      </Spin>

      <OwnerPublishCheckDrawer
        taskId={taskId}
        open={publishCheckOpen}
        onClose={() => setPublishCheckOpen(false)}
        onPublished={setTask}
      />
    </Space>
  );
}
