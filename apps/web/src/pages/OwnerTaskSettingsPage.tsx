import {
  ArrowLeftOutlined,
  AuditOutlined,
  DatabaseOutlined,
  FileProtectOutlined,
  FormOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from "antd";
import { useEffect, useMemo, useState } from "react";

import { navigate } from "../app/routes";
import { createTask, getTask, updateTask } from "../features/tasks/api";
import type { CreateTaskRequest, TaskDetailVO } from "../features/tasks/types";
import { distributionStrategyOptions, formatTaskTime, parseApiDateTime, taskStatusMeta } from "../features/tasks/view";
import { buildOwnerTaskDesignerPath } from "../features/templates/view";
import { ApiClientError } from "../shared/api/client";
import type { JsonObject } from "../shared/types/api";
import { OwnerPublishCheckDrawer } from "./OwnerPublishCheckDrawer";

interface OwnerTaskSettingsPageProps {
  taskId?: string;
}

interface TaskFormValues {
  title: string;
  description?: string;
  instructionText?: string;
  tags?: string[];
  rewardText?: string;
  quota: number;
  deadlineAt?: string;
  distributionStrategy: CreateTaskRequest["distributionStrategy"];
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.payload?.error.message ?? error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "请求失败，请稍后重试。";
}

function toLocalDateTimeInput(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const date = parseApiDateTime(value);
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function toIsoDateTime(value?: string): string | null {
  if (!value) {
    return null;
  }
  return new Date(value).toISOString();
}

function plainTextFromJson(value: JsonObject | null): string {
  if (!value) {
    return "";
  }
  const content = value.content;
  return typeof content === "string" ? content : "";
}

function rewardTextFromJson(value: JsonObject | null): string {
  if (!value) {
    return "";
  }
  const description = value.description;
  return typeof description === "string" ? description : "";
}

function toPayload(values: TaskFormValues): CreateTaskRequest {
  return {
    title: values.title,
    description: values.description?.trim() || null,
    instructionRichText: values.instructionText?.trim()
      ? { format: "plain_text", content: values.instructionText.trim() }
      : null,
    tags: values.tags ?? [],
    rewardRule: values.rewardText?.trim() ? { description: values.rewardText.trim() } : null,
    quota: values.quota,
    deadlineAt: toIsoDateTime(values.deadlineAt),
    distributionStrategy: values.distributionStrategy,
  };
}

export function OwnerTaskSettingsPage({ taskId }: OwnerTaskSettingsPageProps) {
  const isCreateMode = !taskId;
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm<TaskFormValues>();
  const [task, setTask] = useState<TaskDetailVO | null>(null);
  const [loading, setLoading] = useState(!isCreateMode);
  const [submitting, setSubmitting] = useState(false);
  const [publishCheckOpen, setPublishCheckOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId) {
      return;
    }
    let ignore = false;
    const loadTask = async () => {
      setLoading(true);
      setError(null);
      try {
        const nextTask = await getTask(taskId);
        if (ignore) {
          return;
        }
        setTask(nextTask);
        form.setFieldsValue({
          title: nextTask.title,
          description: nextTask.description ?? "",
          instructionText: plainTextFromJson(nextTask.instructionRichText),
          tags: nextTask.tags,
          rewardText: rewardTextFromJson(nextTask.rewardRule),
          quota: nextTask.quota,
          deadlineAt: toLocalDateTimeInput(nextTask.deadlineAt),
          distributionStrategy: nextTask.distributionStrategy,
        });
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
    void loadTask();
    return () => {
      ignore = true;
    };
  }, [form, taskId]);

  const canEdit = isCreateMode || task?.status === "DRAFT";
  const title = isCreateMode ? "新建任务" : "任务设置";
  const statusTag = useMemo(() => {
    if (!task) {
      return null;
    }
    return <Tag color={taskStatusMeta[task.status].color}>{taskStatusMeta[task.status].label}</Tag>;
  }, [task]);

  async function handleSubmit(values: TaskFormValues) {
    setSubmitting(true);
    setError(null);
    try {
      const payload = toPayload(values);
      if (isCreateMode) {
        const created = await createTask(payload);
        message.success("任务已创建");
        navigate(`/owner/tasks/${created.id}/settings`);
        return;
      }
      if (!task || !taskId) {
        return;
      }
      const updated = await updateTask(taskId, { ...payload, version: task.version });
      setTask(updated);
      message.success("任务设置已保存");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      <Space>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/owner/tasks")}>
          返回列表
        </Button>
        {taskId && (
          <Button icon={<DatabaseOutlined />} onClick={() => navigate(`/owner/tasks/${taskId}/datasets`)}>
            数据集
          </Button>
        )}
        {taskId && (
          <Button icon={<AuditOutlined />} onClick={() => navigate(`/owner/tasks/${taskId}/review-config`)}>
            审核配置
          </Button>
        )}
        {taskId && (
          <Button icon={<FormOutlined />} onClick={() => navigate(buildOwnerTaskDesignerPath(taskId, "settings"))}>
            模板搭建
          </Button>
        )}
        {taskId && (
          <Button icon={<FileProtectOutlined />} onClick={() => setPublishCheckOpen(true)}>
            发布检查
          </Button>
        )}
        {statusTag}
      </Space>

      <Card>
        <Space direction="vertical" size={6}>
          <Typography.Title level={2} style={{ margin: 0 }}>
            {title}
          </Typography.Title>
          <Typography.Text type="secondary">
            维护任务基础信息、配额、截止时间和分发策略。状态迁移请回到任务列表操作。
          </Typography.Text>
        </Space>
      </Card>

      {error && <Alert type="error" showIcon message={error} />}

      {task && task.status !== "DRAFT" && (
        <Alert
          type="info"
          showIcon
          message="当前任务不可编辑"
          description="阶段 1.1 仅允许编辑草稿任务。已发布、暂停或已结束任务需要通过状态流转控制。"
        />
      )}

      <Spin spinning={loading}>
        <Card className="labelhub-form-card">
          <Form<TaskFormValues>
            form={form}
            layout="vertical"
            disabled={!canEdit || submitting}
            initialValues={{
              title: "",
              description: "",
              instructionText: "",
              tags: [],
              rewardText: "",
              quota: 30,
              distributionStrategy: "FIRST_COME_FIRST_SERVED",
            }}
            onFinish={(values) => void handleSubmit(values)}
          >
            <div className="labelhub-form-grid">
              <Form.Item
                label="任务标题"
                name="title"
                rules={[{ required: true, message: "请输入任务标题" }]}
              >
                <Input maxLength={120} placeholder="例如：QA 回答质量评估" />
              </Form.Item>

              <Form.Item
                label="任务配额"
                name="quota"
                rules={[{ required: true, message: "请输入任务配额" }]}
              >
                <InputNumber min={1} max={100000} style={{ width: "100%" }} />
              </Form.Item>

              <Form.Item label="截止时间" name="deadlineAt">
                <Input type="datetime-local" />
              </Form.Item>

              <Form.Item
                label="分发策略"
                name="distributionStrategy"
                rules={[{ required: true, message: "请选择分发策略" }]}
              >
                <Select options={distributionStrategyOptions} />
              </Form.Item>
            </div>

            <Form.Item label="任务描述" name="description">
              <Input.TextArea rows={3} maxLength={2000} placeholder="说明任务目标、数据范围和交付标准" />
            </Form.Item>

            <Form.Item label="富文本说明（阶段 1.1 暂以纯文本保存）" name="instructionText">
              <Input.TextArea rows={5} placeholder="给标注员看的详细作业说明" />
            </Form.Item>

            <Form.Item label="标签" name="tags">
              <Select mode="tags" tokenSeparators={[",", "，"]} placeholder="输入标签后回车" />
            </Form.Item>

            <Form.Item label="奖励规则" name="rewardText">
              <Input.TextArea rows={3} placeholder="例如：有效提交按条计费，返修不重复计费" />
            </Form.Item>

            <Space align="center" wrap>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={submitting}>
                {isCreateMode ? "创建任务" : "保存设置"}
              </Button>
              {task && (
                <Typography.Text type="secondary">
                  版本 {task.version} · 创建于 {formatTaskTime(task.createdAt)} · 更新于{" "}
                  {formatTaskTime(task.updatedAt)}
                </Typography.Text>
              )}
            </Space>
          </Form>
        </Card>
      </Spin>

      <OwnerPublishCheckDrawer
        taskId={taskId ?? null}
        open={publishCheckOpen}
        onClose={() => setPublishCheckOpen(false)}
        onPublished={setTask}
      />
    </Space>
  );
}
